import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromNext = createRequire(import.meta.resolve('next/package.json'));
const sharp = requireFromNext('sharp');

// Match the restrained typographic identity used by Skin Ritual while keeping
// Movie Companion's purple palette and a safe inset for maskable icon crops.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4d375f"/>
  <circle cx="256" cy="256" r="164" fill="none" stroke="#ae96bd" stroke-width="2"/>
  <text x="256" y="309" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="190" fill="#ffffff">m.</text>
</svg>`;

const outputs = [
  [180, 'apple-touch-icon.png'],
  [192, 'icon-192.png'],
  [512, 'icon-512.png'],
];

for (const [size, filename] of outputs) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(root, 'public', filename));
  console.log(`Generated public/${filename} (${size}x${size})`);
}
