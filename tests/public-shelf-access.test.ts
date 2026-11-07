import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { publicShelfFromRow } from '../lib/public-shelf-data.ts';

async function loadModule(path: string, modules: Record<string, unknown>) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports: Record<string, unknown> = {};
  compileFunction(compiled, ['require', 'exports'])((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE shelves (id TEXT, owner_id TEXT, owner_email TEXT, owner_name TEXT, name TEXT, slug TEXT, intro TEXT, published INTEGER);
    CREATE TABLE books (id TEXT, shelf_id TEXT, photo_batch_id TEXT, title TEXT, author TEXT, availability TEXT, status TEXT, position INTEGER, created_at INTEGER);
    CREATE TABLE photo_batches (id TEXT, shelf_id TEXT, owner_id TEXT, storage_key TEXT, content_type TEXT, status TEXT);
    INSERT INTO shelves VALUES ('public','owner','private@example.com','Ana Lima','Estante pública','public-slug','Livros compartilhados',1);
    INSERT INTO shelves VALUES ('private','owner','private@example.com','Ana Lima','Estante privada','private-slug','Não publicar',0);
  `);
  for (const shelf of ['public', 'private']) {
    for (const [position, status] of [
      'available',
      'reserved',
      'loaned',
      'given',
      'removed',
    ].entries()) {
      const id = `${shelf}-${status}`;
      sqlite
        .prepare('INSERT INTO books VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          id,
          shelf,
          id,
          `Livro ${status}`,
          '',
          'loan',
          status,
          position,
          100,
        );
      sqlite
        .prepare('INSERT INTO photo_batches VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, shelf, 'owner', `photos/${id}`, 'image/jpeg', 'sanitized');
    }
  }
  const DB = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      return {
        bind(...next: SQLInputValue[]) {
          values = next;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          return sqlite.prepare(sql).run(...values);
        },
      };
    },
  };
  return { sqlite, DB };
}

void test('public shelf repository returns published shelves and public book statuses without owner identifiers', async () => {
  const { sqlite, DB } = fixture();
  try {
    const repository = await loadModule('../db/repository.ts', {
      'cloudflare:workers': { env: { DB } },
      '@/lib/person-name': {},
      '@/lib/public-shelf-data': { publicShelfFromRow },
      '@/lib/photo-metadata': {},
    });
    const getPublicShelf = repository.getPublicShelf as (
      slug: string,
    ) => Promise<{
      shelf: Record<string, unknown>;
      books: { status: string }[];
    } | null>;
    const published = await getPublicShelf('public-slug');
    assert.ok(published);
    assert.deepEqual(
      published.books.map((book) => book.status),
      ['available', 'reserved', 'loaned'],
    );
    assert.equal(await getPublicShelf('private-slug'), null);
    assert.equal(await getPublicShelf('missing'), null);
    assert.equal(
      JSON.stringify(published).includes('private@example.com'),
      false,
    );
    assert.equal('ownerId' in published.shelf, false);
    assert.equal('ownerEmail' in published.shelf, false);
  } finally {
    sqlite.close();
  }
});

void test('photo route serves published book photos anonymously but hides private, removed and given photos', async () => {
  const { sqlite, DB } = fixture();
  let user: { userId: string } | null = null;
  const sanitized: string[] = [];
  try {
    const route = await loadModule('../app/api/photos/[id]/route.ts', {
      '@/app/chatgpt-auth': { getChatGPTUser: async () => user },
      '@/db/repository': {
        ensureSchema: async () => undefined,
        getRuntimeEnv: () => ({ DB }),
        sanitizeStoredPhoto: async ({ id }: { id: string }) => {
          sanitized.push(id);
          return { bytes: new Uint8Array([1, 2, 3]), etag: 'fixture' };
        },
      },
    });
    const GET = route.GET as (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
    const get = (id: string) =>
      GET(new Request('https://example.test/api/photos/' + id), {
        params: Promise.resolve({ id }),
      });
    for (const status of ['available', 'reserved', 'loaned']) {
      const response = await get(`public-${status}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('content-type'), 'image/jpeg');
      assert.deepEqual(
        new Uint8Array(await response.arrayBuffer()),
        new Uint8Array([1, 2, 3]),
      );
    }
    for (const id of [
      'private-available',
      'public-given',
      'public-removed',
      'missing',
    ])
      assert.equal((await get(id)).status, 404);
    user = { userId: 'other-user' };
    assert.equal((await get('private-available')).status, 404);
    user = { userId: 'owner' };
    assert.equal((await get('private-available')).status, 200);
    assert.equal((await get('private-removed')).status, 404);
    assert.deepEqual(sanitized, [
      'public-available',
      'public-reserved',
      'public-loaned',
      'private-available',
    ]);
  } finally {
    sqlite.close();
  }
});

void test('anonymous visitors cannot create requests or modify shelves, books and request status', async () => {
  const forbidden = () => {
    throw new Error('Anonymous request reached private data');
  };
  for (const [path, method] of [
    ['../app/api/requests/route.ts', 'POST'],
    ['../app/api/shelf/route.ts', 'PATCH'],
    ['../app/api/requests/[id]/route.ts', 'PATCH'],
    ['../app/api/books/[id]/route.ts', 'PATCH'],
  ]) {
    const loaded = await loadModule(path, {
      'cloudflare:workers': { waitUntil: forbidden },
      '@/app/chatgpt-auth': { getChatGPTUser: async () => null },
      '@/db/repository': {
        ensureSchema: forbidden,
        getOrCreateProfileName: forbidden,
        getOrCreateShelf: forbidden,
        getRuntimeEnv: forbidden,
      },
      '@/lib/web-push': {
        sendNewRequestNotifications: forbidden,
        sendRequestStatusNotifications: forbidden,
      },
      '@/lib/book-title': {},
    });
    const handler = loaded[method] as (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
    const response = await handler(
      new Request('https://example.test/private', { method, body: '{}' }),
      { params: Promise.resolve({ id: 'book' }) },
    );
    assert.equal(response.status, 401, path);
  }
});

void test('owner pages require authentication before loading shelf or request data', async () => {
  for (const path of [
    '../app/minha-estante/page.tsx',
    '../app/minha-estante/confirmados/page.tsx',
  ]) {
    const authError = new Error('login required');
    let authCalls = 0;
    const forbidden = () => {
      throw new Error('Private data accessed before login');
    };
    const loaded = await loadModule(path, {
      'react/jsx-runtime': {},
      'lucide-react': {},
      'next/navigation': {},
      'next/link': {},
      '@/app/chatgpt-auth': {
        requireChatGPTUser: async () => {
          authCalls++;
          throw authError;
        },
      },
      '@/components/brand': {},
      '@/components/book-uploader': {},
      '@/components/install-app': {},
      '@/components/owner-library': {},
      '@/components/request-list': {},
      '@/components/terms-link': {},
      '@/components/ui/button': {},
      '@/db/repository': {
        getOrCreateProfileName: forbidden,
        getOrCreateShelf: forbidden,
        getOwnerBooks: forbidden,
        getOwnerRequests: forbidden,
        sanitizeOwnerPhotos: forbidden,
      },
    });
    await assert.rejects(
      (loaded.default as () => Promise<unknown>)(),
      (error) => error === authError,
    );
    assert.equal(authCalls, 1);
  }
});
