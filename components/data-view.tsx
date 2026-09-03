import {
  ExternalLink,
  Images,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type {
  ImportSummary,
  LetterboxdDataStatus,
  LetterboxdFileKind,
  MetadataEnrichmentProgress,
  MovieMetadataStatusSummary,
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
  metadataStatus,
  enrichmentProgress,
  onImport,
  onEnrich,
  onClear,
}: {
  library: MovieLibrary;
  latestImport: ImportSummary | null;
  dataStatus: LetterboxdDataStatus;
  metadataStatus: MovieMetadataStatusSummary;
  enrichmentProgress: MetadataEnrichmentProgress | null;
  onImport: () => void;
  onEnrich: (retryUnresolved: boolean) => void;
  onClear: () => void;
}) {
  const hasData = library.watchlist.length + library.watched.length > 0;
  const enrichmentRunning = enrichmentProgress?.running ?? false;
  const enrichmentPercent = enrichmentProgress?.total
    ? Math.round(
        (enrichmentProgress.processed / enrichmentProgress.total) * 100,
      )
    : 0;
  const unresolved = metadataStatus.unmatched + metadataStatus.ambiguous;

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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-muted text-primary">
                <Images className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-medium">Movie metadata</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Posters, runtime, genres, keywords, and credits from TMDB.
                </p>
              </div>
            </div>
            <Button
              className="h-11 rounded-xl"
              disabled={!hasData || enrichmentRunning}
              onClick={() => onEnrich(false)}
            >
              <RefreshCw
                className={enrichmentRunning ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
              {enrichmentRunning
                ? 'Enriching…'
                : metadataStatus.missing + metadataStatus.errors > 0
                  ? 'Enrich missing metadata'
                  : 'Check metadata'}
            </Button>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-background/45 p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold tracking-[-0.04em]">
                  {metadataStatus.enriched.toLocaleString()} /{' '}
                  {metadataStatus.total.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">enriched</p>
              </div>
              {enrichmentRunning && (
                <p className="text-xs font-medium text-primary">
                  {enrichmentProgress?.processed.toLocaleString()} /{' '}
                  {enrichmentProgress?.total.toLocaleString()} checked
                </p>
              )}
            </div>
            {enrichmentRunning && (
              <>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--gradient-accent-start),var(--gradient-accent-end))] transition-[width]"
                    style={{ width: `${enrichmentPercent}%` }}
                  />
                </div>
                <p className="mt-3 truncate text-xs text-muted-foreground">
                  {enrichmentProgress?.currentTitle
                    ? `Checking ${enrichmentProgress.currentTitle}…`
                    : 'Preparing metadata enrichment…'}
                </p>
              </>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <MetadataCount label="Missing" value={metadataStatus.missing} />
              <MetadataCount
                label="Unmatched"
                value={metadataStatus.unmatched}
              />
              <MetadataCount
                label="Ambiguous"
                value={metadataStatus.ambiguous}
              />
              <MetadataCount label="Errors" value={metadataStatus.errors} />
            </div>
            {enrichmentProgress?.message && (
              <output className="mt-4 block rounded-xl border border-primary/20 bg-primary-muted/22 p-3 text-xs leading-5 text-muted-foreground">
                {enrichmentProgress.message}
              </output>
            )}
            {unresolved > 0 && !enrichmentRunning && (
              <Button
                variant="ghost"
                className="mt-3 h-10 rounded-xl px-3 text-xs text-muted-foreground"
                onClick={() => onEnrich(true)}
              >
                Retry {unresolved.toLocaleString()} unresolved{' '}
                {unresolved === 1 ? 'match' : 'matches'}
              </Button>
            )}
          </div>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Each successful or unresolved match is saved immediately, so an
            interrupted run can resume. A conservative title-and-year match is
            kept unresolved instead of risking a wrong poster.
          </p>
          <div className="mt-4 border-t border-border pt-4">
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noreferrer"
              aria-label="Visit TMDB"
              className="inline-flex rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55"
            >
              {/* Official, unmodified TMDB short logo from its attribution page. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/tmdb-logo.svg"
                alt="TMDB"
                width="137"
                height="18"
                className="h-[18px] w-auto"
              />
            </a>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground/75">
              This product uses the TMDB API but is not endorsed or certified
              by TMDB.
            </p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-border bg-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-medium">Privacy boundary</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                CSV contents, ratings, and watched dates stay in this browser.
                During metadata enrichment, only a movie title and year are
                sent through the app&apos;s server route to TMDB.
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

function MetadataCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-2.5">
      <p className="font-semibold text-foreground">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
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
