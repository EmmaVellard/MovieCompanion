import { ExternalLink, ShieldCheck, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type {
  ImportSummary,
  LetterboxdDataStatus,
  LetterboxdFileKind,
  MovieLibrary,
} from '@/lib/types';

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    date,
  );
}

export function DataView({
  library,
  latestImport,
  dataStatus,
  onImport,
  onClear,
}: {
  library: MovieLibrary;
  latestImport: ImportSummary | null;
  dataStatus: LetterboxdDataStatus;
  onImport: () => void;
  onClear: () => void;
}) {
  const hasData = library.watchlist.length + library.watched.length > 0;

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        Settings & data
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
        Your data stays yours
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        Movie Companion keeps this milestone local to this browser. There is no
        account, cloud sync, or tracking.
      </p>

      <div className="mt-8 space-y-4">
        <article className="rounded-[2rem] border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-muted text-primary">
                <Upload className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-medium">Letterboxd CSV import</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Ratings, watched history, and watchlist snapshots are
                  supported.
                </p>
              </div>
            </div>
            <Button className="h-11 rounded-xl" onClick={onImport}>
              {hasData ? 'Update data' : 'Import files'}
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <StatCard
              label="Watched"
              value={dataStatus.sources.watched?.count ?? 0}
            />
            <StatCard
              label="Rated"
              value={dataStatus.sources.ratings?.count ?? 0}
            />
            <StatCard
              label="Watchlist"
              value={dataStatus.sources.watchlist?.count ?? 0}
            />
          </div>

          {latestImport && (
            <p className="mt-4 text-xs text-muted-foreground">
              Last import {formatDate(latestImport.importedAt)}
            </p>
          )}

          <div className="mt-5 rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-sm font-medium">Letterboxd import</p>
            <div className="mt-3 space-y-2">
              {(
                [
                  ['ratings', 'Ratings'],
                  ['watched', 'Watched'],
                  ['watchlist', 'Watchlist'],
                ] as Array<[LetterboxdFileKind, string]>
              ).map(([kind, label]) => {
                const source = dataStatus.sources[kind];
                return (
                  <div
                    key={kind}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span
                      className={
                        source ? 'text-foreground' : 'text-muted-foreground'
                      }
                    >
                      <span className="mr-2 inline-block w-4 text-center text-primary">
                        {source ? '✓' : '○'}
                      </span>
                      {label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {source ? source.count.toLocaleString() : 'Not imported'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <a
            href="https://letterboxd.com/user/exportdata/"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55"
          >
            Open Letterboxd data export
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </article>

        <article className="rounded-[2rem] border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-medium">Privacy boundary</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                CSV contents never leave this device. A later TMDB enrichment
                step will send movie titles and years to a small server route,
                but never your ratings or watched dates.
              </p>
            </div>
          </div>
        </article>

        {hasData && (
          <article className="rounded-[2rem] border border-destructive/20 bg-destructive/5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-medium">Remove local data</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This only clears Movie Companion in this browser.
                </p>
              </div>
              <Button
                variant="destructive"
                className="h-11 rounded-xl"
                onClick={onClear}
              >
                <Trash2 aria-hidden="true" />
                Clear data
              </Button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-background/50 p-3 sm:p-4">
      <p className="truncate text-xl font-semibold tracking-[-0.04em] sm:text-2xl">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">
        {label}
      </p>
    </div>
  );
}
