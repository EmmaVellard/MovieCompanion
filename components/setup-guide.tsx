'use client';

import { Check, Images, KeyRound, ListChecks, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type {
  LetterboxdDataStatus,
  MovieMetadataStatusSummary,
} from '@/lib/types';

export function SetupGuide({
  dataStatus,
  metadataStatus,
  tmdbCredentialConfigured,
  enrichmentRunning,
  onImport,
  onOpenData,
  onEnrich,
}: {
  dataStatus: LetterboxdDataStatus;
  metadataStatus: MovieMetadataStatusSummary;
  tmdbCredentialConfigured: boolean;
  enrichmentRunning: boolean;
  onImport: () => void;
  onOpenData: () => void;
  onEnrich: () => void;
}) {
  const ratingsReady = Boolean(dataStatus.sources.ratings);
  const watchlistReady = Boolean(dataStatus.sources.watchlist);
  const metadataReady =
    metadataStatus.total > 0 &&
    metadataStatus.missing === 0 &&
    metadataStatus.errors === 0;
  const steps = [
    ratingsReady,
    watchlistReady,
    tmdbCredentialConfigured,
    metadataReady,
  ];
  const completed = steps.filter(Boolean).length;
  if (completed === steps.length) return null;

  return (
    <section className="mx-auto mb-8 max-w-5xl rounded-[2rem] border border-primary/20 bg-primary-muted/25 p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            First-time setup · {completed} of 4 complete
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            Make recommendations personal
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Import your Letterboxd export, then add TMDB access so the app can
            understand your ratings and enrich your watchlist.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          {(!ratingsReady || !watchlistReady) && (
            <Button className="h-11 rounded-xl" onClick={onImport}>
              <Upload aria-hidden="true" />
              Import Letterboxd ZIP
            </Button>
          )}
          {ratingsReady && watchlistReady && !tmdbCredentialConfigured && (
            <Button className="h-11 rounded-xl" onClick={onOpenData}>
              <KeyRound aria-hidden="true" />
              Add TMDB access
            </Button>
          )}
          {ratingsReady &&
            watchlistReady &&
            tmdbCredentialConfigured &&
            !metadataReady && (
              <Button
                className="h-11 rounded-xl"
                disabled={enrichmentRunning}
                onClick={onEnrich}
              >
                <Images aria-hidden="true" />
                {enrichmentRunning ? 'Enriching movies…' : 'Enrich movies'}
              </Button>
            )}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SetupStep
          complete={ratingsReady}
          icon={ListChecks}
          label="Ratings"
          detail={
            ratingsReady
              ? `${dataStatus.sources.ratings?.count.toLocaleString()} imported`
              : 'Needed for your taste'
          }
        />
        <SetupStep
          complete={watchlistReady}
          icon={Upload}
          label="Watchlist"
          detail={
            watchlistReady
              ? `${dataStatus.sources.watchlist?.count.toLocaleString()} imported`
              : 'Needed for recommendations'
          }
        />
        <SetupStep
          complete={tmdbCredentialConfigured}
          icon={KeyRound}
          label="TMDB access"
          detail={
            tmdbCredentialConfigured ? 'Saved locally' : 'For movie details'
          }
        />
        <SetupStep
          complete={metadataReady}
          icon={Images}
          label="Movie details"
          detail={
            metadataReady
              ? `${metadataStatus.total.toLocaleString()} checked`
              : metadataStatus.total > 0
                ? `${metadataStatus.missing.toLocaleString()} remaining`
                : 'Not started'
          }
        />
      </div>
    </section>
  );
}

function SetupStep({
  complete,
  icon: Icon,
  label,
  detail,
}: {
  complete: boolean;
  icon: typeof Upload;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/55 p-3">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${
          complete
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-muted-foreground'
        }`}
      >
        {complete ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Icon className="size-3.5" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
