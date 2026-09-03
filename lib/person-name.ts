export const PERSON_NAME_MAX_LENGTH = 21;

export function normalizePersonName(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > PERSON_NAME_MAX_LENGTH) return null;
  if ((name.match(/ /g) ?? []).length > 1) return null;
  if (name.includes('@')) return null;

  return name;
}
