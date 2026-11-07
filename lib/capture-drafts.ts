export type CropBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const MAX_CAPTURE_PHOTOS = 8;
export const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export function validateCaptureFile(
  file: { type: string; size: number },
  current: { count: number; bytes: number },
): string | null {
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
  ) {
    return 'Use uma foto JPG, PNG, WEBP ou GIF.';
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return 'Use uma foto de até 15 MB.';
  }
  if (
    current.count >= MAX_CAPTURE_PHOTOS ||
    current.bytes + file.size > MAX_CAPTURE_BYTES
  ) {
    return 'Este lote está cheio. Salve os livros e volte para a estante antes de continuar.';
  }
  return null;
}

export function clampCrop(bounds: CropBounds): CropBounds {
  const finite = (value: number, fallback: number) =>
    Number.isFinite(value) ? value : fallback;
  const x = Math.max(0, Math.min(0.97, finite(bounds.x, 0)));
  const y = Math.max(0, Math.min(0.97, finite(bounds.y, 0)));
  return {
    x,
    y,
    width: Math.max(0.03, Math.min(1 - x, finite(bounds.width, 1))),
    height: Math.max(0.03, Math.min(1 - y, finite(bounds.height, 1))),
  };
}

export function cropFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): CropBounds {
  return clampCrop({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  });
}
