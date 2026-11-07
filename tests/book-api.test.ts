import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { parseBookUploadId, sanitizeBookTitle } from '../lib/book-title.ts';
import { stripImageMetadata } from '../lib/photo-metadata.ts';

// Execute the actual handlers with injected auth/D1/R2 boundaries, without a Worker runtime.
async function harness(route: string) {
  const books = new Map<string, Record<string, unknown>>();
  const files = new Map<string, Uint8Array>();
  let user: { userId: string } | null = { userId: 'owner' };
  let timeoutAfterCommit = false;
  let beforeUpdate: (() => Promise<void>) | null = null;
  const db = {
    prepare(sql: string) {
      return {
        sql,
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values;
          return this;
        },
        async first() {
          if (sql.startsWith('UPDATE')) {
            const wait = beforeUpdate;
            beforeUpdate = null;
            if (wait) await wait();
            const fieldNames =
              sql
                .slice(sql.indexOf('SET ') + 4, sql.indexOf(' WHERE'))
                .match(/(?:title|availability|status|updated_at)(?= =)/g) ?? [];
            const offset = fieldNames.length;
            const book = books.get(String(this.values[offset]));
            if (
              !book ||
              book.owner_id !== this.values[offset + 1] ||
              book.status === 'removed' ||
              (sql.includes('AND updated_at = ?') &&
                book.updated_at !== this.values[offset + 3])
            )
              return null;
            for (const [index, name] of fieldNames.entries()) {
              book[name] =
                name === 'updated_at'
                  ? Math.max(
                      Number(this.values[index]),
                      Number(book.updated_at) + 1,
                    )
                  : this.values[index];
            }
            return { updated_at: book.updated_at };
          }
          if (sql.includes('WHERE owner_id'))
            return (
              [...books.values()].find((b) => b.owner_id === this.values[0]) ??
              null
            );
          const book = books.get(String(this.values[0]));
          if (
            sql.includes('AND owner_id') &&
            (book?.owner_id !== this.values[1] || book?.status === 'removed')
          )
            return null;
          return book ? { ...book } : null;
        },
        async run() {
          const book = books.get(String(this.values.at(-2)));
          if (book && book.owner_id === this.values.at(-1)) {
            if (sql.includes('title = ?')) book.title = this.values[0];
          }
          return { meta: { changes: book ? 1 : 0 } };
        },
      };
    },
    async batch(statements: Array<{ values: unknown[] }>) {
      const [id, , owner, photo, title, availability, , updatedAt] =
        statements[1].values;
      if (books.has(String(id))) throw new Error('UNIQUE');
      books.set(String(id), {
        id,
        owner_id: owner,
        photo_batch_id: photo,
        title,
        availability,
        updated_at: updatedAt,
        status: 'available',
      });
      if (timeoutAfterCommit) throw new Error('timeout');
    },
  };
  const dependencies = {
    getChatGPTUser: async () => user,
    getOrCreateProfileName: async () => 'Owner',
    getOrCreateShelf: async () => ({ id: 'shelf' }),
    ensureSchema: async () => undefined,
    getRuntimeEnv: () => ({
      DB: db,
      FILES: {
        put: async (key: string, bytes: Uint8Array) => {
          files.set(key, bytes);
        },
        delete: async (key: string) => {
          files.delete(key);
        },
      },
    }),
    parseBookUploadId,
    sanitizeBookTitle,
    stripImageMetadata,
  };
  const source = (
    await readFile(new URL(route, import.meta.url), 'utf8')
  ).replace(/import[\s\S]*?from '[^']+';/g, '');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {};
  // Test-only dependency injection of trusted repository source.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(...Object.keys(dependencies), 'exports', compiled)(
    ...Object.values(dependencies),
    exports,
  );
  return {
    exports,
    books,
    files,
    pauseNextUpdate() {
      let release!: () => void;
      let reached!: () => void;
      const paused = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      beforeUpdate = () => {
        reached();
        return gate;
      };
      return { paused, release };
    },
    setUser(value: typeof user) {
      user = value;
    },
    setTimeoutAfterCommit() {
      timeoutAfterCommit = true;
    },
  };
}
const uploadId = 'a535067e-95de-4aec-843c-58c039648ac5';
function upload(title?: string, id: string | null = uploadId) {
  const body = new FormData();
  body.set('availability', 'loan');
  body.set(
    'photo',
    new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])],
      'cover.jpg',
      { type: 'image/jpeg' },
    ),
  );
  if (title !== undefined) body.set('title', title);
  if (id !== null) body.set('uploadId', id);
  return new Request('https://example.test/api/books', {
    method: 'POST',
    body,
  });
}
void test('POST preserves photo-only clients and stores optional sanitized titles', async () => {
  const h = await harness('../app/api/books/route.ts');
  assert.equal((await h.exports.POST(upload(undefined, null))).status, 201);
  assert.equal([...h.books.values()][0].title, 'Livro fotografado');
  assert.equal((await h.exports.POST(upload(' <b>Um livro</b> '))).status, 201);
  assert.equal(h.books.get(uploadId)?.title, 'Um livro');
});
void test('POST replay and concurrent retries produce one book and one photo', async () => {
  const h = await harness('../app/api/books/route.ts');
  const responses = await Promise.all([
    h.exports.POST(upload('Original')),
    h.exports.POST(upload('Original')),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status).sort((a, b) => a - b),
    [200, 201],
  );
  assert.equal(h.books.size, 1);
  assert.equal(h.files.size, 1);
  assert.equal(
    (await h.exports.POST(upload('Must not overwrite'))).status,
    200,
  );
  assert.equal(h.books.get(uploadId)?.title, 'Original');
});
void test('POST recovers committed timeout without deleting its image', async () => {
  const h = await harness('../app/api/books/route.ts');
  h.setTimeoutAfterCommit();
  assert.equal((await h.exports.POST(upload())).status, 200);
  assert.equal(h.books.size, 1);
  assert.equal(h.files.size, 1);
});
void test('POST guards auth, invalid inputs, removed books and foreign IDs', async () => {
  const h = await harness('../app/api/books/route.ts');
  assert.equal((await h.exports.POST(upload('x'.repeat(201)))).status, 400);
  assert.equal((await h.exports.POST(upload('Book', '../id'))).status, 400);
  h.books.set(uploadId, {
    id: uploadId,
    owner_id: 'someone-else',
    photo_batch_id: 'secret',
    status: 'available',
  });
  const foreign = await h.exports.POST(upload());
  assert.equal(foreign.status, 409);
  assert.equal(JSON.stringify(await foreign.json()).includes('secret'), false);
  h.books.set(uploadId, { owner_id: 'owner', status: 'removed' });
  assert.equal((await h.exports.POST(upload())).status, 409);
  h.setUser(null);
  assert.equal((await h.exports.POST(upload())).status, 401);
});
void test('PATCH titles are owner-only, validated and coexist with status updates', async () => {
  const h = await harness('../app/api/books/[id]/route.ts');
  h.books.set(uploadId, {
    id: uploadId,
    owner_id: 'owner',
    status: 'available',
    updated_at: 100,
    title: 'Original',
    availability: 'loan',
  });
  const patch = (body: unknown) =>
    h.exports.PATCH(
      new Request('https://example.test', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: uploadId }) },
    );
  assert.equal((await patch({ title: '  Livro\nnovo ' })).status, 200);
  assert.equal(h.books.get(uploadId)?.title, 'Livro novo');
  for (const body of [null, [], { title: null }, { title: 'x'.repeat(201) }])
    assert.equal((await patch(body)).status, 400);
  assert.equal((await patch({ status: 'reserved' })).status, 200);
  h.setUser({ userId: 'other' });
  assert.equal((await patch({ title: 'No' })).status, 404);
});

