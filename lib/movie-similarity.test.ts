import { describe, expect, it } from 'vitest';

import { movieSimilarity } from '@/lib/movie-similarity';
import type { MovieFeatures } from '@/lib/types';

const base: MovieFeatures = {
  genres: ['Thriller', 'Crime'],
  genreCombinations: ['Crime + Thriller'],
  director: 'Park Chan-wook',
  countries: ['South Korea'],
  language: 'ko',
  keywords: ['psychological', 'revenge'],
  runtimeBand: '120-150',
  cast: ['Kim Min-hee'],
  decade: '2010',
  year: 2016,
  runtimeMinutes: 145,
};

describe('movieSimilarity', () => {
  it('ranks a richly similar movie above a release-era-only match', () => {
    const rich = movieSimilarity(base, {
      ...base,
      year: 2018,
      runtimeMinutes: 132,
    });
    const eraOnly = movieSimilarity(base, {
      ...base,
      genres: ['Comedy'],
      director: 'Someone Else',
      countries: ['France'],
      language: 'fr',
      keywords: ['friendship'],
      cast: ['Someone Else'],
      year: 2016,
      runtimeMinutes: 145,
    });

    expect(rich.score).toBeGreaterThan(eraOnly.score);
    expect(rich.sharedFeatures).toContain('psychological');
  });

  it('returns a neutral low-confidence result when metadata is absent', () => {
    const empty: MovieFeatures = {
      genres: [],
      genreCombinations: [],
      director: null,
      countries: [],
      language: null,
      keywords: [],
      runtimeBand: null,
      cast: [],
      decade: null,
      year: null,
      runtimeMinutes: null,
    };

    expect(movieSimilarity(empty, empty)).toMatchObject({
      score: 0.5,
      confidence: 0,
    });
  });
});
