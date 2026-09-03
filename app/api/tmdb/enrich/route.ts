import { NextResponse } from 'next/server';

import {
  chooseTmdbMatch,
  type TmdbMatchDecision,
  type TmdbSearchCandidate,
} from '@/lib/tmdb-matching';
import type {
  MetadataMovieInput,
  MovieMetadata,
  TmdbImageConfiguration,
} from '@/lib/types';

export const runtime = 'nodejs';

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
  titles: Array<{ iso_3166_1: string; title: string; type: string }>;
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  release_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  genres: Array<{ id: number; name: string }>;
  overview: string;
  original_language: string;
  production_countries: Array<{ iso_3166_1: string; name: string }>;
  keywords?: {
    keywords?: Array<{ id: number; name: string }>;
    results?: Array<{ id: number; name: string }>;
  };
  credits?: {
    cast?: Array<{ id: number; name: string; order: number }>;
    crew?: Array<{ id: number; name: string; job: string }>;
  };
}

class TmdbRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null,
  ) {
    super(message);
  }
}

function credential() {
  const readToken = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();
  return { readToken, apiKey };
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const { readToken, apiKey } = credential();
  if (!readToken && !apiKey) {
    throw new TmdbRequestError('TMDB is not configured.', 503, null);
  }
  const url = new URL(`${TMDB_API_ROOT}${path}`);
  if (!readToken && apiKey) url.searchParams.set('api_key', apiKey);
  const response = await fetch(url, {
    headers: readToken ? { Authorization: `Bearer ${readToken}` } : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new TmdbRequestError(
      `TMDB request failed with status ${response.status}.`,
      response.status,
      response.headers.get('retry-after'),
    );
  }
  return (await response.json()) as T;
}

function chooseImageSize(sizes: string[], preferred: string) {
  if (sizes.includes(preferred)) return preferred;
  const numeric = sizes
    .filter((size) => /^w\d+$/.test(size))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return numeric.find((size) => Number(size.slice(1)) >= 300) ?? numeric.at(-1) ?? 'original';
}

async function getImageConfiguration() {
  if (cachedConfiguration) return cachedConfiguration;
  const response = await tmdbFetch<TmdbConfigurationResponse>('/configuration');
  cachedConfiguration = {
    id: 'tmdb',
    secureBaseUrl: response.images.secure_base_url,
    posterSize: chooseImageSize(response.images.poster_sizes, 'w342'),
    backdropSize: chooseImageSize(response.images.backdrop_sizes, 'w780'),
    fetchedAt: new Date().toISOString(),
  };
  return cachedConfiguration;
}

async function searchMovie(title: string, year: number | null) {
  const parameters = new URLSearchParams({
    query: title,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  });
  if (year !== null) parameters.set('primary_release_year', String(year));
  const response = await tmdbFetch<TmdbSearchResponse>(
    `/search/movie?${parameters.toString()}`,
  );
  return response.results;
}

async function addAlternativeTitles(candidates: TmdbSearchCandidate[]) {
  const enriched = await Promise.all(
    candidates.slice(0, 3).map(async (candidate) => {
      if (candidate.alternative_titles) return candidate;
      const response = await tmdbFetch<TmdbAlternativeTitlesResponse>(
        `/movie/${candidate.id}/alternative_titles`,
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
  for (const candidate of [...first, ...second]) byId.set(candidate.id, candidate);
  return [...byId.values()];
}

async function findMatch(title: string, year: number | null) {
  let candidates = await searchMovie(title, year);
  let decision = chooseTmdbMatch(title, year, candidates);
  if (decision.status !== 'matched' && candidates.length > 0) {
    candidates = await addAlternativeTitles(candidates);
    decision = chooseTmdbMatch(title, year, candidates);
  }
  if (year !== null && decision.status !== 'matched') {
    candidates = mergeCandidates(candidates, await searchMovie(title, null));
    candidates = await addAlternativeTitles(candidates);
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
): Promise<MovieMetadata> {
  const details = await tmdbFetch<TmdbMovieDetails>(
    `/movie/${decision.match.id}?language=en-US&append_to_response=keywords,credits`,
  );
  const keywords = details.keywords?.keywords ?? details.keywords?.results ?? [];
  const director = details.credits?.crew?.find((person) => person.job === 'Director');
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
    matchedYear: details.release_date ? Number(details.release_date.slice(0, 4)) : null,
    confidence: decision.confidence,
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    runtimeMinutes: details.runtime && details.runtime > 0 ? details.runtime : null,
    genres: details.genres.map((genre) => genre.name),
    overview: details.overview ?? '',
    originalLanguage: details.original_language || null,
    releaseDate: details.release_date || null,
    productionCountries: details.production_countries.map((country) => country.name),
    keywords: keywords.map((keyword) => keyword.name),
    director: director?.name ?? null,
    cast,
    candidates: decision.candidates,
    attemptedAt: new Date().toISOString(),
    error: null,
  };
}

export async function GET() {
  const { readToken, apiKey } = credential();
  return NextResponse.json({ configured: Boolean(readToken || apiKey) });
}

export async function POST(request: Request) {
  const { readToken, apiKey } = credential();
  if (!readToken && !apiKey) {
    return NextResponse.json(
      {
        code: 'TMDB_NOT_CONFIGURED',
        error: 'Add TMDB_READ_ACCESS_TOKEN to .env.local, then restart the app.',
      },
      { status: 503 },
    );
  }

  let movie: MetadataMovieInput;
  try {
    movie = (await request.json()) as MetadataMovieInput;
  } catch {
    return NextResponse.json({ error: 'The request body is not valid JSON.' }, { status: 400 });
  }
  if (!movie.movieKey || !movie.title?.trim()) {
    return NextResponse.json({ error: 'movieKey and title are required.' }, { status: 400 });
  }

  try {
    const [configuration, decision] = await Promise.all([
      getImageConfiguration(),
      findMatch(movie.title.trim(), movie.year),
    ]);
    const metadata =
      decision.status === 'matched'
        ? await matchedMetadata(movie, decision)
        : unresolvedMetadata(movie, decision);
    return NextResponse.json({ metadata, configuration });
  } catch (error) {
    if (error instanceof TmdbRequestError) {
      const authenticationFailed = [401, 403].includes(error.status);
      const status = authenticationFailed ? 502 : error.status;
      return NextResponse.json(
        {
          code: authenticationFailed
            ? 'TMDB_AUTH_FAILED'
            : 'TMDB_REQUEST_FAILED',
          error:
            authenticationFailed
              ? 'TMDB rejected the configured credential.'
              : error.message,
        },
        {
          status,
          headers: error.retryAfter ? { 'Retry-After': error.retryAfter } : undefined,
        },
      );
    }
    console.error('[Movie Companion metadata] enrichment failed', error);
    return NextResponse.json(
      { code: 'METADATA_ERROR', error: 'Metadata enrichment failed unexpectedly.' },
      { status: 500 },
    );
  }
}
