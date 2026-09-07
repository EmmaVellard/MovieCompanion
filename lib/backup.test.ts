import { describe, expect, it } from 'vitest';

import { parseMovieCompanionBackup } from '@/lib/backup';

const validBackup = {
  format: 'movie-companion-backup',
  version: 1,
  exportedAt: '2026-09-07T12:00:00.000Z',
  data: {
    sourceMovies: [
      {
        key: 'ratings:the-handmaiden-2016',
        movieKey: 'the-handmaiden-2016',
        title: 'The Handmaiden',
        year: 2016,
        letterboxdUri: 'https://letterboxd.com/film/the-handmaiden/',
        rating: 5,
        date: '2026-09-01',
        kind: 'ratings',
        importedAt: '2026-09-07T12:00:00.000Z',
        sourceFileName: 'ratings.csv',
      },
    ],
    imports: [],
    movieMetadata: [],
    tmdbConfiguration: null,
  },
};

describe('parseMovieCompanionBackup', () => {
  it('accepts a valid versioned backup', () => {
    const result = parseMovieCompanionBackup(validBackup);
    expect(result.data.sourceMovies[0]?.title).toBe('The Handmaiden');
  });

  it('rejects unrelated JSON', () => {
    expect(() => parseMovieCompanionBackup({ movies: [] })).toThrow(
      'not a Movie Companion backup',
    );
  });

  it('rejects a backup containing malformed movie records', () => {
    expect(() =>
      parseMovieCompanionBackup({
        ...validBackup,
        data: {
          ...validBackup.data,
          sourceMovies: [{ title: 'Incomplete record' }],
        },
      }),
    ).toThrow('invalid Letterboxd movie records');
  });
});
