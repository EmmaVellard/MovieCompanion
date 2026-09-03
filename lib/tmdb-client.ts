'use client';

import {
  getMovieMetadataStatus,
  getMoviesNeedingMetadata,
  saveMovieMetadata,
} from '@/lib/database';
import type {
  MetadataEnrichmentProgress,
  MetadataMovieInput,
  MovieMetadata,
  MovieMetadataStatusSummary,
  TmdbImageConfiguration,
} from '@/lib/types';

interface EnrichmentResponse {
  metadata: MovieMetadata;
  configuration: TmdbImageConfiguration;
}

interface ErrorResponse {
  code?: string;
  error?: string;
}

export class MetadataEnrichmentError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1_000, 15_000);
  }
  return Math.min(750 * 2 ** attempt, 6_000);
}

async function requestMetadata(movie: MetadataMovieInput) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch('/api/tmdb/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(movie),
    });
    if (response.ok) return (await response.json()) as EnrichmentResponse;
    const details = (await response.json().catch(() => ({}))) as ErrorResponse;
    if (response.status === 429 && attempt < 2) {
      await wait(retryDelay(response, attempt));
      continue;
    }
    const code = details.code ?? `HTTP_${response.status}`;
    throw new MetadataEnrichmentError(
      details.error ?? `Metadata request failed with status ${response.status}.`,
      code,
    );
  }
  throw new MetadataEnrichmentError(
    'TMDB remained rate-limited after several retries.',
    'TMDB_RATE_LIMITED',
  );
}

function errorMetadata(movie: MetadataMovieInput, error: unknown): MovieMetadata {
  return {
    movieKey: movie.movieKey,
    provider: 'tmdb',
    status: 'error',
    tmdbId: null,
    matchedTitle: null,
    matchedYear: null,
    confidence: null,
    posterPath: null,
    backdropPath: null,
    runtimeMinutes: null,
    genres: [],
    overview: '',
    originalLanguage: null,
    releaseDate: null,
    productionCountries: [],
    keywords: [],
    director: null,
    cast: [],
    candidates: [],
    attemptedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : 'Unknown metadata error.',
  };
}

function progressFromStatus(
  status: MovieMetadataStatusSummary,
  overrides: Partial<MetadataEnrichmentProgress>,
): MetadataEnrichmentProgress {
  return {
    running: true,
    processed: 0,
    total: 0,
    matched: status.enriched,
    unresolved: status.unmatched + status.ambiguous,
    errors: status.errors,
    currentTitle: null,
    message: null,
    ...overrides,
  };
}

export async function enrichMovieMetadata({
  retryUnresolved = false,
  onProgress,
}: {
  retryUnresolved?: boolean;
  onProgress: (progress: MetadataEnrichmentProgress) => void;
}) {
  const [queue, initialStatus] = await Promise.all([
    getMoviesNeedingMetadata({ retryUnresolved }),
    getMovieMetadataStatus(),
  ]);
  onProgress(
    progressFromStatus(initialStatus, {
      total: queue.length,
      message:
        queue.length === 0 ? 'All current movies have already been checked.' : null,
    }),
  );

  let processed = 0;
  let matched = initialStatus.enriched;
  let unresolved = initialStatus.unmatched + initialStatus.ambiguous;
  let errors = initialStatus.errors;

  for (const movie of queue) {
    onProgress(
      progressFromStatus(initialStatus, {
        processed,
        total: queue.length,
        matched,
        unresolved,
        errors,
        currentTitle: movie.title,
      }),
    );
    if (movie.existingStatus === 'unmatched' || movie.existingStatus === 'ambiguous') {
      unresolved = Math.max(0, unresolved - 1);
    } else if (movie.existingStatus === 'error') {
      errors = Math.max(0, errors - 1);
    }
    try {
      const result = await requestMetadata(movie);
      await saveMovieMetadata(result.metadata, result.configuration);
      if (result.metadata.status === 'matched') matched += 1;
      else unresolved += 1;
    } catch (error) {
      if (
        error instanceof MetadataEnrichmentError &&
        ['TMDB_NOT_CONFIGURED', 'TMDB_AUTH_FAILED'].includes(error.code)
      ) {
        throw error;
      }
      await saveMovieMetadata(errorMetadata(movie, error));
      errors += 1;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Movie Companion metadata] movie failed', {
          movie,
          error,
        });
      }
    }
    processed += 1;
    onProgress(
      progressFromStatus(initialStatus, {
        processed,
        total: queue.length,
        matched,
        unresolved,
        errors,
        currentTitle: movie.title,
      }),
    );
    if (processed < queue.length) await wait(175);
  }

  const finalStatus = await getMovieMetadataStatus();
  onProgress(
    progressFromStatus(finalStatus, {
      running: false,
      processed,
      total: queue.length,
      currentTitle: null,
      message:
        queue.length === 0
          ? 'All current movies have already been checked.'
          : `Metadata enrichment finished: ${finalStatus.enriched.toLocaleString()} matched.`,
    }),
  );
  return finalStatus;
}
