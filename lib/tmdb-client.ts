'use client';

import {
  getMovieMetadataStatus,
  getMoviesNeedingMetadata,
  getTmdbReadAccessToken,
  saveMovieMetadata,
} from '@/lib/database';
import {
  chooseTmdbMatch,
  type TmdbMatchDecision,
  type TmdbSearchCandidate,
} from '@/lib/tmdb-matching';
import type {
  MetadataEnrichmentProgress,
  MetadataMovieInput,
  MovieMetadata,
  MovieMetadataCandidate,
  MovieMetadataStatusSummary,
  TmdbImageConfiguration,
  UnresolvedMovieMatch,
} from '@/lib/types';

const TMDB_API_ROOT = 'https://api.themoviedb.org/3';
let cachedConfiguration: TmdbImageConfiguration | null = null;

interface TmdbConfigurationResponse {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
    backdrop_sizes: string[];
  };
}

interface TmdbSearchResponse {
  results: TmdbSearchCandidate[];
}

interface TmdbAlternativeTitlesResponse {
  titles: Array<{ title: string }>;
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  genres: Array<{ name: string }>;
  overview: string;
  original_language: string;
  production_countries: Array<{ name: string }>;
  keywords?: {
    keywords?: Array<{ name: string }>;
    results?: Array<{ name: string }>;
  };
  credits?: {
    cast?: Array<{ name: string; order: number }>;
    crew?: Array<{ name: string; job: string }>;
  };
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

async function tmdbFetch<T>(path: string, readAccessToken: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${TMDB_API_ROOT}${path}`, {
        headers: { Authorization: `Bearer ${readAccessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (attempt < 2) {
        await wait(750 * 2 ** attempt);
        continue;
      }
      throw new MetadataEnrichmentError(
        error instanceof Error
          ? `TMDB could not be reached: ${error.message}`
          : 'TMDB could not be reached.',
        'TMDB_NETWORK_ERROR',
      );
    }

    if (response.ok) return (await response.json()) as T;
    if (response.status === 429 && attempt < 2) {
      await wait(retryDelay(response, attempt));
      continue;
    }
    if ([401, 403].includes(response.status)) {
      throw new MetadataEnrichmentError(
        'TMDB rejected the saved credential. Check the API Read Access Token in Data.',
        'TMDB_AUTH_FAILED',
      );
    }
    throw new MetadataEnrichmentError(
      `TMDB request failed with status ${response.status}.`,
      response.status === 429 ? 'TMDB_RATE_LIMITED' : 'TMDB_REQUEST_FAILED',
    );
  }
  throw new MetadataEnrichmentError(
    'TMDB remained rate-limited after several retries.',
    'TMDB_RATE_LIMITED',
  );
}

function chooseImageSize(sizes: string[], preferred: string) {
  if (sizes.includes(preferred)) return preferred;
  const numeric = sizes
    .filter((size) => /^w\d+$/.test(size))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return (
    numeric.find((size) => Number(size.slice(1)) >= 300) ??
    numeric.at(-1) ??
    'original'
  );
}

async function getImageConfiguration(readAccessToken: string) {
  if (cachedConfiguration) return cachedConfiguration;
  const response = await tmdbFetch<TmdbConfigurationResponse>(
    '/configuration',
    readAccessToken,
  );
  cachedConfiguration = {
    id: 'tmdb',
    secureBaseUrl: response.images.secure_base_url,
    posterSize: chooseImageSize(response.images.poster_sizes, 'w342'),
    backdropSize: chooseImageSize(response.images.backdrop_sizes, 'w780'),
    fetchedAt: new Date().toISOString(),
  };
  return cachedConfiguration;
}

async function searchMovie(
  title: string,
  year: number | null,
  readAccessToken: string,
) {
  const parameters = new URLSearchParams({
    query: title,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  });
  if (year !== null) parameters.set('primary_release_year', String(year));
  const response = await tmdbFetch<TmdbSearchResponse>(
    `/search/movie?${parameters.toString()}`,
    readAccessToken,
  );
  return response.results;
}

async function addAlternativeTitles(
  candidates: TmdbSearchCandidate[],
  readAccessToken: string,
) {
  const enriched = await Promise.all(
    candidates.slice(0, 3).map(async (candidate) => {
      if (candidate.alternative_titles) return candidate;
      const response = await tmdbFetch<TmdbAlternativeTitlesResponse>(
        `/movie/${candidate.id}/alternative_titles`,
        readAccessToken,
      );
      return {
        ...candidate,
        alternative_titles: response.titles.map((item) => item.title),
      };
    }),
  );
  const enrichedById = new Map(
    enriched.map((candidate) => [candidate.id, candidate]),
  );
  return candidates.map(
    (candidate) => enrichedById.get(candidate.id) ?? candidate,
  );
}

function mergeCandidates(
  first: TmdbSearchCandidate[],
  second: TmdbSearchCandidate[],
) {
  const byId = new Map<number, TmdbSearchCandidate>();
  for (const candidate of [...first, ...second]) {
    byId.set(candidate.id, candidate);
  }
  return [...byId.values()];
}

