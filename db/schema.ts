import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const shelves = sqliteTable(
  'shelves',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    ownerName: text('owner_name').notNull(),
    ownerEmail: text('owner_email').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    intro: text('intro')
      .notNull()
      .default('Escolha os livros que você gostaria de receber.'),
    published: integer('published', { mode: 'boolean' })
      .notNull()
      .default(true),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_shelves_owner_id').on(table.ownerId),
    uniqueIndex('idx_shelves_slug').on(table.slug),
  ],
);

export const photoBatches = sqliteTable(
  'photo_batches',
  {
    id: text('id').primaryKey(),
    shelfId: text('shelf_id')
      .notNull()
      .references(() => shelves.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    status: text('status').notNull(),
    bookCount: integer('book_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_photo_batches_shelf_id').on(table.shelfId)],
);

export const books = sqliteTable(
  'books',
  {
    id: text('id').primaryKey(),
    shelfId: text('shelf_id')
      .notNull()
      .references(() => shelves.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    photoBatchId: text('photo_batch_id').references(() => photoBatches.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    author: text('author').notNull().default(''),
    availability: text('availability').notNull(),
    status: text('status').notNull().default('available'),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_books_shelf_status').on(table.shelfId, table.status),
    index('idx_books_owner_id').on(table.ownerId),
  ],
);

export const requests = sqliteTable(
  'requests',
  {
    id: text('id').primaryKey(),
    shelfId: text('shelf_id')
      .notNull()
      .references(() => shelves.id, { onDelete: 'cascade' }),
    requesterName: text('requester_name').notNull(),
    requesterContact: text('requester_contact').notNull().default(''),
    note: text('note').notNull().default(''),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_requests_shelf_status').on(table.shelfId, table.status),
  ],
);

export const requestBooks = sqliteTable(
  'request_books',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.requestId, table.bookId] }),
    index('idx_request_books_book_id').on(table.bookId),
  ],
);
