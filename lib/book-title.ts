export const DEFAULT_BOOK_TITLE = 'Livro fotografado';
export const MAX_BOOK_TITLE_LENGTH = 200;

/** Keep titles as bounded plain text, including accented and non-Latin titles. */
export function sanitizeBookTitle(value: unknown): string {
  if (value === undefined || value === null) return DEFAULT_BOOK_TITLE;
  if (typeof value !== 'string' || value.length > 2000) {
    throw new Error('Informe um título de até 200 caracteres.');
  }
  const title = value
    .normalize('NFC')
    .replace(/<[^>]*>/g, '')
    // Strip intentional control and invisible formatting characters from titles.
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (Array.from(title).length > MAX_BOOK_TITLE_LENGTH) {
    throw new Error('Informe um título de até 200 caracteres.');
  }
  return title || DEFAULT_BOOK_TITLE;
}

export function parseBookUploadId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error('Identificador de envio inválido.');
  }
  return value.toLowerCase();
}
