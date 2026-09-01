import { env } from 'cloudflare:workers';

import type { ChatGPTUser } from '@/app/chatgpt-auth';

export type Shelf = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  name: string;
  slug: string;
  intro: string;
  published: boolean;
};

export type Book = {
  id: string;
  shelfId: string;
  photoBatchId: string | null;
  title: string;
  author: string;
  availability: 'loan' | 'donation';
  status: 'available' | 'reserved' | 'loaned' | 'given' | 'removed';
  position: number;
};

export type BookRequest = {
  id: string;
  requesterName: string;
  requesterContact: string;
  note: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: number;
  books: Array<{
    id: string;
    photoBatchId: string | null;
    availability: 'loan' | 'donation';
  }>;
};

type RuntimeEnv = Cloudflare.Env & {
  DB: D1Database;
  FILES: R2Bucket;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as RuntimeEnv;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS shelves (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    intro TEXT NOT NULL DEFAULT 'Escolha os livros que você gostaria de receber.',
    published INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shelves_owner_id ON shelves(owner_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shelves_slug ON shelves(slug)`,
  `CREATE TABLE IF NOT EXISTS photo_batches (
    id TEXT PRIMARY KEY NOT NULL,
    shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    status TEXT NOT NULL,
    book_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_photo_batches_shelf_id ON photo_batches(shelf_id)`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY NOT NULL,
    shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL,
    photo_batch_id TEXT REFERENCES photo_batches(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    availability TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_books_shelf_status ON books(shelf_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_books_owner_id ON books(owner_id)`,
  `CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY NOT NULL,
    shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    requester_name TEXT NOT NULL,
    requester_contact TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_requests_shelf_status ON requests(shelf_id, status)`,
  `CREATE TABLE IF NOT EXISTS request_books (
    request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    PRIMARY KEY(request_id, book_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_request_books_book_id ON request_books(book_id)`,
  `UPDATE shelves
   SET intro = 'Escolha os livros que você gostaria de receber.'
   WHERE intro = 'Escolha os livros que você gostaria de receber no nosso próximo encontro.'`,
  `UPDATE shelves SET published = 1 WHERE published = 0`,
];

let schemaReady: Promise<void> | null = null;

export async function ensureSchema() {
  if (!schemaReady) {
    const db = getRuntimeEnv().DB;
    schemaReady = db
      .batch(schemaStatements.map((statement) => db.prepare(statement)))
      .then(async () => {
        await db.prepare('PRAGMA optimize').run();
      })
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

function shelfFromRow(row: Record<string, unknown>): Shelf {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    ownerName: String(row.owner_name),
    ownerEmail: String(row.owner_email),
    name: String(row.name),
    slug: String(row.slug),
    intro: String(row.intro),
    published: Boolean(row.published),
  };
}

function optionalText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function bookFromRow(row: Record<string, unknown>): Book {
  return {
    id: String(row.id),
    shelfId: String(row.shelf_id),
    photoBatchId:
      typeof row.photo_batch_id === 'string' ? row.photo_batch_id : null,
    title: String(row.title),
    author: optionalText(row.author),
    availability: row.availability === 'donation' ? 'donation' : 'loan',
    status: String(row.status) as Book['status'],
    position: Number(row.position ?? 0),
  };
}

function slugPart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
}

function randomCode(length = 6) {
  return crypto.randomUUID().replace(/-/g, '').slice(0, length);
}

export async function getOrCreateShelf(user: ChatGPTUser): Promise<Shelf> {
  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const existing = await db
    .prepare('SELECT * FROM shelves WHERE owner_id = ? LIMIT 1')
    .bind(user.userId)
    .first<Record<string, unknown>>();
  if (existing) return shelfFromRow(existing);

  const now = Date.now();
  const id = crypto.randomUUID();
  const displayName = user.fullName ?? user.email.split('@')[0] ?? 'Leitor';
  const name = `Estante de ${displayName}`;
  const slug = `${slugPart(displayName) || 'estante'}-${randomCode()}`;
  await db
    .prepare(
      `INSERT INTO shelves
       (id, owner_id, owner_name, owner_email, name, slug, intro, published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      id,
      user.userId,
      displayName,
      user.email,
      name,
      slug,
      'Escolha os livros que você gostaria de receber.',
      now,
      now,
    )
    .run();

  return {
    id,
    ownerId: user.userId,
    ownerName: displayName,
    ownerEmail: user.email,
    name,
    slug,
    intro: 'Escolha os livros que você gostaria de receber.',
    published: true,
  };
}

export async function getOwnerBooks(userId: string): Promise<Book[]> {
  await ensureSchema();
  const result = await getRuntimeEnv()
    .DB.prepare(
      `SELECT * FROM books WHERE owner_id = ? AND status != 'removed' ORDER BY created_at DESC, position ASC`,
    )
    .bind(userId)
    .all<Record<string, unknown>>();
  return result.results.map(bookFromRow);
}

export async function getOwnerRequests(
  shelfId: string,
): Promise<BookRequest[]> {
  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const requestRows = await db
    .prepare(
      'SELECT * FROM requests WHERE shelf_id = ? ORDER BY created_at ASC',
    )
    .bind(shelfId)
    .all<Record<string, unknown>>();
  const results: BookRequest[] = [];

  for (const row of requestRows.results) {
    const bookRows = await db
      .prepare(
        `SELECT books.id, books.photo_batch_id, books.availability
         FROM request_books JOIN books ON books.id = request_books.book_id
         WHERE request_books.request_id = ? ORDER BY books.title`,
      )
      .bind(String(row.id))
      .all<Record<string, unknown>>();
    results.push({
      id: String(row.id),
      requesterName: String(row.requester_name),
      requesterContact: optionalText(row.requester_contact),
      note: optionalText(row.note),
      status: String(row.status) as BookRequest['status'],
      createdAt: Number(row.created_at),
      books: bookRows.results.map((book) => ({
        id: String(book.id),
        photoBatchId:
          typeof book.photo_batch_id === 'string' ? book.photo_batch_id : null,
        availability: book.availability === 'donation' ? 'donation' : 'loan',
      })),
    });
  }
  return results;
}

export async function getPublicShelf(
  slug: string,
): Promise<{ shelf: Shelf; books: Book[] } | null> {
  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const shelfRow = await db
    .prepare('SELECT * FROM shelves WHERE slug = ? AND published = 1 LIMIT 1')
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!shelfRow) return null;
  const shelf = shelfFromRow(shelfRow);
  const booksResult = await db
    .prepare(
      `SELECT * FROM books WHERE shelf_id = ? AND status = 'available' ORDER BY created_at DESC, position ASC`,
    )
    .bind(shelf.id)
    .all<Record<string, unknown>>();
  return { shelf, books: booksResult.results.map(bookFromRow) };
}
