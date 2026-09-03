import type { MovieLibrary, TasteProfile, TasteStat } from '@/lib/types';

const PRIOR_SAMPLE_SIZE = 5;
const DISPLAY_SAMPLE_SIZE = 3;

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function decadeForYear(year: number) {
  return Math.floor(year / 10) * 10;
}

export function formatDecade(decade: number | string) {
  return `${decade}s`;
}

export function buildTasteProfile(library: MovieLibrary): TasteProfile {
  const ratedMovies = library.watched.filter(
    (movie): movie is typeof movie & { rating: number } =>
      movie.rating !== null,
  );
  const ratings = ratedMovies.map((movie) => movie.rating);
  const overallAverage = ratings.length > 0 ? average(ratings) : null;
  const years = ratedMovies
    .map((movie) => movie.year)
    .filter((year): year is number => year !== null);

  const groupedDecades = new Map<number, number[]>();
  for (const movie of ratedMovies) {
    if (movie.year === null) continue;
    const decade = decadeForYear(movie.year);
    const decadeRatings = groupedDecades.get(decade) ?? [];
    decadeRatings.push(movie.rating);
    groupedDecades.set(decade, decadeRatings);
  }

  const decades: TasteStat[] = [...groupedDecades.entries()]
    .map(([decade, decadeRatings]) => {
      const decadeAverage = average(decadeRatings);
      const baseline = overallAverage ?? decadeAverage;
      const sampleSize = decadeRatings.length;
      return {
        key: String(decade),
        label: formatDecade(decade),
        averageRating: decadeAverage,
        regularizedRating:
          (decadeAverage * sampleSize + baseline * PRIOR_SAMPLE_SIZE) /
          (sampleSize + PRIOR_SAMPLE_SIZE),
        differenceFromOverall: decadeAverage - baseline,
        sampleSize,
        confidence: sampleSize / (sampleSize + PRIOR_SAMPLE_SIZE),
      };
    })
    .sort((a, b) => Number(b.key) - Number(a.key));

  const displayableDecades = decades.filter(
    (stat) => stat.sampleSize >= DISPLAY_SAMPLE_SIZE,
  );
  const strongestDecades = [...displayableDecades]
    .sort(
      (a, b) =>
        b.regularizedRating - a.regularizedRating ||
        b.sampleSize - a.sampleSize,
    )
    .slice(0, 3);
  const weakestDecades = [...displayableDecades]
    .sort(
      (a, b) =>
        a.regularizedRating - b.regularizedRating ||
        b.sampleSize - a.sampleSize,
    )
    .slice(0, 3);

  const highRatingThreshold = Math.max(4, (overallAverage ?? 3) + 0.5);
  const highRatedMovies = ratedMovies
    .filter((movie) => movie.rating >= highRatingThreshold)
    .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title))
    .slice(0, 24)
    .map((movie) => ({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      rating: movie.rating,
    }));

  return {
    ratedMovieCount: ratedMovies.length,
    overallAverage,
    decades,
    strongestDecades,
    weakestDecades,
    averageRatedYear: years.length > 0 ? average(years) : null,
    highRatedMovies,
    metadataCoverage: {
      genres: false,
      directors: false,
      countries: false,
      languages: false,
      runtime: false,
      posters: false,
    },
  };
}
