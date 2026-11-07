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
  regions,
  selectedId,
  onSelect,
  onCancel,
  onSave,
}: {
  sourceUrl: string;
  initialBounds: CropBounds;
  regions: { id: string; bounds: CropBounds; label: string; locked: boolean }[];
  selectedId?: string;
  onSelect: (id?: string) => void;
  onCancel: () => void;
  onSave: (blob: Blob, bounds: CropBounds) => Promise<void> | void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const [bounds, setBounds] = useState(initialBounds);
  const [ratio, setRatio] = useState(4 / 3);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 300, height: 200 });
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const imageWidth = Math.min(stageSize.width, stageSize.height * ratio);
  const locked =
    regions.find((region) => region.id === selectedId)?.locked ?? false;
  function select(id?: string) {
    if (busy || id === selectedId) return;
    if (
      JSON.stringify(bounds) !== JSON.stringify(initialBounds) &&
      !window.confirm('Descartar o ajuste não aplicado e trocar de livro?')
    )
      return;
    onSelect(id);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = useRef<{ x: number; y: number } | null>(null);

  function close() {
    if (busy) return;
    if (
      JSON.stringify(bounds) !== JSON.stringify(initialBounds) &&
      !window.confirm('Descartar o ajuste não aplicado?')
    )
      return;
    onCancel();
  }

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
        close();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-[#151714] p-3 text-white sm:p-4"
    >
      <div className="mx-auto flex h-full min-h-0 max-w-xl flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
        <h3 className="shrink-0 text-lg font-bold">
          {selectedId
            ? `Ajustar livro ${regions.findIndex((region) => region.id === selectedId) + 1}`
            : 'Marcar novo livro'}
        </h3>
        <p className="shrink-0 text-xs text-white/65">
          Arraste na foto para marcar a capa.
        </p>
        <div className="flex shrink-0 gap-2 pb-1" aria-label="Livros marcados">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {regions.map((region, index) => (
              <button
                key={region.id}
                type="button"
                disabled={busy}
                aria-pressed={region.id === selectedId}
                aria-label={`Livro ${index + 1}: ${region.label}${region.locked ? ' · salvo' : ''}`}
                title={region.label}
                onClick={() => select(region.id)}
                className={`min-h-10 shrink-0 rounded-lg border px-3 text-sm ${region.id === selectedId ? 'border-[#f0be46] bg-[#f0be46] text-black' : 'border-white/40'}`}
              >
                {index + 1}
                {region.locked ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            aria-pressed={!selectedId}
            onClick={() => select()}
            className="min-h-10 shrink-0 rounded-lg border border-white/60 px-3 text-sm"
          >
            + Novo livro
          </button>
        </div>
        <div
          ref={stage}
          className="flex min-h-20 flex-1 items-center justify-center overflow-hidden"
        >
          <div
            className="relative shrink-0 overflow-hidden rounded-xl bg-black"
            style={{ width: imageWidth, height: imageWidth / ratio }}
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
                if (busy || locked) return;
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
              {regions
                .filter((region) => region.id !== selectedId)
                .map((region) => (
                  <g
                    key={region.id}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      select(region.id);
                    }}
                    className="cursor-pointer"
                  >
                    <rect
                      x={region.bounds.x * 1000}
                      y={region.bounds.y * 1000}
                      width={region.bounds.width * 1000}
                      height={region.bounds.height * 1000}
                      fill="#65d8be"
                      fillOpacity="0.12"
                      stroke="#65d8be"
                      strokeWidth="3"
                    />
                    <rect
                      x={region.bounds.x * 1000}
                      y={region.bounds.y * 1000}
                      width="65"
                      height="65"
                      fill="#153b32"
                    />
                    <text
                      x={region.bounds.x * 1000 + 32}
                      y={region.bounds.y * 1000 + 48}
                      fill="white"
                      fontSize="44"
                      textAnchor="middle"
                    >
                      {regions.findIndex((item) => item.id === region.id) + 1}
                    </text>
                  </g>
                ))}
              <rect
                pointerEvents="none"
                x={bounds.x * 1000}
                y={bounds.y * 1000}
                width={bounds.width * 1000}
                height={bounds.height * 1000}
                fill="transparent"
                stroke="#f0be46"
                strokeWidth="5"
              />
              {selectedId && (
                <g pointerEvents="none">
                  <rect
                    x={bounds.x * 1000}
                    y={bounds.y * 1000}
                    width="65"
                    height="65"
                    fill="#f0be46"
                  />
                  <text
                    x={bounds.x * 1000 + 32}
                    y={bounds.y * 1000 + 48}
                    fill="black"
                    fontSize="44"
                    textAnchor="middle"
                  >
                    {regions.findIndex((region) => region.id === selectedId) +
                      1}
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
        {locked && (
          <p className="shrink-0 text-xs">
            Este recorte está protegido porque já foi enviado.
          </p>
        )}
        <details className="shrink-0 rounded-xl border border-white/15 px-3">
          <summary className="cursor-pointer py-3 text-sm text-white/80">
            Ajustes precisos
          </summary>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 pb-3">
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
                  className="block h-6 w-full accent-[#f0be46]"
                  type="range"
                  min={key === 'x' || key === 'y' ? 0 : 3}
                  max="100"
                  step="1"
                  disabled={busy || locked}
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
        </details>
        {error && <p role="alert">{error}</p>}
        <div className="flex shrink-0 gap-3">
          <Button
            className="min-h-11 flex-1"
            disabled={busy || locked}
            onClick={() => void save()}
          >
            {busy
              ? 'Aplicando…'
              : selectedId
                ? 'Aplicar ajuste'
                : 'Adicionar livro'}
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            className="text-foreground"
            onClick={close}
          >
            Fechar
          </Button>
        </div>
      </div>
    </dialog>
  );
}
