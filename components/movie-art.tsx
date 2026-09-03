'use client';

import { useState } from 'react';
import { Film } from 'lucide-react';

import { cn } from '@/lib/utils';

export function MovieArt({
  title,
  posterUrl,
  compact = false,
}: {
  title: string;
  posterUrl: string | null;
  compact?: boolean;
}) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const loaded = Boolean(posterUrl) && loadedUrl === posterUrl;
  const showPoster = Boolean(posterUrl) && brokenUrl !== posterUrl;

  return (
    <div
      aria-label={showPoster ? undefined : `Poster unavailable for ${title}`}
      className={cn(
        'relative isolate aspect-[2/3] overflow-hidden border border-white/10 bg-[linear-gradient(145deg,oklch(0.235_0.012_270),oklch(0.15_0.012_270))] shadow-[0_22px_50px_rgba(0,0,0,0.38)]',
        compact ? 'w-14 shrink-0 rounded-xl' : 'w-full rounded-[1.35rem]',
      )}
    >
      {!loaded && showPoster && (
        <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.06)_45%,transparent_70%)] bg-[length:220%_100%]" />
      )}
      {showPoster ? (
        // The URL is built from TMDB's trusted image configuration and stored poster path.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterUrl ?? undefined}
          alt={`${title} poster`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setLoadedUrl(posterUrl)}
          onError={() => setBrokenUrl(posterUrl)}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid size-12 place-items-center rounded-full border border-white/8 bg-white/[0.035]">
            <Film
              className={cn(
                'text-white/28',
                compact ? 'size-4' : 'size-5',
              )}
              strokeWidth={1.4}
              aria-hidden="true"
            />
          </div>
        </div>
      )}
    </div>
  );
}
