export type PublicShelf = {
  id: string;
  ownerName: string;
  name: string;
  slug: string;
  intro: string;
  published: boolean;
};

export const PUBLIC_BOOK_STATUSES = [
  'available',
  'reserved',
  'loaned',
] as const;

export function publicShelfFromRow(row: Record<string, unknown>): PublicShelf {
  return {
    id: String(row.id),
    ownerName: String(row.owner_name),
    name: String(row.name),
    slug: String(row.slug),
    intro: String(row.intro),
    published: Boolean(row.published),
  };
}
