// ---------------------------------------------------------------------------
// Minimal PNG decoder for board artwork. Reads the raster formats users
// actually place on boards — 8/16-bit gray, RGB, gray+alpha, RGBA, and
// palette images at 1/2/4/8-bit depth — with no external dependency:
// node:zlib inflates the concatenated IDAT stream. Output is always RGBA8,
// row-major from the top-left pixel.
//
// Deliberately unsupported: interlaced (Adam7) files — rejected with a
// message telling the user to re-export — and every ancillary chunk except
// PLTE/tRNS, which palette decoding needs.
// ---------------------------------------------------------------------------

import { inflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, one byte per channel, row-major from the top-left pixel. */
  rgba: Uint8Array;
}

/** Channels per pixel by IHDR color type; anything else is not a PNG color type. */
const CHANNELS: Record<number, number> = {
  0: 1, // grayscale
  2: 3, // truecolor
  3: 1, // indexed
  4: 2, // grayscale + alpha
  6: 4, // truecolor + alpha
};

const VALID_BIT_DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

/** CRC-32 (PNG's ISO 3309 polynomial), table-free — chunks are checked so a
 *  truncated or corrupt file fails here with a clear message. */
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Paeth predictor (PNG spec: filter type 4). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Undo per-scanline filtering in place-style, returning plain sample bytes. */
function unfilter(raw: Uint8Array, height: number, rowBytes: number, bpp: number): Uint8Array {
  const out = new Uint8Array(rowBytes * height);
  const prior = new Uint8Array(rowBytes);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)]!;
    const rowStart = y * rowBytes;
    const src = rowStart + y; // input rows carry the filter byte first
    const row = out.subarray(rowStart, rowStart + rowBytes);
    switch (filter) {
      case 0:
        row.set(raw.subarray(src + 1, src + 1 + rowBytes));
        break;
      case 1: // Sub
        for (let i = 0; i < rowBytes; i++) {
          row[i] = (raw[src + 1 + i]! + (i >= bpp ? row[i - bpp]! : 0)) & 0xff;
        }
        break;
      case 2: // Up
        for (let i = 0; i < rowBytes; i++) {
          row[i] = (raw[src + 1 + i]! + prior[i]!) & 0xff;
        }
        break;
      case 3: // Average
        for (let i = 0; i < rowBytes; i++) {
          const left = i >= bpp ? row[i - bpp]! : 0;
          row[i] = (raw[src + 1 + i]! + ((left + prior[i]!) >> 1)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let i = 0; i < rowBytes; i++) {
          const left = i >= bpp ? row[i - bpp]! : 0;
          row[i] = (raw[src + 1 + i]! + paeth(left, prior[i]!, prior[i - bpp] ?? 0)) & 0xff;
        }
        break;
      default:
        throw new Error(`PNG scanline ${y} uses unknown filter type ${filter}`);
    }
    prior.set(row);
  }
  return out;
}

/** Pull one pixel sample of `depth` bits, MSB-first, out of a packed row. */
function sampleBits(row: Uint8Array, rowStart: number, index: number, depth: number): number {
  if (depth === 8) return row[rowStart + index]!;
  if (depth === 16) return row[rowStart + index * 2]!; // high byte
  const bitPos = index * depth;
  const byte = row[rowStart + (bitPos >> 3)]!;
  const shift = 8 - depth - (bitPos & 7);
  return (byte >> shift) & ((1 << depth) - 1);
}

