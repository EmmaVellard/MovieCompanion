import { describe, expect, it } from 'vitest';

import { scorePersonalTaste } from '@/lib/recommendations';
import { buildTasteProfile } from '@/lib/taste-profile';
import type {
  MovieLibrary,
  MovieMetadata,
  WatchedMovie,
  WatchlistMovie,
} from '@/lib/types';

function metadata(
  id: string,
  options: Partial<MovieMetadata> = {},
): MovieMetadata {
  return {
    movieKey: id,
    provider: 'tmdb',
    status: 'matched',
    tmdbId: Number(id.replace(/\D/g, '')) || 1,
    matchedTitle: id,
    matchedYear: 2020,
    confidence: 1,
    posterPath: null,
    backdropPath: null,
    runtimeMinutes: 105,
    genres: ['Drama'],
    overview: '',
    originalLanguage: 'en',
    releaseDate: '2020-01-01',
    productionCountries: ['United States of America'],
    keywords: [],
    director: null,
    cast: [],
    candidates: [],
    attemptedAt: '2026-09-03T00:00:00Z',
    error: null,
    ...options,
  };
}

function rated(
  id: string,
  rating: number,
  options: Partial<MovieMetadata> = {},
): WatchedMovie {
  return {
    id,
    title: id,
    year: options.matchedYear ?? 2020,
    letterboxdUri: null,
    rating,
    watchedDate: null,
    sources: ['ratings'],
    metadata: metadata(id, options),
    posterUrl: null,
  };
}

function candidate(
  id: string,
  options: Partial<MovieMetadata>,
): WatchlistMovie {
  return {
    id,
    title: id,
    year: options.matchedYear ?? 2020,
    letterboxdUri: null,
    addedDate: null,
    metadata: metadata(id, options),
    posterUrl: null,
  };
}

function library(watched: WatchedMovie[]): MovieLibrary {
  return { watched, watchlist: [], tmdbImageConfiguration: null };
}

describe('Taste Profile v2', () => {
  it('regularizes a single high rating toward the overall average', () => {
    const profile = buildTasteProfile(
      library([
        rated('one', 5, { genres: ['Animation'] }),
        ...Array.from({ length: 8 }, (_, index) =>
          rated(`base-${index}`, 3, { genres: ['Drama'] }),
        ),
      ]),
    );
    const animation = profile.genres.find((stat) => stat.key === 'Animation');

    expect(animation?.regularizedRating).toBeLessThan(3.6);
    expect(
      profile.strongestPatterns.some(
        ({ stat }) => stat.dimension === 'genre' && stat.key === 'Animation',
      ),
    ).toBe(false);
  });

  it('increases confidence as the sample grows', () => {
    const small = buildTasteProfile(
      library([rated('one', 4.5, { genres: ['Thriller'] })]),
    );
    const large = buildTasteProfile(
      library(
        Array.from({ length: 8 }, (_, index) =>
          rated(`movie-${index}`, 4.5, { genres: ['Thriller'] }),
        ),
      ),
    );

    expect(large.genres[0].confidence).toBeGreaterThan(
      small.genres[0].confidence,
    );
  });

  it('does not surface a director from one watched film', () => {
    const profile = buildTasteProfile(
      library([
        rated('director-one', 5, { director: 'Single Sample' }),
        rated('other-1', 3),
        rated('other-2', 3),
      ]),
    );

    expect(
      profile.directors.find((stat) => stat.key === 'Single Sample')
        ?.sampleSize,
    ).toBe(1);
    expect(
      profile.strongestPatterns.some(
        ({ stat }) => stat.label === 'Single Sample',
      ),
    ).toBe(false);
    const scored = scorePersonalTaste(
      candidate('candidate', { director: 'Single Sample' }),
      profile,
    );
    expect(
      scored.components.find((component) => component.name === 'director')
        ?.confidence,
    ).toBe(0);
  });

  it('uses supported keyword affinity in personal taste scoring', () => {
    const profile = buildTasteProfile(
      library([
        rated('psych-1', 5, { keywords: ['psychological'] }),
        rated('psych-2', 4.5, { keywords: ['psychological'] }),
        rated('psych-3', 4.5, { keywords: ['psychological'] }),
        rated('plain-1', 2.5),
        rated('plain-2', 2.5),
      ]),
    );
    const scored = scorePersonalTaste(
      candidate('candidate', { keywords: ['psychological'] }),
      profile,
    );
    const keyword = scored.components.find((item) => item.name === 'keywords');

    expect(keyword?.score).toBeGreaterThan((profile.overallAverage! - 1) / 4);
    expect(keyword?.evidence[0]).toContain('psychological');
  });

  it('requires repeated evidence before a genre combination is displayed', () => {
    const profile = buildTasteProfile(
      library([
        rated('combo-1', 5, { genres: ['Crime', 'Mystery'] }),
        rated('base-1', 3, { genres: ['Drama'] }),
        rated('base-2', 3, { genres: ['Drama'] }),
      ]),
    );

    expect(
      profile.strongestPatterns.some(
        ({ stat }) => stat.dimension === 'genre-combination',
      ),
    ).toBe(false);
  });

  it('scores a genre combination as lift beyond its parent genres', () => {
    const profile = buildTasteProfile(
      library([
        ...Array.from({ length: 4 }, (_, index) =>
          rated(`combo-${index}`, 5, { genres: ['Crime', 'Mystery'] }),
        ),
        ...Array.from({ length: 4 }, (_, index) =>
          rated(`crime-${index}`, 2, { genres: ['Crime'] }),
        ),
        ...Array.from({ length: 4 }, (_, index) =>
          rated(`mystery-${index}`, 2, { genres: ['Mystery'] }),
        ),
      ]),
    );
    const scored = scorePersonalTaste(
      candidate('candidate', { genres: ['Crime', 'Mystery'] }),
      profile,
    );
    const genres = scored.components.find((item) => item.name === 'genres');
    const combination = scored.components.find(
      (item) => item.name === 'genre combinations',
    );

    expect(combination?.confidence).toBeGreaterThan(0);
    expect(combination?.score).toBeGreaterThan(genres?.score ?? 1);
    expect(combination?.evidence[0]).toContain('Crime + Mystery');
  });

  it('caps selected interaction patterns to prevent combinatorial growth', () => {
    const watched = Array.from({ length: 12 }, (_, index) =>
      rated(`dense-${index}`, index < 6 ? 5 : 2, {
        genres: ['Drama', 'Thriller', 'Crime', 'Mystery'],
        keywords: [
          'psychological',
          'identity',
          'revenge',
          'investigation',
          'family',
          'survival',
        ],
        productionCountries: ['Japan', 'South Korea'],
        originalLanguage: 'ja',
      }),
    );
    const profile = buildTasteProfile(library(watched));

    expect(profile.interactions.length).toBeLessThanOrEqual(32);
  });

  it('keeps missing and unresolved metadata neutral', () => {
    const missing = rated('missing', 4);
    missing.metadata = null;
    const unresolved = rated('unresolved', 3, { status: 'unmatched' });
    const profile = buildTasteProfile(library([missing, unresolved]));
    const watchlist = candidate('candidate', { status: 'unmatched' });
    const scored = scorePersonalTaste(watchlist, profile);

    expect(profile.genres).toHaveLength(0);
    expect(profile.metadataCoverage.matchedRatedMovies).toBe(0);
    expect(Number.isFinite(scored.tasteScore)).toBe(true);
    expect(
      scored.components.every((component) => component.evidence.length <= 1),
    ).toBe(true);
  });
});
