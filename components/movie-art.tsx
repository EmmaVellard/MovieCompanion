import { Film } from 'lucide-react';

import { cn } from '@/lib/utils';

export function MovieArt({
  title,
  year,
  compact = false,
}: {
  title: string;
  year: number | null;
  compact?: boolean;
}) {
  return (
    <div
      aria-label={`Poster unavailable for ${title}`}
      className={cn(
        'relative isolate overflow-hidden border border-white/10 bg-card shadow-[0_22px_50px_rgba(0,0,0,0.38)]',
        compact
          ? 'h-20 w-14 shrink-0 rounded-xl'
          : 'aspect-[2/3] w-full rounded-[1.35rem]',
      )}
      style={{
        backgroundImage:
          'linear-gradient(150deg, var(--gradient-accent-start), var(--gradient-accent-end))',
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.22),transparent_30%),linear-gradient(to_top,rgba(8,7,12,0.88),transparent_62%)]" />
      <Film
        className={cn(
          'absolute text-white/22',
          compact ? '-right-2 top-2 size-12' : '-right-5 top-5 size-28',
        )}
        strokeWidth={1.2}
        aria-hidden="true"
      />
      <div
        className={cn('absolute inset-x-0 bottom-0', compact ? 'p-2' : 'p-5')}
      >
        {!compact && (
          <p className="line-clamp-3 text-xl leading-tight font-semibold tracking-[-0.035em] text-white">
            {title}
          </p>
        )}
        <p
          className={cn(
            'font-medium text-white/70',
            compact ? 'text-[10px]' : 'mt-2 text-xs',
          )}
        >
          {year ?? 'Year unknown'}
        </p>
      </div>
    </div>
  );
}