void test('POST creation and replay return the stored title, availability and version', async () => {
  const h = await harness('../app/api/books/route.ts');
  const created = (await (await h.exports.POST(upload('Original'))).json()) as {
    title: string;
    availability: string;
    updatedAt: number;
  };
  assert.equal(created.title, 'Original');
  assert.equal(created.availability, 'loan');
  assert.equal(typeof created.updatedAt, 'number');
  Object.assign(h.books.get(uploadId)!, {
    title: 'Manual',
    availability: 'donation',
    updated_at: created.updatedAt + 1,
  });
  const replay = (await (await h.exports.POST(upload('Old OCR'))).json()) as {
    title: string;
    availability: string;
    updatedAt: number;
  };
  assert.equal(replay.title, 'Manual');
  assert.equal(replay.availability, 'donation');
  assert.equal(replay.updatedAt, created.updatedAt + 1);
});

void test('late OCR PATCH cannot overwrite a newer manual write; conflict can be reconciled', async () => {
  const h = await harness('../app/api/books/[id]/route.ts');
  const version = Date.now() + 100000;
  h.books.set(uploadId, {
    id: uploadId,
    owner_id: 'owner',
    status: 'available',
    title: 'Original',
    availability: 'loan',
    updated_at: version,
  });
  const patch = (body: unknown) =>
    h.exports.PATCH(
      new Request('https://example.test', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: uploadId }) },
    );
  const gate = h.pauseNextUpdate();
  const late = patch({ title: 'Old OCR', expectedUpdatedAt: version });
  await gate.paused;
  const newer = await patch({
    title: 'Manual',
    availability: 'donation',
    expectedUpdatedAt: version,
  });
  assert.deepEqual(await newer.json(), { ok: true, updatedAt: version + 1 });
  gate.release();
  const conflict = await late;
  assert.equal(conflict.status, 409);
  const state = (await conflict.json()) as {
    title: string;
    availability: string;
    updatedAt: number;
  };
  assert.equal(state.title, 'Manual');
  assert.equal(state.availability, 'donation');
  assert.equal(state.updatedAt, version + 1);
  assert.equal(h.books.get(uploadId)?.title, 'Manual');
  const reconciled = await patch({
    title: 'Newest manual',
    expectedUpdatedAt: state.updatedAt,
  });
  assert.deepEqual(await reconciled.json(), {
    ok: true,
    updatedAt: version + 2,
  });
  const legacy = await patch({ status: 'reserved' });
  assert.deepEqual(await legacy.json(), { ok: true, updatedAt: version + 3 });
  for (const expectedUpdatedAt of [
    null,
    '1',
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.equal(
      (await patch({ title: 'Invalid', expectedUpdatedAt })).status,
      400,
    );
  }
  h.setUser({ userId: 'other' });
  const foreign = await patch({ title: 'No', expectedUpdatedAt: version });
  assert.equal(foreign.status, 404);
  assert.equal(
    JSON.stringify(await foreign.json()).includes('Newest manual'),
    false,
  );
});
