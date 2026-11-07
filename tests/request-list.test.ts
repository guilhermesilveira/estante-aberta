import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { compileFunction } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';
import type { BookRequest } from '../db/repository.ts';

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function request(id: string, status: BookRequest['status']): BookRequest {
  return {
    id,
    status,
    requesterName: id,
    createdAt: 1,
    books: [{ id: `book-${id}`, photoBatchId: null, availability: 'donation' }],
  };
}

// Run the real component and event handlers with controlled hook/network boundaries.
async function harness(
  initialRequests: BookRequest[],
  status: 'pending' | 'accepted' = 'pending',
) {
  const states: unknown[] = [];
  let cursor = 0;
  let refreshes = 0;
  let respond: () => Promise<Response> = async () =>
    Response.json({ ok: true });
  const calls: Array<{ url: string; body: unknown }> = [];
  const modules: Record<string, unknown> = {
    'react/jsx-runtime': jsxRuntime,
    react: {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in states))
          states[index] = typeof initial === 'function' ? initial() : initial;
        return [
          states[index],
          (next: unknown) => {
            states[index] =
              typeof next === 'function' ? next(states[index]) : next;
          },
        ];
      },
    },
    'next/navigation': {
      useRouter: () => ({
        refresh: () => {
          refreshes++;
        },
      }),
    },
    'next/image': { default: 'img' },
    'lucide-react': Object.fromEntries(
      [
        'BookOpen',
        'Check',
        'Clock3',
        'LoaderCircle',
        'PackageCheck',
        'ShieldAlert',
        'X',
      ].map((name) => [name, name]),
    ),
    '@/components/ui/badge': { Badge: 'span' },
    '@/components/ui/button': { Button: 'button' },
    '@/components/terms-link': { TermsLink: 'a' },
  };
  const source = await readFile(
    new URL('../components/request-list.tsx', import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports: { RequestList?: (props: unknown) => unknown } = {};
  compileFunction(code, ['require', 'exports', 'fetch'])(
    (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
    exports,
    async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return respond();
    },
  );
  return {
    render(requests = initialRequests) {
      cursor = 0;
      return elements(
        exports.RequestList!({ initialRequests: requests, status }),
      );
    },
    respondWith(fn: () => Promise<Response>) {
      respond = fn;
    },
    refreshes: () => refreshes,
    calls,
  };
}
function cards(tree: Element[]) {
  return tree.filter((e) => e.type === 'article').map((e) => e.props.id);
}
function action(tree: Element[], text: string) {
  const button = tree.find(
    (e) =>
      e.type === 'button' && JSON.stringify(e.props.children).includes(text),
  );
  assert.ok(button, `Missing button ${text}`);
  return button.props.onClick as () => Promise<void>;
}

void test('main list displays only pending requests, including after a reload', async () => {
  const data = ['pending', 'accepted', 'declined', 'completed'].map((s) =>
    request(s, s as BookRequest['status']),
  );
  for (let reload = 0; reload < 2; reload++) {
    const ui = await harness(data);
    assert.deepEqual(cards(ui.render()), ['pedido-pending']);
  }
});

void test('decline removes the card immediately after success and refreshes the counter', async () => {
  const ui = await harness([
    request('one', 'pending'),
    request('two', 'pending'),
  ]);
  await action(ui.render(), 'Não disponível')();
  assert.deepEqual(cards(ui.render()), ['pedido-two']);
  assert.deepEqual(ui.calls, [
    { url: '/api/requests/one', body: { status: 'declined' } },
  ]);
  assert.equal(ui.refreshes(), 1);
});

void test('last pending request disappears on confirmation and shows the empty state', async () => {
  const ui = await harness([request('one', 'pending')]);
  await action(ui.render(), 'Confirmar')();
  const tree = ui.render();
  assert.deepEqual(cards(tree), []);
  assert.ok(JSON.stringify(tree).includes('Nenhum pedido pendente'));
  assert.deepEqual(ui.calls[0].body, {
    status: 'accepted',
    bookIds: ['book-one'],
  });
});

void test('failed decline preserves the card and selection so the user can retry', async () => {
  const ui = await harness([request('one', 'pending')]);
  ui.respondWith(async () =>
    Response.json({ error: 'Falha temporária' }, { status: 500 }),
  );
  await action(ui.render(), 'Não disponível')();
  assert.deepEqual(cards(ui.render()), ['pedido-one']);
  assert.ok(
    ui
      .render()
      .some(
        (e) =>
          e.props.role === 'alert' && e.props.children === 'Falha temporária',
      ),
  );
  assert.equal(ui.refreshes(), 0);
  ui.respondWith(async () => Response.json({ ok: true }));
  await action(ui.render(), 'Não disponível')();
  assert.deepEqual(cards(ui.render()), []);
});

void test('new server props appear without remounting and removed requests stay removed', async () => {
  const ui = await harness([request('one', 'pending')]);
  await action(ui.render(), 'Não disponível')();
  const tree = ui.render([
    request('one', 'pending'),
    request('new', 'pending'),
  ]);
  assert.deepEqual(cards(tree), ['pedido-new']);
  await action(tree, 'Confirmar')();
  assert.deepEqual(ui.calls[1].body, {
    status: 'accepted',
    bookIds: ['book-new'],
  });
});

void test('confirmed page preserves delivery action and removes completed cards', async () => {
  const ui = await harness(
    [
      request('one', 'accepted'),
      request('old', 'completed'),
      request('new', 'pending'),
    ],
    'accepted',
  );
  assert.deepEqual(cards(ui.render()), ['pedido-one']);
  await action(ui.render(), 'Marcar como entregue')();
  assert.deepEqual(cards(ui.render()), []);
  assert.deepEqual(ui.calls[0].body, { status: 'completed' });
});

void test('status buttons stay disabled while the update is pending', async () => {
  const ui = await harness([
    request('one', 'pending'),
    request('two', 'pending'),
  ]);
  let resolve: (value: Response) => void = () => {};
  ui.respondWith(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const pending = action(ui.render(), 'Não disponível')();
  const buttons = ui
    .render()
    .filter((e) => e.type === 'button' && !('aria-pressed' in e.props));
  assert.ok(buttons.every((e) => e.props.disabled === true));
  resolve(Response.json({ ok: true }));
  await pending;
  assert.deepEqual(cards(ui.render()), ['pedido-two']);
});
