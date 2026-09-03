import assert from 'node:assert/strict';
import test from 'node:test';

import { stripImageMetadata } from '../lib/photo-metadata.ts';

const encoder = new TextEncoder();

void test('removes EXIF from JPEG', () => {
  const exif = encoder.encode('Exif\0\0GPS-private');
  const jpeg = bytes(
    [0xff, 0xd8],
    jpegSegment(0xe1, exif),
    jpegSegment(0xc0, new Uint8Array()),
    [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9],
  );

  const result = stripImageMetadata(jpeg, 'image/jpeg');
  assert.equal(result.changed, true);
  assert.equal(
    new TextDecoder().decode(result.bytes).includes('GPS-private'),
    false,
  );
  assert.deepEqual(Array.from(result.bytes.slice(-2)), [0xff, 0xd9]);
});

void test('removes textual and EXIF chunks from PNG', () => {
  const png = bytes(
    [137, 80, 78, 71, 13, 10, 26, 10],
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('eXIf', encoder.encode('GPS-private')),
    pngChunk('tEXt', encoder.encode('author\0private')),
    pngChunk('IDAT', new Uint8Array()),
    pngChunk('IEND', new Uint8Array()),
  );

  const result = stripImageMetadata(png, 'image/png');
  const text = new TextDecoder().decode(result.bytes);
  assert.equal(result.changed, true);
  assert.equal(text.includes('eXIf'), false);
  assert.equal(text.includes('tEXt'), false);
  assert.equal(text.includes('IEND'), true);
});

void test('removes EXIF and XMP chunks from WEBP', () => {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x0c;
  const webp = webpFile(
    webpChunk('VP8X', vp8x),
    webpChunk('EXIF', encoder.encode('GPS-private')),
    webpChunk('XMP ', encoder.encode('person-private')),
    webpChunk('VP8 ', new Uint8Array([1, 2])),
  );

  const result = stripImageMetadata(webp, 'image/webp');
  const text = new TextDecoder().decode(result.bytes);
  assert.equal(result.changed, true);
  assert.equal(text.includes('EXIF'), false);
  assert.equal(text.includes('XMP '), false);
  assert.equal(result.bytes[20] & 0x0c, 0);
});

void test('removes comments from GIF', () => {
  const gif = bytes(
    encoder.encode('GIF89a'),
    [1, 0, 1, 0, 0, 0, 0],
    [0x21, 0xfe, 0x07],
    encoder.encode('private'),
    [0x00, 0x3b],
  );

  const result = stripImageMetadata(gif, 'image/gif');
  assert.equal(result.changed, true);
  assert.equal(
    new TextDecoder().decode(result.bytes).includes('private'),
    false,
  );
  assert.equal(result.bytes.at(-1), 0x3b);
});

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  return bytes([0xff, marker, length >> 8, length & 0xff], payload);
}

function pngChunk(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + payload.length);
  writeUint32(output, 0, payload.length);
  output.set(encoder.encode(type), 4);
  output.set(payload, 8);
  return output;
}

function webpChunk(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + payload.length + (payload.length % 2));
  output.set(encoder.encode(type), 0);
  writeUint32LittleEndian(output, 4, payload.length);
  output.set(payload, 8);
  return output;
}

function webpFile(...chunks: Uint8Array[]): Uint8Array {
  const body = bytes(encoder.encode('WEBP'), ...chunks);
  const output = new Uint8Array(8 + body.length);
  output.set(encoder.encode('RIFF'), 0);
  writeUint32LittleEndian(output, 4, body.length);
  output.set(body, 8);
  return output;
}

function bytes(...parts: Array<Uint8Array | number[]>): Uint8Array {
  const arrays = parts.map((part) =>
    part instanceof Uint8Array ? part : new Uint8Array(part),
  );
  const output = new Uint8Array(
    arrays.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of arrays) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function writeUint32(output: Uint8Array, offset: number, value: number) {
  output[offset] = (value >>> 24) & 0xff;
  output[offset + 1] = (value >>> 16) & 0xff;
  output[offset + 2] = (value >>> 8) & 0xff;
  output[offset + 3] = value & 0xff;
}

function writeUint32LittleEndian(
  output: Uint8Array,
  offset: number,
  value: number,
) {
  output[offset] = value & 0xff;
  output[offset + 1] = (value >>> 8) & 0xff;
  output[offset + 2] = (value >>> 16) & 0xff;
  output[offset + 3] = (value >>> 24) & 0xff;
}
