import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '@/app/manifest';

const root = process.cwd();

function pngSize(filename: string) {
  const contents = readFileSync(path.join(root, 'public', filename));
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

describe('PWA installation assets', () => {
  it('builds a base-path-aware standalone manifest', () => {
    const previousBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
    process.env.NEXT_PUBLIC_BASE_PATH = '/MovieCompanion';
    const result = manifest();
    if (previousBasePath === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    } else {
      process.env.NEXT_PUBLIC_BASE_PATH = previousBasePath;
    }

    expect(result).toMatchObject({
      name: 'Movie Companion',
      start_url: '/MovieCompanion/',
      scope: '/MovieCompanion/',
      display: 'standalone',
    });
    expect(result.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
  });

  it('includes correctly sized PWA and Apple touch icons', () => {
    expect(pngSize('apple-touch-icon.png')).toEqual({
      width: 180,
      height: 180,
    });
    expect(pngSize('icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngSize('icon-512.png')).toEqual({ width: 512, height: 512 });
  });

  it('pre-caches the install icons in the offline shell', () => {
    const worker = readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');

    expect(worker).toContain("new URL('apple-touch-icon.png', APP_ROOT)");
    expect(worker).toContain("new URL('icon-512.png', APP_ROOT)");
  });
});
