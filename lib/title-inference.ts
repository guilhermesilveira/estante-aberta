/** IDs rather than generated titles keep suggestions grounded in the actual OCR. */
export function titleLines(text: string): string[] {
  return (
    text
      .split(/\r?\n/)
      // oxlint-disable-next-line no-control-regex -- sanitize untrusted OCR controls
      .map((line) => line.replace(/[\u0000-\u001f\u007f]/g, '').trim())
      .filter((line) => /[\p{L}\p{N}]/u.test(line))
      .slice(0, 32)
      .map((line) => line.slice(0, 160))
  );
}
function comparableTitle(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
/** Accept only a contiguous group of actual OCR lines, never model-invented text. */
export function groundSuggestedTitle(
  output: string,
  lines: string[],
): string | null {
  const target = comparableTitle(output);
  if (!target || target === 'unknown' || Array.from(output).length > 240)
    return null;
  for (let first = 0; first < lines.length; first++) {
    for (let count = 1; count <= 4 && first + count <= lines.length; count++) {
      const title = lines
        .slice(first, first + count)
        .join(' ')
        .normalize('NFC');
      if (Array.from(title).length <= 200 && comparableTitle(title) === target)
        return title;
    }
  }
  return null;
}
export function titlePrompt(lines: string[]) {
  return [
    {
      role: 'system',
      content:
        'Extract only the book title from the text on a book cover. Ignore author names, publisher names, reviews, ISBN and edition. Copy the title exactly in its original language. Output just the title, nothing else. If there is no clear title, output UNKNOWN.',
    },
    { role: 'user', content: lines.join('\n') },
  ];
}
export const OCR_LANGUAGES = [
  ['por+eng', 'Português / inglês'],
  ['spa', 'Espanhol'],
  ['fra', 'Francês'],
  ['deu', 'Alemão'],
  ['ita', 'Italiano'],
  ['jpn', 'Japonês'],
  ['chi_sim', 'Chinês simplificado'],
  ['kor', 'Coreano'],
  ['ara', 'Árabe'],
  ['rus', 'Russo'],
] as const;
export function validOCRLanguage(value: unknown): string {
  return OCR_LANGUAGES.some(([id]) => id === value)
    ? (value as string)
    : 'por+eng';
}
