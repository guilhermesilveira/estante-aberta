'use client';
import { useState } from 'react';
import type { OCRTitleLine } from '@/lib/book-recognition-types';
import { composeOCRTitle } from '@/lib/ocr-title-lines';
import { Button } from '@/components/ui/button';

export function OCRTitlePicker({
  imageUrl,
  lines,
  onApply,
}: {
  imageUrl: string;
  lines: OCRTitleLine[];
  onApply: (title: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const title = composeOCRTitle(lines, selected);
  const tooLong = Array.from(title).length > 200;
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  return (
    <details className="rounded-xl border p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
        Escolher linhas na foto
      </summary>
      <p className="mb-3 text-xs text-muted-foreground">
        Toque nas caixas ou na lista para montar o título na ordem da foto.
        Toque novamente para desmarcar. Só substitui o campo ao aplicar.
      </p>
      <div className="relative overflow-hidden rounded-lg bg-muted">
        {/* Native image keeps overlays aligned with the full, uncropped image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Capa com linhas reconhecidas para selecionar"
          className="block h-auto w-full"
        />
        {lines.map((line, index) => (
          <button
            key={line.id}
            type="button"
            aria-pressed={selected.includes(line.id)}
            aria-label={`Linha ${index + 1}: ${line.text}`}
            onClick={() => toggle(line.id)}
            className={`absolute border-2 rounded-sm focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${selected.includes(line.id) ? 'border-yellow-400 bg-yellow-400/40' : 'border-emerald-600 bg-emerald-500/15'}`}
            style={{
              left: `${line.bounds.x * 100}%`,
              top: `${line.bounds.y * 100}%`,
              width: `${line.bounds.width * 100}%`,
              height: `${line.bounds.height * 100}%`,
            }}
          >
            <span className="absolute -top-1 left-0 rounded bg-black px-1 text-[10px] text-white">
              {selected.includes(line.id) ? '✓ ' : ''}
              {index + 1}
            </span>
          </button>
        ))}
      </div>
      <fieldset
        className="my-3 max-h-48 space-y-1 overflow-y-auto"
        aria-label="Linhas reconhecidas"
      >
        {lines.map((line, index) => (
          <button
            key={line.id}
            type="button"
            aria-pressed={selected.includes(line.id)}
            onClick={() => toggle(line.id)}
            className={`flex min-h-11 w-full items-center gap-2 rounded border px-3 py-2 text-left text-sm focus-visible:outline-2 ${selected.includes(line.id) ? 'border-primary bg-primary/10' : 'border-border'}`}
          >
            <span aria-hidden="true">
              {selected.includes(line.id) ? '☑' : '☐'} {index + 1}.
            </span>
            <span className="min-w-0 break-words">{line.text}</span>
          </button>
        ))}
      </fieldset>
      <p aria-live="polite" className="mb-2 break-words text-sm">
        {title || 'Selecione as linhas do título.'}
      </p>
      {tooLong && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          Selecione menos linhas: o título pode ter até 200 caracteres.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={!title || tooLong}
          onClick={() => onApply(title)}
        >
          Usar como título
        </Button>
        <Button
          type="button"
          className="min-h-11"
          variant="outline"
          disabled={!selected.length}
          onClick={() => setSelected([])}
        >
          Limpar seleção
        </Button>
      </div>
    </details>
  );
}
