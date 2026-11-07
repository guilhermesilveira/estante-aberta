import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const el = node as Element;
  return [el, ...elements(el.props.children)];
}
async function harness(saved: string | null = null, blocked = false) {
  const states: unknown[] = [];
  let cursor = 0;
  const storage = {
    getItem() {
      if (blocked) throw new Error('Storage denied');
      return saved;
    },
    setItem(_key: string, value: string) {
      if (blocked) throw new Error('Storage denied');
      saved = value;
    },
  };
  const modules: Record<string, unknown> = {
    'react/jsx-runtime': jsxRuntime,
    react: {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          (next: unknown) => {
            states[index] =
              typeof next === 'function' ? next(states[index]) : next;
          },
        ];
      },
      useMemo: (fn: () => unknown) => fn(),
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) =>
        snapshot(),
    },
    'next/image': { default: 'img' },
    'lucide-react': Object.fromEntries(
      [
        'BookOpen',
        'Check',
        'Copy',
        'MessageCircle',
        'LayoutGrid',
        'Table2',
        'RotateCcw',
        'ShieldAlert',
        'Trash2',
      ].map((name) => [name, name]),
    ),
    '@/components/ui/button': { Button: 'button' },
    '@/lib/install-app': { requestAppInstall() {} },
  };
  const source = await readFile(
    new URL('../components/owner-library.tsx', import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports: Record<string, unknown> = {};
  compileFunction(code, ['require', 'exports', 'localStorage', 'window'])(
    (name: string) => modules[name],
    exports,
    storage,
    { location: { origin: 'https://example.com' } },
  );
  const component = exports.OwnerLibrary as (props: unknown) => unknown;
  const books = ['available', 'loaned', 'reserved', 'given'].map(
    (status, index) => ({
      id: `${index}`,
      title: `Livro ${index}`,
      availability: 'loan',
      photoBatchId: null,
      status,
    }),
  );
  return {
    render() {
      cursor = 0;
      return elements(component({ initialBooks: books, shelfSlug: 'test' }));
    },
    saved() {
      return saved;
    },
  };
}
void test('cards/table toggle preserves books, switches and action parity and saves preference', async () => {
  const app = await harness();
  let nodes = app.render();
  assert.equal(nodes.filter((n) => n.type === 'article').length, 4);
  const controls = (list: Element[]) =>
    list.filter(
      (n) => n.type === 'button' && n.props['aria-controls'] !== 'owner-books',
    );
  const before = controls(nodes).length;
  const toggle = nodes.find(
    (n) =>
      n.type === 'button' &&
      n.props['aria-controls'] === 'owner-books' &&
      JSON.stringify(n.props.children).includes('Tabela'),
  )!;
  (toggle.props.onClick as () => void)();
  nodes = app.render();
  assert.equal(nodes.filter((n) => n.type === 'table').length, 1);
  assert.equal(nodes.filter((n) => n.props.scope === 'row').length, 4);
  assert.equal(controls(nodes).length, before);
  assert.equal(
    nodes.filter((n) => n.props.role === 'switch' && n.props.disabled === true)
      .length,
    3,
  );
  assert.equal(app.saved(), 'table');
});
void test('stored table restores and invalid/blocked storage safely defaults to cards', async () => {
  assert.equal(
    (await harness('table')).render().filter((n) => n.type === 'table').length,
    1,
  );
  for (const app of [await harness('invalid'), await harness('table', true)]) {
    const nodes = app.render();
    assert.equal(nodes.filter((n) => n.type === 'article').length, 4);
    const toggle = nodes.find(
      (n) =>
        n.type === 'button' &&
        n.props['aria-controls'] === 'owner-books' &&
        JSON.stringify(n.props.children).includes('Tabela'),
    )!;
    (toggle.props.onClick as () => void)();
    assert.equal(app.render().filter((n) => n.type === 'table').length, 1);
  }
});
