import { describe, expect, it } from 'vitest';

import { chooseTmdbMatch } from '@/lib/tmdb-matching';

describe('chooseTmdbMatch', () => {
  it('accepts a unique exact title-and-year match', () => {
    const decision = chooseTmdbMatch('The Handmaiden', 2016, [
      {
        id: 290098,
        title: 'The Handmaiden',
        original_title: '아가씨',
        release_date: '2016-06-01',
        popularity: 30,
      },
    ]);
    expect(decision.status).toBe('matched');
  });

  it('withholds duplicate title matches when the year is missing', () => {
    const decision = chooseTmdbMatch('Crash', null, [
      {
        id: 1,
        title: 'Crash',
        original_title: 'Crash',
        release_date: '1996-07-17',
      },
      {
        id: 2,
        title: 'Crash',
        original_title: 'Crash',
        release_date: '2005-05-06',
      },
    ]);
    expect(decision.status).toBe('ambiguous');
  });

  it('accepts a confirmed alternate title with the same release year', () => {
    const decision = chooseTmdbMatch('The Professional', 1994, [
      {
        id: 101,
        title: 'Léon',
        original_title: 'Léon',
        alternative_titles: ['The Professional'],
        release_date: '1994-09-14',
      },
    ]);
    expect(decision.status).toBe('matched');
  });

  it('rejects an obviously unrelated result', () => {
    const decision = chooseTmdbMatch('Parasite', 2019, [
      {
        id: 3,
        title: 'The Godfather',
        original_title: 'The Godfather',
        release_date: '1972-03-14',
      },
    ]);
    expect(decision.status).toBe('unmatched');
  });
});
