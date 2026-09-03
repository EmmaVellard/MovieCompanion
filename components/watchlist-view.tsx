'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, Search, Upload } from 'lucide-react';

import { MovieArt } from '@/components/movie-art';
import { Button } from '@/components/ui/button';
import type { MovieLibrary } from '@/lib/types';

function formatDate(value: string | null) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    date,
  );
}

export function WatchlistView({
  library,
  loading,
  onImport,
}: {
  library: MovieLibrary;
  loading: boolean;
  onImport: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'added' | 'title' | 'year'>('added');
  const movies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return library.watchlist
      .filter((movie) => movie.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        if (sort === 'year') return (b.year ?? 0) - (a.year ?? 0);
        return (b.addedDate ?? '').localeCompare(a.addedDate ?? '');
      });
  }, [library.watchlist, query, sort]);

  if (loading) {
    return <div className="h-[560px] animate-pulse rounded-[2rem] bg-card" />;
  }

  if (library.watchlist.length === 0) {
    return (
      <section className="mx-auto max-w-xl pt-8 text-center sm:pt-16">
        <span className="mx-auto grid size-13 place-items-center rounded-2xl bg-primary-muted text-primary">
          <Upload className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">
          No watchlist imported yet
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Import watchlist.csv to create the candidate pool for Tonight.
        </p>
        <Button className="mt-6 h-12 rounded-xl px-5" onClick={onImport}>
          Import watchlist.csv
        </Button>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Recommendation pool
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
            Watchlist
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {library.watchlist.length.toLocaleString()} Letterboxd films
            available for Movie Companion to choose from.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={onImport}
        >
          <Upload aria-hidden="true" />
          Update watchlist
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row">
        <label className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Search watchlist</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your watchlist"
            className="h-11 w-full rounded-xl border border-input bg-background/55 pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/35"
          />
        </label>
        <label>
          <span className="sr-only">Sort watchlist</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="h-11 w-full rounded-xl border border-input bg-background/55 px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/35 sm:w-44"
          >
            <option value="added">Recently added</option>
            <option value="title">Title</option>
            <option value="year">Release year</option>
          </select>
        </label>
      </div>

      {movies.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No watchlist films match “{query}”.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {movies.map((movie) => (
            <article
              key={movie.id}
              className="flex min-w-0 gap-3 rounded-2xl border border-border bg-card/75 p-3 transition-colors hover:border-primary/30"
            >
              <MovieArt title={movie.title} year={movie.year} compact />
              <div className="flex min-w-0 flex-1 flex-col py-1">
                <h2 className="line-clamp-2 text-sm leading-5 font-medium">
                  {movie.title}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {movie.year ?? 'Year unknown'}
                </p>
                {movie.addedDate && (
                  <p className="mt-1 text-[11px] text-muted-foreground/75">
                    Added {formatDate(movie.addedDate)}
                  </p>
                )}
                {movie.letterboxdUri && (
                  <a
                    href={movie.letterboxdUri}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-auto inline-flex min-h-9 items-center gap-1 self-start text-xs font-medium text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55"
                  >
                    View on Letterboxd
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
