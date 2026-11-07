import type { BookBounds } from './book-recognition-types';

/** Conservative local fallback for separate covers on a plain surface. This is
 * geometry, not semantic recognition: never use it on a textured/nonuniform
 * background, and require at least two substantial, roughly rectangular areas.
 * Call with a downsampled image (at most 640 px on the longest side).
 */
export function findIsolatedCoverBounds(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): BookBounds[] {
  if (
    width < 40 ||
    height < 40 ||
    width * height > 640 * 640 ||
    pixels.length !== width * height * 4
  )
    return [];
  const border: number[] = [];
  for (let x = 0; x < width; x += 3) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 3)
    border.push(y * width, y * width + width - 1);
  const background = [0, 1, 2].map((channel) => {
    const values = border
      .map((index) => pixels[index * 4 + channel])
      .sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  const distance = (index: number) =>
    background.reduce(
      (sum, value, channel) => sum + (pixels[index * 4 + channel] - value) ** 2,
      0,
    );
  if (
    border.filter((index) => distance(index) < 35 ** 2).length / border.length <
    0.85
  )
    return [];
  const rawMask = new Uint8Array(width * height);
  for (let i = 0; i < rawMask.length; i++)
    rawMask[i] = distance(i) > 45 ** 2 ? 1 : 0;
  // Bridge single-pixel JPEG/antialiasing seams inside a cover.
  const mask = new Uint8Array(rawMask.length);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          mask[i] ||= rawMask[i + dy * width + dx];
    }
  const queue = new Int32Array(mask.length);
  const found: BookBounds[] = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed]) continue;
    let head = 0,
      tail = 1;
    queue[0] = seed;
    mask[seed] = 0;
    let left = width,
      right = 0,
      top = height,
      bottom = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width,
        y = Math.floor(index / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      const visit = (next: number) => {
        if (mask[next]) {
          mask[next] = 0;
          queue[tail++] = next;
        }
      };
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y < height - 1) visit(index + width);
    }
    const w = right - left + 1,
      h = bottom - top + 1;
    const area = w * h;
    // Exclude border-touching objects, background strips, flecks and irregular
    // clusters. Adjacent/overlapping books remain the semantic detector's job.
    if (
      left < 2 ||
      top < 2 ||
      right >= width - 2 ||
      bottom >= height - 2 ||
      w < 12 ||
      h < 12 ||
      area / (width * height) < 0.015 ||
      area / (width * height) > 0.65 ||
      w / h < 0.35 ||
      w / h > 2.5 ||
      tail / area < 0.65
    )
      continue;
    const cornerWidth = Math.max(2, Math.round(w * 0.15));
    const cornerHeight = Math.max(2, Math.round(h * 0.15));
    const corners = [
      [left, top],
      [right - cornerWidth + 1, top],
      [left, bottom - cornerHeight + 1],
      [right - cornerWidth + 1, bottom - cornerHeight + 1],
    ];
    // Round objects have high overall fill too. Require evidence of actual
    // rectangular corners, not merely an ellipse's enclosing rectangle.
    if (
      corners.some(([x0, y0]) => {
        let filled = 0;
        for (let y = y0; y < y0 + cornerHeight; y++)
          for (let x = x0; x < x0 + cornerWidth; x++)
            filled += rawMask[y * width + x];
        return filled / (cornerWidth * cornerHeight) < 0.5;
      })
    )
      continue;
    found.push({
      x: left / width,
      y: top / height,
      width: w / width,
      height: h / height,
    });
    if (found.length > 20) return [];
  }
  return found.length >= 2 ? found.sort((a, b) => a.y - b.y || a.x - b.x) : [];
}

function intersectionArea(a: BookBounds, b: BookBounds) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

/** Complete geometric outlines remove title fragments and grouped model boxes.
 * Conversely, do not let a joined contour erase two distinct semantic covers.
 * The caller performs final NMS and the twenty-crop cap.
 */
export function combineCoverBounds(
  contours: BookBounds[],
  detected: BookBounds[],
): BookBounds[] {
  const separate = contours.filter((outline) => {
    const inside = detected.filter(
      (box) => intersectionArea(box, outline) / (box.width * box.height) > 0.85,
    );
    return !inside.some((a, i) =>
      inside
        .slice(i + 1)
        .some(
          (b) =>
            intersectionArea(a, b) /
              Math.min(a.width * a.height, b.width * b.height) <
            0.2,
        ),
    );
  });
  return [
    ...separate,
    ...detected.filter((box) => {
      const overlaps = separate.map((other) => {
        const area = intersectionArea(box, other);
        return {
          ofBox: area / (box.width * box.height),
          ofContour: area / (other.width * other.height),
        };
      });
      return (
        !overlaps.some((overlap) => overlap.ofBox > 0.8) &&
        overlaps.filter((overlap) => overlap.ofContour > 0.8).length < 2
      );
    }),
  ];
}
