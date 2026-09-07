import { describe, expect, it } from 'vitest';

import { recommendMovies } from '@/lib/recommendations';
import { buildTasteProfile } from '@/lib/taste-profile';
import type {
  MovieLibrary,
  MovieMetadata,
  RecommendationContext,
  WatchedMovie,
  WatchlistMovie,
} from '@/lib/types';

const NOW = Date.parse('2026-09-03T12:00:00Z');

function metadata(
  movieKey: string,
  runtimeMinutes: number | null,
  genres: string[],
  keywords: string[] = [],
): MovieMetadata {
  return {
    movieKey,
    provider: 'tmdb',
    status: 'matched',
    tmdbId: Number(movieKey.replace(/\D/g, '')) || 1,
    matchedTitle: movieKey,
    matchedYear: 2020,
    confidence: 1,
    posterPath: `/poster-${movieKey}.jpg`,
    backdropPath: null,
    runtimeMinutes,
    genres,
    overview: keywords.join(' '),
    originalLanguage: 'en',
    releaseDate: '2020-01-01',
    productionCountries: ['United States of America'],
    keywords,
    director: null,
    cast: [],
    candidates: [],
    attemptedAt: '2026-09-03T00:00:00Z',
    error: null,
  };
}

function watchlistMovie(
  id: string,
  title: string,
  runtime: number | null,
  genres: string[],
  keywords: string[] = [],
): WatchlistMovie {
  return {
    id,
    title,
    year: 2020,
    letterboxdUri: null,
    addedDate: '2025-01-01',
    metadata: metadata(id, runtime, genres, keywords),
    posterUrl: `https://image.test/${id}.jpg`,
  };
}

function watchedMovie(id: string): WatchedMovie {
  return {
    id,
    title: `Watched ${id}`,
    year: 2020,
    letterboxdUri: null,
    rating: null,
    watchedDate: '2026-01-01',
    sources: ['watched'],
    metadata: null,
    posterUrl: null,
  };
}

const candidates = [
  watchlistMovie('comfort-1', 'Comfort Movie', 88, ['Comedy', 'Family'], [
    'feel-good',
    'friendship',
  ]),
  watchlistMovie('fun-2', 'Adventure Movie', 95, ['Adventure', 'Comedy'], [
    'road trip',
  ]),
  watchlistMovie('intense-3', 'Intense Movie', 118, ['Thriller', 'Crime'], [
    'psychological',
    'suspense',
  ]),
  watchlistMovie('horror-4', 'Horror Movie', 105, ['Horror', 'Mystery'], [
    'investigation',
  ]),
  watchlistMovie('deep-5', 'Deep Movie', 145, ['Science Fiction', 'Drama'], [
    'philosophy',
    'identity',
  ]),
  watchlistMovie('romance-6', 'Date Movie', 110, ['Romance', 'Drama'], [
    'love',
    'cinematography',
  ]),
  watchlistMovie('long-7', 'Long War Movie', 180, ['War', 'Action'], [
    'survival',
  ]),
  watchlistMovie('short-8', 'Short Documentary', 82, ['Documentary'], [
    'society',
  ]),
];

function library(
  watchlist: WatchlistMovie[] = candidates,
  watched: WatchedMovie[] = [],
): MovieLibrary {
  return { watched, watchlist, tmdbImageConfiguration: null };
}

const baseContext: RecommendationContext = {
  moods: [],
  runtimeLimit: null,
  watchingWith: 'alone',
  energy: 'normal',
};

function run(
  context: RecommendationContext,
  sourceLibrary = library(),
  excludedIds: string[] = [],
) {
  return recommendMovies({
    library: sourceLibrary,
    profile: buildTasteProfile(sourceLibrary),
    context,
    excludedIds,
    runIndex: 2,
    nowMs: NOW,
  });
}