async function findMatch(
  title: string,
  year: number | null,
  readAccessToken: string,
) {
  let candidates = await searchMovie(title, year, readAccessToken);
  let decision = chooseTmdbMatch(title, year, candidates);
  if (decision.status !== 'matched' && candidates.length > 0) {
    candidates = await addAlternativeTitles(candidates, readAccessToken);
    decision = chooseTmdbMatch(title, year, candidates);
  }
  if (year !== null && decision.status !== 'matched') {
    candidates = mergeCandidates(
      candidates,
      await searchMovie(title, null, readAccessToken),
    );
    candidates = await addAlternativeTitles(candidates, readAccessToken);
    decision = chooseTmdbMatch(title, year, candidates);
  }
  return decision;
}

function unresolvedMetadata(
  movie: MetadataMovieInput,
  decision: Exclude<TmdbMatchDecision, { status: 'matched' }>,
): MovieMetadata {
  return {
    movieKey: movie.movieKey,
    provider: 'tmdb',
    status: decision.status,
    tmdbId: null,
    matchedTitle: null,
    matchedYear: null,
    confidence: decision.confidence,
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
    candidates: decision.candidates,
    attemptedAt: new Date().toISOString(),
    error: null,
  };
}

async function matchedMetadata(
  movie: MetadataMovieInput,
  decision: Extract<TmdbMatchDecision, { status: 'matched' }>,
  readAccessToken: string,
): Promise<MovieMetadata> {
  const details = await tmdbFetch<TmdbMovieDetails>(
    `/movie/${decision.match.id}?language=en-US&append_to_response=keywords,credits`,
    readAccessToken,
  );
  const keywords =
    details.keywords?.keywords ?? details.keywords?.results ?? [];
  const director = details.credits?.crew?.find(
    (person) => person.job === 'Director',
  );
  const cast = [...(details.credits?.cast ?? [])]
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map((person) => person.name);

  return {
    movieKey: movie.movieKey,
    provider: 'tmdb',
    status: 'matched',
    tmdbId: details.id,
    matchedTitle: details.title,
    matchedYear: details.release_date
      ? Number(details.release_date.slice(0, 4))
      : null,
    confidence: decision.confidence,
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    runtimeMinutes:
      details.runtime && details.runtime > 0 ? details.runtime : null,
    genres: details.genres.map((genre) => genre.name),
    overview: details.overview ?? '',
    originalLanguage: details.original_language || null,
    releaseDate: details.release_date || null,
    productionCountries: details.production_countries.map(
      (country) => country.name,
    ),
    keywords: keywords.map((keyword) => keyword.name),
    director: director?.name ?? null,
    cast,
    candidates: decision.candidates,
    matchMethod: 'automatic',
    attemptedAt: new Date().toISOString(),
    error: null,
  };
}

async function requestMetadata(
  movie: MetadataMovieInput,
  readAccessToken: string,
) {
  const [configuration, decision] = await Promise.all([
    getImageConfiguration(readAccessToken),
    findMatch(movie.title.trim(), movie.year, readAccessToken),
  ]);
  return {
    configuration,
    metadata:
      decision.status === 'matched'
        ? await matchedMetadata(movie, decision, readAccessToken)
        : unresolvedMetadata(movie, decision),
  };
}

export async function resolveMovieMetadataCandidate(
  unresolved: UnresolvedMovieMatch,
  candidate: MovieMetadataCandidate,
) {
  const readAccessToken = await getTmdbReadAccessToken();
  if (!readAccessToken) {
    throw new MetadataEnrichmentError(
      'Save a TMDB API Read Access Token in Data before resolving matches.',
      'TMDB_NOT_CONFIGURED',
    );
  }

  const decision: Extract<TmdbMatchDecision, { status: 'matched' }> = {
    status: 'matched',
    match: {
      id: candidate.tmdbId,
      title: candidate.title,
      original_title: candidate.originalTitle,
      release_date: candidate.year ? `${candidate.year}-01-01` : undefined,
      poster_path: candidate.posterPath,
    },
    confidence: candidate.confidence,
    candidates: unresolved.metadata.candidates,
  };
  const [configuration, automaticMetadata] = await Promise.all([
    getImageConfiguration(readAccessToken),
    matchedMetadata(unresolved.movie, decision, readAccessToken),
  ]);
  const metadata: MovieMetadata = {
    ...automaticMetadata,
    matchMethod: 'manual',
  };
  await saveMovieMetadata(metadata, configuration);
  return metadata;
}

function errorMetadata(
  movie: MetadataMovieInput,
  error: unknown,
): MovieMetadata {
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
  const readAccessToken = await getTmdbReadAccessToken();
  if (!readAccessToken) {
    throw new MetadataEnrichmentError(
      'Save a TMDB API Read Access Token in Data before enriching movies.',
      'TMDB_NOT_CONFIGURED',
    );
  }

  const [queue, initialStatus] = await Promise.all([
    getMoviesNeedingMetadata({ retryUnresolved }),
    getMovieMetadataStatus(),
  ]);
  onProgress(
    progressFromStatus(initialStatus, {
      total: queue.length,
      message:
        queue.length === 0
          ? 'All current movies have already been checked.'
          : null,
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
    if (
      movie.existingStatus === 'unmatched' ||
      movie.existingStatus === 'ambiguous'
    ) {
      unresolved = Math.max(0, unresolved - 1);
    } else if (movie.existingStatus === 'error') {
      errors = Math.max(0, errors - 1);
    }
    try {
      const result = await requestMetadata(movie, readAccessToken);
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
