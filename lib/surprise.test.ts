import { describe, expect, it } from 'vitest';

import { extractMovieFeatures } from '@/lib/movie-features';
import { scoreHabitDistance, surpriseMe } from '@/lib/recommendations';
import { buildTasteProfile } from '@/lib/taste-profile';
import type {
  MovieLibrary,
  MovieMetadata,
  WatchedMovie,
  WatchlistMovie,
} from '@/lib/types';

function metadata(
  id: string,
  options: {
    genres: string[];
    country: string;
    language: string;
    keywords: string[];
    year: number;
    runtime: number;
  },
): MovieMetadata {
  return {
    movieKey: id,
    provider: 'tmdb',
    status: 'matched',
    tmdbId: Number(id.replace(/\D/g, '')) || 1,
    matchedTitle: id,
    matchedYear: options.year,
    confidence: 1,
    posterPath: null,
    backdropPath: null,
    runtimeMinutes: options.runtime,
    genres: options.genres,
    overview: options.keywords.join(' '),
    originalLanguage: options.language,
    releaseDate: `${options.year}-01-01`,
    productionCountries: [options.country],
    keywords: options.keywords,
    director: null,
    cast: [],
    candidates: [],
    attemptedAt: '2026-09-03T00:00:00Z',
    error: null,
  };
}

function rated(
  id: string,
  rating: number,
  options: Parameters<typeof metadata>[1],
): WatchedMovie {
  return {
    id,
    title: id,
    year: options.year,
    letterboxdUri: null,
    rating,
    watchedDate: '2025-01-01',
    sources: ['ratings'],
    metadata: metadata(id, options),
    posterUrl: null,
  };
}

function watchlist(
  id: string,
  options: Parameters<typeof metadata>[1],
): WatchlistMovie {
  return {
    id,
    title: id,
    year: options.year,
    letterboxdUri: null,
    addedDate: '2024-01-01',
    metadata: metadata(id, options),
    posterUrl: null,
  };
}

const familiarFeatures = {
  genres: ['Drama'],
  country: 'United States of America',
  language: 'en',
  keywords: ['family'],
  year: 2020,
  runtime: 105,
};

const dislikedFeatures = {
  genres: ['Action'],
  country: 'United States of America',
  language: 'en',
  keywords: ['military'],
  year: 2020,
  runtime: 105,
};

const exploratoryFeatures = {
  genres: ['Drama', 'Western'],
  country: 'Japan',
  language: 'ja',
  keywords: ['samurai'],
  year: 1965,
  runtime: 165,
};

function sourceLibrary(): MovieLibrary {
  const watched = [
    ...Array.from({ length: 10 }, (_, index) =>
      rated(`liked-${index}`, 4.5, familiarFeatures),
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      rated(`low-${index}`, 2, dislikedFeatures),
    ),
  ];
  return {
    watched,
    watchlist: [
      watchlist('familiar-pick', familiarFeatures),
      watchlist('exploratory-pick', exploratoryFeatures),
    ],
    tmdbImageConfiguration: null,
  };
}

describe('Surprise Me policies', () => {
  it('measures habit distance across several metadata dimensions', () => {
    const library = sourceLibrary();
    const profile = buildTasteProfile(library);
    const familiar = scoreHabitDistance(
      extractMovieFeatures(library.watchlist[0].metadata, 2020),
      profile,
    );
    const exploratory = scoreHabitDistance(
      extractMovieFeatures(library.watchlist[1].metadata, 1965),
      profile,
    );

    expect(exploratory.score).toBeGreaterThan(familiar.score + 0.3);
    expect(exploratory.components.map(({ feature }) => feature)).toEqual(
      expect.arrayContaining(['genres', 'countries', 'language', 'decade']),
    );
  });

  it('uses different objectives for Safe, Risky, and Wildcard', () => {
    const library = sourceLibrary();
    const profile = buildTasteProfile(library);
    const safe = surpriseMe({ library, profile, mode: 'safe', nowMs: 1 });
    const risky = surpriseMe({ library, profile, mode: 'risky', nowMs: 1 });
    const wildcard = surpriseMe({
      library,
      profile,
      mode: 'wildcard',
      nowMs: 1,
    });

    expect(safe?.movie.id).toBe('familiar-pick');
    expect(risky?.movie.id).toBe('exploratory-pick');
    expect(wildcard?.movie.id).toBe('exploratory-pick');
    expect(wildcard?.signals.positiveBridge).not.toBeNull();
    expect(wildcard?.reasons[0]).toContain('less familiar');
  });

  it('refuses a Wildcard that has novelty but no positive bridge', () => {
    const library = sourceLibrary();
    library.watchlist = [
      watchlist('unconnected', {
        ...exploratoryFeatures,
        genres: ['Western'],
      }),
    ];
    const profile = buildTasteProfile(library);

    expect(
      surpriseMe({ library, profile, mode: 'wildcard', nowMs: 1 }),
    ).toBeNull();
  });
});
