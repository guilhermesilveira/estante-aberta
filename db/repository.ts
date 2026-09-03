import { env } from 'cloudflare:workers';

import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { normalizePersonName } from '@/lib/person-name';
import { publicShelfFromRow, type PublicShelf } from '@/lib/public-shelf-data';
import { stripImageMetadata } from '@/lib/photo-metadata';

export type { PublicShelf } from '@/lib/public-shelf-data';

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
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: number;
  books: Array<{
    id: string;
    photoBatchId: string | null;
    availability: 'loan' | 'donation';
  }>;
};

export type StoredPhoto = {
  id: string;
  storageKey: string;
  contentType: string;
  status: string;
};

type RuntimeEnv = Cloudflare.Env & {
  DB: D1Database;
  FILES: R2Bucket;
};

export function getRuntimeEnv(): RuntimeEnv {
  return env as RuntimeEnv;
}

let schemaReady: Promise<void> | null = null;

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getRuntimeEnv()
      .DB.prepare('PRAGMA optimize')
      .run()
      .then(() => undefined)
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

export async function getOrCreateProfileName(
  user: ChatGPTUser,
): Promise<string | null> {
  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const existing = await db
    .prepare('SELECT display_name FROM profiles WHERE user_id = ? LIMIT 1')
    .bind(user.userId)
    .first<{ display_name: string }>();
  if (existing) return normalizePersonName(existing.display_name);

  const accountName = normalizePersonName(user.fullName);
  if (accountName) {
    await saveProfileName(user, accountName);
    return accountName;
  }

  const shelf = await db
    .prepare(
      'SELECT owner_name, owner_email FROM shelves WHERE owner_id = ? LIMIT 1',
    )
    .bind(user.userId)
    .first<{ owner_name: string; owner_email: string }>();
  const shelfName = normalizePersonName(shelf?.owner_name);
  const emailName = shelf?.owner_email.split('@')[0]?.toLocaleLowerCase();
  if (shelfName && shelfName.toLocaleLowerCase() !== emailName) {
    await saveProfileName(user, shelfName);
    return shelfName;
  }

  return null;
}

export async function saveProfileName(
  user: ChatGPTUser,
  value: unknown,
): Promise<string> {
  await ensureSchema();
  const displayName = normalizePersonName(value);
  if (!displayName) {
    throw new Error('Use um nome de até 21 caracteres e no máximo um espaço.');
  }

  const db = getRuntimeEnv().DB;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO profiles (user_id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         updated_at = excluded.updated_at`,
    )
    .bind(user.userId, displayName, now, now)
    .run();

  const shelf = await db
    .prepare(
      `SELECT id, owner_name, name, slug
       FROM shelves WHERE owner_id = ? LIMIT 1`,
    )
    .bind(user.userId)
    .first<{ id: string; owner_name: string; name: string; slug: string }>();

  if (shelf && shelf.owner_name !== displayName) {
    const previousDefaultName = `Estante de ${shelf.owner_name}`;
    const nextShelfName =
      shelf.name === previousDefaultName
        ? `Estante de ${displayName}`
        : shelf.name;
    const code = shelf.slug.match(/-([a-f0-9]{6})$/i)?.[1] ?? randomCode();
    const nextSlug = `${slugPart(displayName) || 'estante'}-${code}`;
    await db
      .prepare(
        `UPDATE shelves
         SET owner_name = ?, name = ?, slug = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(displayName, nextShelfName, nextSlug, now, shelf.id, user.userId)
      .run();
  }

  return displayName;
}

export async function getOrCreateShelf(
  user: ChatGPTUser,
  displayName: string,
): Promise<Shelf> {
  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const existing = await db
    .prepare('SELECT * FROM shelves WHERE owner_id = ? LIMIT 1')
    .bind(user.userId)
    .first<Record<string, unknown>>();
  if (existing) return shelfFromRow(existing);

  const now = Date.now();
  const id = crypto.randomUUID();
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
      `SELECT * FROM books
       WHERE owner_id = ? AND status NOT IN ('removed', 'given')
       ORDER BY created_at DESC, position ASC`,
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
        `SELECT books.id, books.photo_batch_id, books.availability, books.status
         FROM request_books JOIN books ON books.id = request_books.book_id
         WHERE request_books.request_id = ? ORDER BY books.title`,
      )
      .bind(String(row.id))
      .all<Record<string, unknown>>();
    results.push({
      id: String(row.id),
      requesterName: String(row.requester_name),
      status: String(row.status) as BookRequest['status'],
      createdAt: Number(row.created_at),
      books: bookRows.results.map((book) => ({
        id: String(book.id),
        photoBatchId:
          book.status !== 'given' &&
          book.status !== 'removed' &&
          typeof book.photo_batch_id === 'string'
            ? book.photo_batch_id
            : null,
        availability: book.availability === 'donation' ? 'donation' : 'loan',
      })),
    });
  }
  return results;
}

export async function getPublicShelf(
  slug: string,
): Promise<{ shelf: PublicShelf; books: Book[] } | null> {
  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const shelfRow = await db
    .prepare(
      `SELECT id, owner_name, name, slug, intro, published
       FROM shelves WHERE slug = ? AND published = 1 LIMIT 1`,
    )
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!shelfRow) return null;
  const shelf = publicShelfFromRow(shelfRow);
  const booksResult = await db
    .prepare(
      `SELECT id, shelf_id, photo_batch_id, title, author, availability, status, position
       FROM books
       WHERE shelf_id = ? AND status IN ('available', 'reserved', 'loaned')
       ORDER BY created_at DESC, position ASC`,
    )
    .bind(shelf.id)
    .all<Record<string, unknown>>();
  return { shelf, books: booksResult.results.map(bookFromRow) };
}

export async function sanitizeOwnerPhotos(userId: string): Promise<number> {
  await ensureSchema();
  const runtime = getRuntimeEnv();
  const result = await runtime.DB.prepare(
    `SELECT id, storage_key, content_type, status
       FROM photo_batches
       WHERE owner_id = ? AND status != 'sanitized'
       ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<{
      id: string;
      storage_key: string;
      content_type: string;
      status: string;
    }>();

  let sanitizedCount = 0;
  for (const row of result.results) {
    const photo: StoredPhoto = {
      id: row.id,
      storageKey: row.storage_key,
      contentType: row.content_type,
      status: row.status,
    };
    try {
      await sanitizeStoredPhoto(photo);
      sanitizedCount += 1;
    } catch {
      // A malformed legacy file stays unavailable until it can be replaced.
    }
  }
  return sanitizedCount;
}

export async function sanitizeStoredPhoto(photo: StoredPhoto): Promise<{
  bytes: Uint8Array;
  etag: string | null;
}> {
  const runtime = getRuntimeEnv();
  const object = await runtime.FILES.get(photo.storageKey);
  if (!object) throw new Error('Foto não encontrada.');

  const original = new Uint8Array(await object.arrayBuffer());
  const sanitized = stripImageMetadata(original, photo.contentType);
  let etag = object.httpEtag;

  if (sanitized.changed) {
    const stored = await runtime.FILES.put(photo.storageKey, sanitized.bytes, {
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata,
    });
    etag = stored?.httpEtag ?? null;
  }

  if (photo.status !== 'sanitized') {
    await runtime.DB.prepare(
      "UPDATE photo_batches SET status = 'sanitized' WHERE id = ?",
    )
      .bind(photo.id)
      .run();
  }

  return { bytes: sanitized.bytes, etag };
}
