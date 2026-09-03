export type SanitizedImage = {
  bytes: Uint8Array;
  changed: boolean;
};

export function stripImageMetadata(
  input: Uint8Array,
  contentType: string,
): SanitizedImage {
  switch (contentType) {
    case 'image/jpeg':
      return stripJpegMetadata(input);
    case 'image/png':
      return stripPngMetadata(input);
    case 'image/webp':
      return stripWebpMetadata(input);
    case 'image/gif':
      return stripGifMetadata(input);
    default:
      throw new Error('Formato de imagem não suportado.');
  }
}

function stripJpegMetadata(input: Uint8Array): SanitizedImage {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new Error('Arquivo JPEG inválido.');
  }

  const parts: Uint8Array[] = [input.subarray(0, 2)];
  let offset = 2;
  let changed = false;

  while (offset + 1 < input.length) {
    if (input[offset] !== 0xff) {
      throw new Error('Arquivo JPEG inválido.');
    }

    const markerStart = offset;
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    const marker = input[offset];
    offset += 1;

    if (marker === 0xd9) {
      parts.push(input.subarray(markerStart, offset));
      if (offset !== input.length) changed = true;
      return { bytes: concatBytes(parts), changed };
    }

    if (marker === 0xda) {
      if (offset + 2 > input.length) throw new Error('Arquivo JPEG inválido.');
      const segmentLength = readUint16(input, offset);
      const scanStart = markerStart;
      const scanDataStart = offset + segmentLength;
      if (segmentLength < 2 || scanDataStart > input.length) {
        throw new Error('Arquivo JPEG inválido.');
      }
      const imageEnd = findJpegEnd(input, scanDataStart);
      parts.push(input.subarray(scanStart, imageEnd));
      if (imageEnd !== input.length) changed = true;
      return { bytes: concatBytes(parts), changed };
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(markerStart, offset));
      continue;
    }

    if (offset + 2 > input.length) throw new Error('Arquivo JPEG inválido.');
    const segmentLength = readUint16(input, offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > input.length) {
      throw new Error('Arquivo JPEG inválido.');
    }

    const isPrivateMetadata =
      marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (isPrivateMetadata) {
      changed = true;
    } else {
      parts.push(input.subarray(markerStart, segmentEnd));
    }
    offset = segmentEnd;
  }

  throw new Error('Arquivo JPEG incompleto.');
}

function findJpegEnd(input: Uint8Array, start: number): number {
  for (let offset = start; offset + 1 < input.length; offset += 1) {
    if (input[offset] !== 0xff) continue;
    const next = input[offset + 1];
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) {
      offset += 1;
      continue;
    }
    if (next === 0xd9) return offset + 2;
  }
  throw new Error('Arquivo JPEG sem marcador de fim.');
}

