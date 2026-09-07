'use client';

import { useEffect, useState } from 'react';
import { Check, ImageOff, LoaderCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  MovieMetadataCandidate,
  TmdbImageConfiguration,
  UnresolvedMovieMatch,
} from '@/lib/types';

export function MetadataMatchDialog({
  open,
  onOpenChange,
  matches,
  imageConfiguration,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: UnresolvedMovieMatch[];
  imageConfiguration: TmdbImageConfiguration | null;
  onResolve: (
    match: UnresolvedMovieMatch,
    candidate: MovieMetadataCandidate,
  ) => Promise<void>;
}) {
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = matches[0] ?? null;

  useEffect(() => {
    if (open && matches.length === 0) onOpenChange(false);
  }, [matches.length, onOpenChange, open]);

  async function resolve(candidate: MovieMetadataCandidate) {
    if (!current) return;
    setResolvingId(candidate.tmdbId);
    setError(null);
    try {
      await onResolve(current, candidate);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'This match could not be saved.',
      );
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(820px,calc(100dvh-2rem))] overflow-y-auto border border-border bg-popover p-5 sm:max-w-2xl sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl font-semibold tracking-[-0.03em]">
            Review movie match
          </DialogTitle>
          <DialogDescription className="leading-6">
            Choose the correct TMDB movie. Movie Companion only shows this step
            when automatic matching is uncertain.
          </DialogDescription>
        </DialogHeader>

        {current && (
          <div>
            <div className="rounded-2xl border border-primary/20 bg-primary-muted/35 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                Letterboxd movie
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                {current.movie.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {current.movie.year ?? 'Year unavailable'} ·{' '}
                {matches.length.toLocaleString()}{' '}
                {matches.length === 1 ? 'match' : 'matches'} left to review
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {current.metadata.candidates.map((candidate) => {
                const posterUrl =
                  candidate.posterPath && imageConfiguration
                    ? `${imageConfiguration.secureBaseUrl}${imageConfiguration.posterSize}${candidate.posterPath}`
                    : null;
                const resolving = resolvingId === candidate.tmdbId;
                return (
                  <article
                    key={candidate.tmdbId}
                    className="flex min-w-0 gap-3 rounded-2xl border border-border bg-card p-3"
                  >
                    <div className="aspect-2/3 w-20 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={posterUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-muted-foreground">
                          <ImageOff className="size-5" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h3 className="font-medium leading-5">
                        {candidate.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {candidate.year ?? 'Year unavailable'}
                      </p>
                      {candidate.originalTitle !== candidate.title && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {candidate.originalTitle}
                        </p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        className="mt-auto h-9 rounded-lg"
                        disabled={resolvingId !== null}
                        onClick={() => void resolve(candidate)}
                      >
                        {resolving ? (
                          <LoaderCircle
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check aria-hidden="true" />
                        )}
                        Use this match
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
