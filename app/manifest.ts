import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const appRoot = `${basePath}/`;
  return {
    name: 'Movie Companion',
    short_name: 'Companion',
    description:
      'Three personal picks from your Letterboxd watchlist for tonight.',
    start_url: appRoot,
    scope: appRoot,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0b0c0f',
    theme_color: '#0b0c0f',
    categories: ['entertainment', 'lifestyle'],
    icons: [
      {
        src: `${basePath}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
