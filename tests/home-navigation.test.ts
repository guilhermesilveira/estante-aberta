import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { compileFunction } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
async function compile(path: string, modules: Record<string, unknown>) {
  const code = ts.transpileModule(
    await readFile(new URL(path, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports: Record<string, unknown> = {};
  compileFunction(code, ['require', 'exports'])((id: string) => {
    assert.ok(id in modules, `Unexpected import: ${id}`);
    return modules[id];
  }, exports);
  return exports;
}
void test('home account and camera links go directly to the protected page instead of restarting OAuth', async () => {
  const exports = await compile('../app/page.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'lucide-react': Object.fromEntries(
      ['BookOpen', 'Camera', 'Check', 'Library', 'Send', 'Sparkles'].map(
        (name) => [name, name],
      ),
    ),
    'next/image': { default: 'img' },
    '@/components/ui/badge': { Badge: 'span' },
    '@/components/hard-link': { HardLink: 'a' },
    '@/components/install-app': { InstallAppButton: 'InstallAppButton' },
    '@/components/terms-link': { TermsLink: 'TermsLink' },
    '@/components/ui/button': { buttonVariants: () => '' },
  });
  const tree = elements((exports.default as () => unknown)());
  const links = tree.filter((node) => node.type === 'a');
  const shelf = links.find(
    (node) => node.props['aria-label'] === 'Minha estante',
  );
  assert.equal(shelf?.props.href, '/minha-estante');
  assert.equal(
    links.filter((node) => node.props.href === '/minha-estante').length,
    2,
  );
  assert.ok(
    links.every(
      (node) => !String(node.props.href).includes('/signin-with-chatgpt'),
    ),
  );
});
void test('protected destination reuses authenticated identity and redirects only anonymous requests', async () => {
  let signedIn = true;
  const redirects: string[] = [];
  const exports = await compile('../app/chatgpt-auth.ts', {
    'next/headers': {
      headers: async () =>
        new Headers(
          signedIn
            ? {
                'oai-authenticated-user-id': 'test-viewer',
                'oai-authenticated-user-email': 'viewer@example.test',
              }
            : {},
        ),
    },
    'next/navigation': {
      redirect(path: string) {
        redirects.push(path);
        throw new Error('REDIRECT');
      },
    },
  });
  const requireUser = exports.requireChatGPTUser as (
    path: string,
  ) => Promise<{ userId: string }>;
  assert.equal((await requireUser('/minha-estante')).userId, 'test-viewer');
  assert.deepEqual(redirects, []);
  signedIn = false;
  await assert.rejects(requireUser('/minha-estante'), /REDIRECT/);
  assert.deepEqual(redirects, [
    '/signin-with-chatgpt?return_to=%2Fminha-estante',
  ]);
});
