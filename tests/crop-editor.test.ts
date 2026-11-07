import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { compileFunction } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';
import { clampCrop, cropFromPoints } from '../lib/capture-drafts.ts';

// Dynamic JSX/hook boundaries intentionally mirror the component runtime.
// oxlint-disable-next-line typescript/no-explicit-any
type Element = { type: unknown; props: Record<string, any> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
async function harness(locked = false) {
  // oxlint-disable-next-line typescript/no-explicit-any -- heterogeneous React hook slots
  const states: any[] = [];
  let cursor = 0;
  const selected: (string | undefined)[] = [];
  let closed = 0;
  let confirm = true;
  let confirmations = 0;
  const modules: Record<string, unknown> = {
    'react/jsx-runtime': jsxRuntime,
    react: {
      useEffect() {},
      useRef(initial: unknown) {
        const index = cursor++;
        states[index] ??= { current: initial };
        return states[index];
      },
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
    },
    'next/image': { default: 'img' },
    '@/components/ui/button': { Button: 'button' },
    '@/lib/capture-drafts': { clampCrop, cropFromPoints },
  };
  const source = await readFile(
    new URL('../components/book-crop-editor.tsx', import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  // oxlint-disable-next-line typescript/no-explicit-any -- transpiled CommonJS exports
  const exports: Record<string, any> = {};
  compileFunction(compiled, ['require', 'exports', 'window'])(
    (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
      return modules[name];
    },
    exports,
    {
      confirm: () => {
        confirmations++;
        return confirm;
      },
    },
  );
  const regions = Array.from({ length: 5 }, (_, index) => ({
    id: `book-${index}`,
    label: `Livro ${index + 1}`,
    bounds: { x: index * 0.18, y: 0.1, width: 0.15, height: 0.7 },
    locked: index === 0 && locked,
  }));
  return {
    render() {
      cursor = 0;
      return elements(
        exports.BookCropEditor({
          sourceUrl: 'fixture.jpg',
          initialBounds: regions[0].bounds,
          regions,
          selectedId: regions[0].id,
          onSelect: (id?: string) => selected.push(id),
          onCancel: () => closed++,
          onSave() {},
        }),
      );
    },
    selected,
    get closed() {
      return closed;
    },
    get confirmations() {
      return confirmations;
    },
    setConfirm(value: boolean) {
      confirm = value;
    },
  };
}
void test('crop editor exposes five selectable regions, selected state and an always-present new-book action', async () => {
  const h = await harness();
  const tree = h.render();
  const buttons = tree.filter((node) => node.type === 'button');
  const choices = buttons.filter((node) => 'aria-pressed' in node.props);
  assert.equal(choices.length, 6);
  assert.equal(choices[0].props['aria-pressed'], true);
  choices[3].props.onClick();
  choices[5].props.onClick();
  assert.deepEqual(h.selected, ['book-3', undefined]);
  const overlays = tree.filter(
    (node) => node.type === 'g' && node.props.onPointerDown,
  );
  assert.equal(overlays.length, 4);
  let stopped = false;
  overlays[1].props.onPointerDown({
    stopPropagation() {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  assert.equal(h.selected.at(-1), 'book-2');
});
void test('dirty crop changes require confirmation before switching or closing', async () => {
  const h = await harness();
  h.render()
    .find((node) => node.type === 'input')!
    .props.onChange({ target: { value: '12' } });
  let tree = h.render();
  h.setConfirm(false);
  tree
    .filter((node) => node.type === 'button' && 'aria-pressed' in node.props)[1]
    .props.onClick();
  tree
    .find((node) => node.type === 'dialog')!
    .props.onCancel({ preventDefault() {} });
  assert.equal(h.selected.length, 0);
  assert.equal(h.closed, 0);
  assert.equal(h.confirmations, 2);
  h.setConfirm(true);
  tree = h.render();
  tree
    .find((node) => node.type === 'dialog')!
    .props.onCancel({ preventDefault() {} });
  assert.equal(h.closed, 1);
});
void test('sent crop remains visible and selectable but cannot change geometry or apply', async () => {
  const h = await harness(true);
  const tree = h.render();
  assert.ok(
    tree
      .filter((node) => node.type === 'input')
      .every((node) => node.props.disabled),
  );
  const apply = tree.find(
    (node) =>
      node.type === 'button' && node.props.className?.includes('flex-1'),
  );
  assert.equal(apply?.props.disabled, true);
  tree.find((node) => node.type === 'svg')!.props.onPointerDown({});
  tree
    .filter((node) => node.type === 'button' && 'aria-pressed' in node.props)
    .at(-1)!
    .props.onClick();
  assert.deepEqual(h.selected, [undefined]);
});

void test('precise controls are collapsed by default and numbered books retain accessible names', async () => {
  const h = await harness();
  const tree = h.render();
  const details = tree.find((node) => node.type === 'details');
  assert.ok(details);
  assert.equal(details.props.open, undefined);
  assert.equal(tree.filter((node) => node.type === 'input').length, 4);
  const choices = tree.filter(
    (node) => node.type === 'button' && 'aria-pressed' in node.props,
  );
  assert.equal(choices[0].props['aria-label'], 'Livro 1: Livro 1');
});
