import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { extractLetterboxdCsvBytes } from '@/lib/letterboxd-zip';

describe('extractLetterboxdCsvBytes', () => {
  it('extracts only supported CSV files from a Letterboxd export', () => {
    const archive = zipSync({
      'letterboxd-username-2026-09-07/ratings.csv': strToU8(
        'Date,Name,Year,Letterboxd URI,Rating\n',
      ),
      'letterboxd-username-2026-09-07/watchlist.csv': strToU8(
        'Date,Name,Year,Letterboxd URI\n',
      ),
      'letterboxd-username-2026-09-07/diary.csv': strToU8(
        'Date,Name,Year,Letterboxd URI\n',
      ),
    });

    const files = extractLetterboxdCsvBytes(archive);

    expect(files.map((file) => file.name)).toEqual([
      'ratings.csv',
      'watchlist.csv',
    ]);
  });

  it('rejects a ZIP without supported Letterboxd files', () => {
    const archive = zipSync({
      'letterboxd/diary.csv': strToU8('Date,Name,Year,Letterboxd URI\n'),
    });

    expect(() => extractLetterboxdCsvBytes(archive)).toThrow(
      'No supported Letterboxd files were found',
    );
  });

  it('rejects invalid ZIP data with a useful message', () => {
    expect(() => extractLetterboxdCsvBytes(strToU8('not a zip'))).toThrow(
      'This ZIP could not be opened',
    );
  });
});
