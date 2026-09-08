import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supersampling = 4;

const gradientStart = [166, 108, 255];
const gradientEnd = [126, 63, 219];
const filmColor = [252, 250, 255];

const outputs = [
  ['public/apple-touch-icon.png', 180],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
];

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  if (x < left || x > right || y < top || y > bottom) return false;

  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  return Math.hypot(x - nearestX, y - nearestY) <= radius;
}

function backgroundAt(x, y) {
  const progress = Math.max(0, Math.min(1, (x + y) / 2));
  return gradientStart.map((start, channel) =>
    Math.round(start + (gradientEnd[channel] - start) * progress),
  );
}

function isFilmPixel(x, y) {
  if (!insideRoundedRect(x, y, 0.234, 0.25, 0.532, 0.5, 0.094)) {
    return false;
  }

  const holes = [
    [0.387, 0.32, 0.226, 0.145, 0.012],
    [0.387, 0.535, 0.226, 0.145, 0.012],
    [0.285, 0.32, 0.063, 0.078, 0.01],
    [0.285, 0.461, 0.063, 0.078, 0.01],
    [0.285, 0.602, 0.063, 0.078, 0.01],
    [0.652, 0.32, 0.063, 0.078, 0.01],
    [0.652, 0.461, 0.063, 0.078, 0.01],
    [0.652, 0.602, 0.063, 0.078, 0.01],
  ];

  return !holes.some(([left, top, width, height, radius]) =>
    insideRoundedRect(x, y, left, top, width, height, radius),
  );
}

function generateIcon(size) {
  const renderSize = size * supersampling;
  const renderPixels = new Uint8Array(renderSize * renderSize * 4);

  for (let y = 0; y < renderSize; y += 1) {
    for (let x = 0; x < renderSize; x += 1) {
      const normalizedX = (x + 0.5) / renderSize;
      const normalizedY = (y + 0.5) / renderSize;
      const color = isFilmPixel(normalizedX, normalizedY)
        ? filmColor
        : backgroundAt(normalizedX, normalizedY);
      const offset = (y * renderSize + x) * 4;
      renderPixels[offset] = color[0];
      renderPixels[offset + 1] = color[1];
      renderPixels[offset + 2] = color[2];
      renderPixels[offset + 3] = 255;
    }
  }

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < supersampling; sampleY += 1) {
        for (let sampleX = 0; sampleX < supersampling; sampleX += 1) {
          const sourceX = x * supersampling + sampleX;
          const sourceY = y * supersampling + sampleY;
          const sourceOffset = (sourceY * renderSize + sourceX) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += renderPixels[sourceOffset + channel];
          }
        }
      }

      const targetOffset = (y * size + x) * 4;
      const sampleCount = supersampling * supersampling;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[targetOffset + channel] = Math.round(totals[channel] / sampleCount);
      }
    }
  }

  return encodePng(size, size, pixels);
}

for (const [filename, size] of outputs) {
  writeFileSync(path.join(root, filename), generateIcon(size));
  console.log(`Generated ${filename} (${size}x${size})`);
}