describe('recommendMovies', () => {
  it('treats a 90-minute limit as a hard constraint', () => {
    const missing = watchlistMovie('missing-9', 'Missing Runtime', null, [
      'Comedy',
    ]);
    const result = run(
      { ...baseContext, runtimeLimit: 90 },
      library([...candidates, missing]),
    );

    expect(
      result.recommendations.every(
        ({ movie }) => (movie.metadata?.runtimeMinutes ?? Infinity) <= 90,
      ),
    ).toBe(true);
    expect(result.recommendations.map(({ movie }) => movie.id)).not.toContain(
      'long-7',
    );
    expect(result.diagnostics.excludedMissingRuntime).toBe(1);
  });

  it('changes ranking when the selected mood changes', () => {
    const comforting = run({ ...baseContext, moods: ['comforting'] });
    const intense = run({ ...baseContext, moods: ['intense'] });

    expect(comforting.recommendations[0]?.movie.id).toBe('comfort-1');
    expect(intense.recommendations[0]?.movie.id).toBe('intense-3');
  });

  it('materially separates contrasting full viewing contexts', () => {
    const contextA = run({
      moods: ['comforting'],
      runtimeLimit: 120,
      watchingWith: 'friends',
      energy: 'easy',
    });
    const contextB = run({
      moods: ['intense'],
      runtimeLimit: null,
      watchingWith: 'alone',
      energy: 'full-attention',
    });
    const firstIds = contextA.recommendations.map(({ movie }) => movie.id);
    const secondIds = contextB.recommendations.map(({ movie }) => movie.id);

    expect(firstIds).toEqual(['comfort-1', 'fun-2', 'romance-6']);
    expect(secondIds).toEqual(['intense-3', 'long-7', 'horror-4']);
  });

  it('diversifies near-equal candidates without leaving the strongest tier', () => {
    const similarThrillers = [
      watchlistMovie(
        'movie-20',
        'Thriller One',
        105,
        ['Thriller', 'Mystery'],
        ['psychological', 'investigation'],
      ),
      watchlistMovie(
        'movie-35',
        'Thriller Two',
        105,
        ['Thriller', 'Mystery'],
        ['psychological', 'investigation'],
      ),
      watchlistMovie(
        'movie-33',
        'Thriller Three',
        105,
        ['Thriller', 'Mystery'],
        ['psychological', 'investigation'],
      ),
    ];
    const alternatives = [
      watchlistMovie(
        'movie-13',
        'Warm Comedy',
        105,
        ['Comedy'],
        ['friendship'],
      ),
      watchlistMovie(
        'movie-2',
        'Nature Documentary',
        105,
        ['Documentary'],
        ['nature'],
      ),
      watchlistMovie(
        'movie-10',
        'Animated Journey',
        105,
        ['Animation'],
        ['coming of age'],
      ),
    ];

    const result = run(
      baseContext,
      library([...similarThrillers, ...alternatives]),
    );
    const thrillerCount = result.recommendations.filter(({ movie }) =>
      movie.metadata?.genres.includes('Thriller'),
    ).length;

    expect(result.recommendations).toHaveLength(3);
    expect(thrillerCount).toBeLessThanOrEqual(1);
    expect(result.diagnostics.diversityPromotions).toBeGreaterThan(0);
    expect(
      result.recommendations.some(({ reasons }) =>
        reasons.some((reason) => reason.startsWith('Adds variety')),
      ),
    ).toBe(true);
  });

  it('does not use diversity to promote a weak contextual match', () => {
    const strongMatches = [
      watchlistMovie(
        'strong-1',
        'Strong One',
        105,
        ['Thriller', 'Crime'],
        ['psychological', 'suspense'],
      ),
      watchlistMovie(
        'strong-2',
        'Strong Two',
        105,
        ['Thriller', 'Crime'],
        ['psychological', 'suspense'],
      ),
      watchlistMovie(
        'strong-3',
        'Strong Three',
        105,
        ['Thriller', 'Crime'],
        ['psychological', 'suspense'],
      ),
    ];
    const weakMatches = [
      watchlistMovie('weak-1', 'Quiet Comedy', 105, ['Comedy'], ['friendship']),
      watchlistMovie('weak-2', 'Nature Film', 105, ['Documentary'], ['nature']),
      watchlistMovie('weak-3', 'Gentle Romance', 105, ['Romance'], ['love']),
    ];

    const result = run(
      { ...baseContext, moods: ['intense'] },
      library([...strongMatches, ...weakMatches]),
    );

    expect(
      result.recommendations.every(({ movie }) =>
        movie.metadata?.genres.includes('Thriller'),
      ),
    ).toBe(true);
  });

  it('changes ranking when the selected energy changes', () => {
    const easy = run({ ...baseContext, energy: 'easy' });
    const fullAttention = run({ ...baseContext, energy: 'full-attention' });

    expect(easy.recommendations[0]?.movie.id).toBe('comfort-1');
    expect(fullAttention.recommendations[0]?.movie.id).not.toBe('comfort-1');
    expect(fullAttention.recommendations[0]?.signals.tonightScore).toBeGreaterThan(
      easy.recommendations.find(({ movie }) => movie.id === 'intense-3')?.signals
        .tonightScore ?? 0,
    );
  });

  it('is stable for identical inputs and run seed', () => {
    const first = run({ ...baseContext, moods: ['thought-provoking'] });
    const second = run({ ...baseContext, moods: ['thought-provoking'] });

    expect(second.recommendations).toEqual(first.recommendations);
  });

  it('uses the next eligible tier for Try Again', () => {
    const first = run({ ...baseContext, moods: ['fun'] });
    const firstIds = first.recommendations.map(({ movie }) => movie.id);
    const second = run({ ...baseContext, moods: ['fun'] }, library(), firstIds);

    expect(second.recommendations).toHaveLength(3);
    expect(second.recommendations.map(({ movie }) => movie.id)).not.toEqual(
      expect.arrayContaining(firstIds),
    );
  });

  it('returns only movies that exist in the imported watchlist', () => {
    const source = library(candidates, [watchedMovie('watched-only')]);
    const result = run(baseContext, source);
    const watchlistIds = new Set(source.watchlist.map((movie) => movie.id));

    expect(
      result.recommendations.every(({ movie }) => watchlistIds.has(movie.id)),
    ).toBe(true);
  });

  it('never recommends a watchlist movie that is already watched', () => {
    const source = library(candidates, [watchedMovie('intense-3')]);
    const result = run({ ...baseContext, moods: ['intense'] }, source);

    expect(result.recommendations.map(({ movie }) => movie.id)).not.toContain(
      'intense-3',
    );
    expect(result.diagnostics.excludedWatched).toBe(1);
  });
});
