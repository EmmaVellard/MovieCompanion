import { describe, expect, it } from 'vitest';

import { runOfflineEvaluation, runTemporalEvaluation } from '@/lib/evaluation';
import type { MovieLibrary, MovieMetadata, WatchedMovie } from '@/lib/types';

function movie(
  id: string,
  rating: number,
  watchedDate: string | null = null,
): WatchedMovie {
  const metadata: MovieMetadata = {
    movieKey: id,
    provider: 'tmdb',
    status: 'matched',
    tmdbId: Number(id.replace(/\D/g, '')) || 1,
    matchedTitle: id,
    matchedYear: 2020,
    confidence: 1,
    posterPath: null,
    backdropPath: null,
    runtimeMinutes: 100,
    genres: id === 'unique' ? ['Western'] : ['Drama'],
    overview: '',
    originalLanguage: 'en',
    releaseDate: '2020-01-01',
    productionCountries: ['United States of America'],
    keywords: id === 'unique' ? ['desert'] : ['family'],
    director: id === 'unique' ? 'Only Here' : 'Shared Director',
    cast: [],
    candidates: [],
    attemptedAt: '2026-09-03T00:00:00Z',
    error: null,
  };
  return {
    id,
    title: id,
    year: 2020,
    letterboxdUri: null,
    rating,
    watchedDate,
    sources: ['ratings'],
    metadata,
    posterUrl: null,
  };
}

function library(uniqueRating: number): MovieLibrary {
  return {
    watched: [
      movie('unique', uniqueRating),
      movie('base-1', 4),
      movie('base-2', 3.5),
      movie('base-3', 2.5),
      movie('base-4', 3),
      movie('base-5', 4.5),
      movie('base-6', 2),
      movie('base-7', 3.5),
    ],
    watchlist: [],
    tmdbImageConfiguration: null,
  };
}

describe('offline evaluation', () => {
  it('does not leak the held-out rating into its own prediction', () => {
    const high = runOfflineEvaluation(library(5));
    const low = runOfflineEvaluation(library(1));
    const highPrediction = high.predictions.find(
      ({ movieId }) => movieId === 'unique',
    );
    const lowPrediction = low.predictions.find(
      ({ movieId }) => movieId === 'unique',
    );

    expect(highPrediction?.predictions).toEqual(lowPrediction?.predictions);
  });

  it('reports ranking and error metrics for every ablation stage', () => {
    const result = runOfflineEvaluation(library(5));

    expect(result.method).toBe('leave-one-out');
    expect(result.metrics).toHaveLength(10);
    expect(
      result.metrics.every((metric) => metric.meanAbsoluteError !== null),
    ).toBe(true);
  });

  it('uses only earlier ratings in the time-ordered backtest', () => {
    const chronological = library(5);
    chronological.watched = chronological.watched.map((item, index) => ({
      ...item,
      watchedDate: `2025-${String(index + 1).padStart(2, '0')}-01`,
    }));
    const changedFuture = {
      ...chronological,
      watched: chronological.watched.map((item, index) =>
        index === chronological.watched.length - 1
          ? { ...item, rating: 0.5 }
          : item,
      ),
    };

    const first = runTemporalEvaluation(chronological, {
      minimumTrainingSize: 3,
    });
    const second = runTemporalEvaluation(changedFuture, {
      minimumTrainingSize: 3,
    });
    const targetId = chronological.watched[4].id;

    expect(first.method).toBe('time-ordered');
    expect(first.predictions.length).toBeGreaterThan(0);
    expect(
      first.predictions.find(({ movieId }) => movieId === targetId),
    ).toEqual(second.predictions.find(({ movieId }) => movieId === targetId));
  });

  it('excludes undated ratings from temporal predictions', () => {
    const source = library(5);
    source.watched = source.watched.map((item, index) => ({
      ...item,
      watchedDate:
        index === 0 ? null : `2025-01-${String(index).padStart(2, '0')}`,
    }));

    const result = runTemporalEvaluation(source, { minimumTrainingSize: 3 });

    expect(result.datedMovies).toBe(source.watched.length - 1);
    expect(result.predictions.some(({ movieId }) => movieId === 'unique')).toBe(
      false,
    );
  });
});
