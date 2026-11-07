import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { compileFunction } from 'node:vm';
import * as jsxRuntime from 'react/jsx-runtime';

async function pageHarness({
  signedIn = false,
  name = null,
  published = true,
}: { signedIn?: boolean; name?: string | null; published?: boolean } = {}) {
  let profilesRead = 0;
  const books = [{ id: 'book', title: 'Livro público' }];
  const shelf = { slug: 'public-shelf', name: 'Estante pública' };
  const modules: Record<string, unknown> = {
    'react/jsx-runtime': jsxRuntime,
    'next/navigation': {
      notFound() {
        throw new Error('404');
      },
      redirect() {
        throw new Error('Unexpected redirect');
      },
    },
    '@/app/chatgpt-auth': {
      getChatGPTUser: async () => (signedIn ? { userId: 'viewer' } : null),
      chatGPTSignInPath: (path: string) =>
        `/signin-with-chatgpt?return_to=${encodeURIComponent(path)}`,
      requireChatGPTUser() {
        throw new Error('Browsing must not require authentication');
      },
    },
    '@/components/public-shelf': { PublicShelf: 'PublicShelf' },
    '@/db/repository': {
      getPublicShelf: async () => (published ? { books, shelf } : null),
      getOrCreateProfileName: async () => {
        profilesRead++;
        return name;
      },
    },
  };
  const code = ts.transpileModule(
    await readFile(
      new URL('../app/e/[slug]/page.tsx', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const exports: {
    default?: (props: {
      params: Promise<{ slug: string }>;
    }) => Promise<{
      props: {
        books: unknown;
        shelf: unknown;
        viewerName: string | null;
        requestAccessHref?: string;
      };
    }>;
  } = {};
  compileFunction(code, ['require', 'exports'])((id: string) => {
    if (!(id in modules)) throw new Error(id);
    return modules[id];
  }, exports);
  return {
    render: () =>
      exports.default!({ params: Promise.resolve({ slug: 'public-shelf' }) }),
    books,
    shelf,
    profilesRead: () => profilesRead,
  };
}
void test('anonymous visitor sees published books without login or profile creation', async () => {
  const h = await pageHarness();
  const page = await h.render();
  assert.equal(page.props.books, h.books);
  assert.equal(page.props.shelf, h.shelf);
  assert.equal(page.props.viewerName, null);
  assert.equal(
    page.props.requestAccessHref,
    '/signin-with-chatgpt?return_to=%2Fe%2Fpublic-shelf',
  );
  assert.equal(h.profilesRead(), 0);
});
void test('signed-in visitor without a profile can browse before completing name for a request', async () => {
  const h = await pageHarness({ signedIn: true });
  const page = await h.render();
  assert.equal(page.props.books, h.books);
  assert.equal(
    page.props.requestAccessHref,
    '/cadastro?return_to=%2Fe%2Fpublic-shelf',
  );
});
void test('ready signed-in visitor retains existing request flow', async () => {
  const h = await pageHarness({ signedIn: true, name: 'Ana' });
  const page = await h.render();
  assert.equal(page.props.viewerName, 'Ana');
  assert.equal(page.props.requestAccessHref, undefined);
});
void test('private or missing shelf does not become visible to anonymous visitors', async () => {
  const h = await pageHarness({ published: false });
  await assert.rejects(h.render(), /404/);
  assert.equal(h.profilesRead(), 0);
});
