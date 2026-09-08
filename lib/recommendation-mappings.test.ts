import { describe, expect, it } from 'vitest';

import {
  scoreCompany,
  scoreEnergy,
  scoreMood,
} from '@/lib/recommendation-mappings';
import type { MovieMetadata } from '@/lib/types';

function metadata(
  id: string,
  {
    genres = [],
    keywords = [],
    overview = '',
    runtimeMinutes = 105,
  }: {
    genres?: string[];
    keywords?: string[];
    overview?: string;
    runtimeMinutes?: number;
  },
): MovieMetadata {
  return {
    movieKey: id,
    provider: 'tmdb',
    status: 'matched',
    tmdbId: 1,
    matchedTitle: id,
    matchedYear: 2020,
    confidence: 1,
    posterPath: null,
    backdropPath: null,
    runtimeMinutes,
    genres,
    overview,
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

describe('recommendation context mappings', () => {
  it('does not describe bleak horror as comforting because it is dramatic', () => {
    const warm = metadata('warm', {
      genres: ['Comedy', 'Family'],
      keywords: ['feel-good', 'friendship'],
    });
    const bleak = metadata('bleak', {
      genres: ['Drama', 'Horror'],
      keywords: ['grief', 'serial killer', 'bleak'],
    });

    expect(scoreMood(warm, 'comforting').score).toBeGreaterThan(
      scoreMood(bleak, 'comforting').score,
    );
  });

  it('requires explicit visual evidence for a visually beautiful match', () => {
    const visual = metadata('visual', {
      genres: ['Drama'],
      keywords: ['cinematography', 'landscape'],
    });
    const generic = metadata('generic', { genres: ['Drama'] });

    expect(scoreMood(visual, 'visually-beautiful').score).toBeGreaterThan(
      scoreMood(generic, 'visually-beautiful').score,
    );
    expect(scoreMood(generic, 'visually-beautiful').available).toBe(false);
  });

  it('separates an easy watch from a long demanding film', () => {
    const easy = metadata('easy', {
      genres: ['Comedy'],
      keywords: ['feel-good'],
      runtimeMinutes: 88,
    });
    const demanding = metadata('demanding', {
      genres: ['Drama'],
      keywords: ['nonlinear', 'slow burn', 'existential'],
      runtimeMinutes: 170,
    });

    expect(scoreEnergy(easy, 'easy').score).toBeGreaterThan(
      scoreEnergy(demanding, 'easy').score,
    );
    expect(scoreEnergy(demanding, 'full-attention').score).toBeGreaterThan(
      scoreEnergy(easy, 'full-attention').score,
    );
  });

  it('uses relationship evidence rather than generic drama for date mode', () => {
    const romance = metadata('romance', {
      genres: ['Romance'],
      keywords: ['relationship', 'love'],
    });
    const genericDrama = metadata('drama', { genres: ['Drama'] });

    expect(scoreCompany(romance, 'date').score).toBeGreaterThan(
      scoreCompany(genericDrama, 'date').score,
    );
  });
});
