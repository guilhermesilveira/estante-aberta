import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';

// oxlint-disable-next-line typescript/no-explicit-any -- JSX runtime boundary
type Element = { type: unknown; props: Record<string, any> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
async function harness() {
  // oxlint-disable-next-line typescript/no-explicit-any -- heterogeneous hook state
  const states: any[] = [];
  let cursor = 0;
  const hooks = {
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
  };
  const source = await readFile(
    new URL('../components/book-uploader.tsx', import.meta.url),
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
  compileFunction(compiled, ['require', 'exports'])((name: string) => {
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name === 'react') return hooks;
    // Components are inert elements and no side effects run in this render test.
    return new Proxy(
      {},
      {
        get: (_target, key) => (key === 'MAX_CAPTURE_PHOTOS' ? 8 : String(key)),
      },
    );
  }, exports);
  return {
    render() {
      cursor = 0;
      return elements(exports.BookUploader({ defaultOpen: true }));
    },
  };
}
void test('capture and local recognition settings are gated behind an explicit modality choice', async () => {
  const h = await harness();
  let tree = h.render();
  assert.equal(
    tree.some((node) => node.type === 'RecognitionSettings'),
    false,
  );
  assert.equal(
    tree.some((node) => node.type === 'Camera'),
    false,
  );
  const choices = tree.filter(
    (node) => node.type === 'Button' && 'aria-pressed' in node.props,
  );
  assert.equal(choices.length, 2);
  assert.ok(choices.every((node) => node.props['aria-pressed'] === false));
  choices[1].props.onClick();
  tree = h.render();
  assert.equal(
    tree.some((node) => node.type === 'Camera'),
    true,
  );
  assert.equal(
    tree.some((node) => node.type === 'FileUp'),
    true,
  );
  assert.equal(
    tree.some((node) => node.type === 'RecognitionSettings'),
    true,
  );
  let updatedChoices = tree.filter(
    (node) => node.type === 'Button' && 'aria-pressed' in node.props,
  );
  assert.equal(updatedChoices[1].props['aria-pressed'], true);
  updatedChoices[0].props.onClick();
  updatedChoices = h
    .render()
    .filter((node) => node.type === 'Button' && 'aria-pressed' in node.props);
  assert.equal(updatedChoices[0].props['aria-pressed'], true);
  assert.equal(updatedChoices[1].props['aria-pressed'], false);
});
