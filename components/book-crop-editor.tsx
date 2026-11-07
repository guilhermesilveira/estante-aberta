'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  clampCrop,
  cropFromPoints,
  type CropBounds,
} from '@/lib/capture-drafts';

export function BookCropEditor({
  sourceUrl,
  initialBounds,
  onCancel,
  onSave,
}: {
  sourceUrl: string;
  initialBounds: CropBounds;
  onCancel: () => void;
  onSave: (blob: Blob, bounds: CropBounds) => Promise<void> | void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const [bounds, setBounds] = useState(initialBounds);
  const [ratio, setRatio] = useState(4 / 3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = useRef<{ x: number; y: number } | null>(null);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const source = new window.Image();
      source.src = sourceUrl;
      await source.decode();
      const crop = clampCrop(bounds);
      const width = Math.max(1, Math.round(source.naturalWidth * crop.width));
      const height = Math.max(
        1,
        Math.round(source.naturalHeight * crop.height),
      );
      const scale = Math.min(1, 2200 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Recorte indisponível neste navegador.');
      context.drawImage(
        source,
        crop.x * source.naturalWidth,
        crop.y * source.naturalHeight,
        width,
        height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Não foi possível gerar o recorte.');
      await onSave(blob, crop);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível recortar.',
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Ajustar recorte do livro"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-[#151714] p-4 text-white"
    >
      <div className="mx-auto max-w-xl space-y-4">
        <h3 className="text-xl font-bold">Ajustar recorte</h3>
        <p className="text-sm text-white/75">
          Arraste sobre a capa para desenhar o recorte ou use os controles
          abaixo.
        </p>
        <div
          className="relative w-full overflow-hidden rounded-xl bg-black"
          style={{ aspectRatio: ratio }}
        >
          <Image
            fill
            unoptimized
            src={sourceUrl}
            alt="Foto original com área de recorte"
            sizes="600px"
            className="object-contain"
            onLoad={(event) =>
              setRatio(
                event.currentTarget.naturalWidth /
                  event.currentTarget.naturalHeight,
              )
            }
          />
          <svg
            className="absolute inset-0 size-full touch-none"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
            onPointerDown={(event) => {
              if (busy) return;
              const rect = event.currentTarget.getBoundingClientRect();
              start.current = {
                x: Math.max(
                  0,
                  Math.min(1, (event.clientX - rect.left) / rect.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, (event.clientY - rect.top) / rect.height),
                ),
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!start.current) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setBounds(
                cropFromPoints(start.current, {
                  x: Math.max(
                    0,
                    Math.min(1, (event.clientX - rect.left) / rect.width),
                  ),
                  y: Math.max(
                    0,
                    Math.min(1, (event.clientY - rect.top) / rect.height),
                  ),
                }),
              );
            }}
            onPointerUp={() => {
              start.current = null;
            }}
            onPointerCancel={() => {
              start.current = null;
            }}
          >
            <rect width="1000" height="1000" fill="black" fillOpacity="0.2" />
            <rect
              x={bounds.x * 1000}
              y={bounds.y * 1000}
              width={bounds.width * 1000}
              height={bounds.height * 1000}
              fill="transparent"
              stroke="#f0be46"
              strokeWidth="5"
            />
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['x', 'Esquerda'],
              ['y', 'Topo'],
              ['width', 'Largura'],
              ['height', 'Altura'],
            ] as const
          ).map(([key, label]) => (
            <label className="text-sm" key={key}>
              {label}: {Math.round(bounds[key] * 100)}%
              <input
                className="mt-2 block w-full"
                type="range"
                min={key === 'x' || key === 'y' ? 0 : 3}
                max="100"
                step="1"
                disabled={busy}
                value={Math.round(bounds[key] * 100)}
                onChange={(event) =>
                  setBounds(
                    clampCrop({
                      ...bounds,
                      [key]: Number(event.target.value) / 100,
                    }),
                  )
                }
              />
            </label>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => void save()}>
            Usar recorte
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            className="text-foreground"
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </dialog>
  );
}