export function decodePng(data: Uint8Array): DecodedImage {
  if (data.length < 8 || !SIGNATURE.every((b, i) => data[i] === b)) {
    throw new Error('Not a PNG file (bad signature)');
  }

  const u32 = (pos: number) =>
    ((data[pos]! << 24) | (data[pos + 1]! << 16) | (data[pos + 2]! << 8) | data[pos + 3]!) >>> 0;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  let palette: Uint8Array | undefined;
  let paletteAlpha: Uint8Array | undefined;
  const idat: Buffer[] = [];
  let sawIEnd = false;

  let offset = 8;
  while (offset + 8 <= data.length && !sawIEnd) {
    const length = u32(offset);
    const type = String.fromCharCode(data[offset + 4]!, data[offset + 5]!, data[offset + 6]!, data[offset + 7]!);
    const bodyStart = offset + 8;
    const bodyEnd = bodyStart + length;
    if (bodyEnd + 4 > data.length) throw new Error(`PNG chunk ${type} is truncated`);
    if (crc32(data.subarray(offset + 4, bodyEnd)) !== u32(bodyEnd)) {
      throw new Error(`PNG chunk ${type} failed its CRC — the file is corrupt`);
    }
    const body = data.subarray(bodyStart, bodyEnd);

    switch (type) {
      case 'IHDR': {
        width = u32(bodyStart);
        height = u32(bodyStart + 4);
        bitDepth = body[8]!;
        colorType = body[9]!;
        const compression = body[10]!;
        const filterMethod = body[11]!;
        interlace = body[12]!;
        if (compression !== 0 || filterMethod !== 0) {
          throw new Error('Unsupported PNG compression/filter method');
        }
        break;
      }
      case 'PLTE':
        palette = body.slice();
        break;
      case 'tRNS':
        paletteAlpha = body.slice();
        break;
      case 'IDAT':
        idat.push(Buffer.from(body)); // copy: subarray views don't survive Buffer.concat
        break;
      case 'IEND':
        sawIEnd = true;
        break;
    }
    offset = bodyEnd + 4;
  }

  if (colorType < 0) throw new Error('PNG has no IHDR header');
  if (!sawIEnd) throw new Error('PNG is truncated (no IEND chunk)');
  if (width < 1 || height < 1 || width > 16384 || height > 16384) {
    throw new Error(`PNG dimensions ${width}×${height} out of range (1..16384)`);
  }
  if (interlace !== 0) {
    throw new Error('Interlaced (Adam7) PNGs are not supported — re-export the image without interlacing');
  }
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`PNG color type ${colorType} is not a valid PNG color type`);
  if (!(VALID_BIT_DEPTHS[colorType] ?? []).includes(bitDepth)) {
    throw new Error(`PNG bit depth ${bitDepth} is not valid for color type ${colorType}`);
  }
  if (colorType === 3 && !palette) throw new Error('Palette PNG has no PLTE chunk');
  if (idat.length === 0) throw new Error('PNG has no image data (IDAT)');

  const bitsPerPixel = channels * bitDepth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  // filter tap distance: whole bytes per pixel, minimum 1 (sub-byte depths)
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));

  let raw: Uint8Array;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (err) {
    throw new Error(`PNG image data failed to inflate: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (raw.length !== (rowBytes + 1) * height) {
    throw new Error(`PNG image data is truncated (${raw.length} bytes, expected ${(rowBytes + 1) * height})`);
  }

  const samples = unfilter(raw, height, rowBytes, bpp);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      switch (colorType) {
        case 0: {
          const v = sampleBits(samples, rowStart, x, bitDepth);
          // sub-8-bit gray scales: depth-1 value 1 means full white, not #010101
          const scaled = bitDepth < 8 ? Math.round((v * 255) / ((1 << bitDepth) - 1)) : v;
          rgba[out] = rgba[out + 1] = rgba[out + 2] = scaled;
          rgba[out + 3] = 255;
          break;
        }
        case 2: {
          const base = bitDepth === 16 ? x * 6 : x * 3;
          rgba[out] = samples[rowStart + base]!;
          rgba[out + 1] = samples[rowStart + base + 1]!;
          rgba[out + 2] = samples[rowStart + base + 2]!;
          rgba[out + 3] = 255;
          break;
        }
        case 3: {
          const index = sampleBits(samples, rowStart, x, bitDepth);
          rgba[out] = palette![index * 3]!;
          rgba[out + 1] = palette![index * 3 + 1]!;
          rgba[out + 2] = palette![index * 3 + 2]!;
          rgba[out + 3] = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index]! : 255;
          break;
        }
        case 4: {
          const base = bitDepth === 16 ? x * 4 : x * 2;
          const v = samples[rowStart + base]!;
          rgba[out] = rgba[out + 1] = rgba[out + 2] = v;
          rgba[out + 3] = samples[rowStart + base + 1]!;
          break;
        }
        case 6: {
          const base = bitDepth === 16 ? x * 8 : x * 4;
          rgba[out] = samples[rowStart + base]!;
          rgba[out + 1] = samples[rowStart + base + 1]!;
          rgba[out + 2] = samples[rowStart + base + 2]!;
          rgba[out + 3] = samples[rowStart + base + 3]!;
          break;
        }
      }
    }
  }

  return { width, height, rgba };
}