function stripPngMetadata(input: Uint8Array): SanitizedImage {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    input.length < signature.length ||
    signature.some((byte, index) => input[index] !== byte)
  ) {
    throw new Error('Arquivo PNG inválido.');
  }

  const privateChunks = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  const parts: Uint8Array[] = [input.subarray(0, 8)];
  let offset = 8;
  let changed = false;
  let foundEnd = false;

  while (offset + 12 <= input.length) {
    const chunkLength = readUint32(input, offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > input.length) throw new Error('Arquivo PNG inválido.');
    const type = ascii(input.subarray(offset + 4, offset + 8));

    if (privateChunks.has(type)) {
      changed = true;
    } else {
      parts.push(input.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;

    if (type === 'IEND') {
      foundEnd = true;
      if (offset !== input.length) changed = true;
      break;
    }
  }

  if (!foundEnd) throw new Error('Arquivo PNG sem IEND.');
  return { bytes: concatBytes(parts), changed };
}

function stripWebpMetadata(input: Uint8Array): SanitizedImage {
  if (
    input.length < 12 ||
    ascii(input.subarray(0, 4)) !== 'RIFF' ||
    ascii(input.subarray(8, 12)) !== 'WEBP'
  ) {
    throw new Error('Arquivo WEBP inválido.');
  }

  const chunks: Uint8Array[] = [];
  let offset = 12;
  let changed = false;

  while (offset + 8 <= input.length) {
    const type = ascii(input.subarray(offset, offset + 4));
    const chunkLength = readUint32LittleEndian(input, offset + 4);
    const chunkEnd = offset + 8 + chunkLength + (chunkLength % 2);
    if (chunkEnd > input.length) throw new Error('Arquivo WEBP inválido.');

    if (type === 'EXIF' || type === 'XMP ') {
      changed = true;
    } else if (type === 'VP8X' && chunkLength >= 10) {
      const chunk = input.slice(offset, chunkEnd);
      const privateFlags = 0x08 | 0x04;
      if ((chunk[8] & privateFlags) !== 0) {
        chunk[8] &= ~privateFlags;
        changed = true;
      }
      chunks.push(chunk);
    } else {
      chunks.push(input.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
  }

  if (offset !== input.length) changed = true;
  if (!changed) return { bytes: input, changed: false };

  const bodyLength =
    4 + chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(8 + bodyLength);
  output.set(input.subarray(0, 4), 0);
  writeUint32LittleEndian(output, 4, bodyLength);
  output.set(input.subarray(8, 12), 8);
  let writeOffset = 12;
  for (const chunk of chunks) {
    output.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return { bytes: output, changed: true };
}

function stripGifMetadata(input: Uint8Array): SanitizedImage {
  const header = ascii(input.subarray(0, 6));
  if (input.length < 13 || (header !== 'GIF87a' && header !== 'GIF89a')) {
    throw new Error('Arquivo GIF inválido.');
  }

  const globalColorTableSize =
    input[10] & 0x80 ? 3 * 2 ** ((input[10] & 0x07) + 1) : 0;
  let offset = 13 + globalColorTableSize;
  if (offset > input.length) throw new Error('Arquivo GIF inválido.');

  const parts: Uint8Array[] = [input.subarray(0, offset)];
  let changed = false;
  let foundEnd = false;

  while (offset < input.length) {
    const blockStart = offset;
    const marker = input[offset];
    offset += 1;

    if (marker === 0x3b) {
      parts.push(input.subarray(blockStart, offset));
      foundEnd = true;
      if (offset !== input.length) changed = true;
      break;
    }

    if (marker === 0x2c) {
      if (offset + 9 > input.length) throw new Error('Arquivo GIF inválido.');
      const packed = input[offset + 8];
      offset += 9;
      if (packed & 0x80) offset += 3 * 2 ** ((packed & 0x07) + 1);
      if (offset >= input.length) throw new Error('Arquivo GIF inválido.');
      offset += 1;
      offset = skipGifSubBlocks(input, offset);
      parts.push(input.subarray(blockStart, offset));
      continue;
    }

    if (marker !== 0x21 || offset >= input.length) {
      throw new Error('Arquivo GIF inválido.');
    }

    const label = input[offset];
    offset += 1;
    if (offset >= input.length) throw new Error('Arquivo GIF inválido.');
    const headerSize = input[offset];
    const dataStart = offset + 1;
    const dataEnd = dataStart + headerSize;
    if (dataEnd > input.length) throw new Error('Arquivo GIF inválido.');
    offset = skipGifSubBlocks(input, dataEnd);

    const applicationName =
      label === 0xff ? ascii(input.subarray(dataStart, dataEnd)) : '';
    const preserveApplication =
      applicationName === 'NETSCAPE2.0' || applicationName === 'ANIMEXTS1.0';
    const isPrivateMetadata =
      label === 0xfe ||
      label === 0x01 ||
      (label === 0xff && !preserveApplication);

    if (isPrivateMetadata) {
      changed = true;
    } else {
      parts.push(input.subarray(blockStart, offset));
    }
  }

  if (!foundEnd) throw new Error('Arquivo GIF sem marcador de fim.');
  return { bytes: concatBytes(parts), changed };
}

function skipGifSubBlocks(input: Uint8Array, start: number): number {
  let offset = start;
  while (offset < input.length) {
    const length = input[offset];
    offset += 1;
    if (length === 0) return offset;
    offset += length;
    if (offset > input.length) throw new Error('Arquivo GIF inválido.');
  }
  throw new Error('Arquivo GIF incompleto.');
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 256 + bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000
  );
}

function writeUint32LittleEndian(
  bytes: Uint8Array,
  offset: number,
  value: number,
) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
