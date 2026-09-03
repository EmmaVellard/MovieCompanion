import type {
  MovieLibrary,
  MovieMetadata,
  TasteProfile,
  TasteStat,
} from '@/lib/types';

const PRIOR_SAMPLE_SIZE = 5;
const DISPLAY_SAMPLE_SIZE = 3;

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function decadeForYear(year: number) {
  return Math.floor(year / 10) * 10;
}

function buildStats(
  groups: Map<string, number[]>,
  overallAverage: number | null,
  labelForKey: (key: string) => string = (key) => key,
) {
  return [...groups.entries()].map(([key, values]) => {
    const groupAverage = average(values);
    const baseline = overallAverage ?? groupAverage;
    const sampleSize = values.length;
    return {
      key,
      label: labelForKey(key),
      averageRating: groupAverage,
      regularizedRating:
        (groupAverage * sampleSize + baseline * PRIOR_SAMPLE_SIZE) /
        (sampleSize + PRIOR_SAMPLE_SIZE),
      differenceFromOverall: groupAverage - baseline,
      sampleSize,
      confidence: sampleSize / (sampleSize + PRIOR_SAMPLE_SIZE),
    } satisfies TasteStat;
  });
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

  const groupedDecades = new Map<string, number[]>();
  const groupedGenres = new Map<string, number[]>();
  for (const movie of ratedMovies) {
    if (movie.year !== null) {
      const decade = String(decadeForYear(movie.year));
      const decadeRatings = groupedDecades.get(decade) ?? [];
      decadeRatings.push(movie.rating);
      groupedDecades.set(decade, decadeRatings);
    }
    for (const genre of movie.metadata?.genres ?? []) {
      const genreRatings = groupedGenres.get(genre) ?? [];
      genreRatings.push(movie.rating);
      groupedGenres.set(genre, genreRatings);
    }
  }

  const decades = buildStats(groupedDecades, overallAverage, formatDecade)
    .sort((a, b) => Number(b.key) - Number(a.key));
  const genres = buildStats(groupedGenres, overallAverage).sort(
    (a, b) =>
      b.regularizedRating - a.regularizedRating || b.sampleSize - a.sampleSize,
  );

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
      genres: movie.metadata?.genres ?? [],
    }));

  const allMovies = [...library.watched, ...library.watchlist];
  const matchedMetadata = allMovies
    .map((movie) => movie.metadata)
    .filter(
      (metadata): metadata is MovieMetadata =>
        metadata?.status === 'matched',
    );

  return {
    ratedMovieCount: ratedMovies.length,
    overallAverage,
    decades,
    genres,
    strongestDecades,
    weakestDecades,
    averageRatedYear: years.length > 0 ? average(years) : null,
    highRatedMovies,
    metadataCoverage: {
      genres: matchedMetadata.some((metadata) => metadata.genres.length > 0),
      directors: matchedMetadata.some((metadata) => Boolean(metadata.director)),
      countries: matchedMetadata.some(
        (metadata) => metadata.productionCountries.length > 0,
      ),
      languages: matchedMetadata.some((metadata) => Boolean(metadata.originalLanguage)),
      runtime: matchedMetadata.some((metadata) => metadata.runtimeMinutes !== null),
      posters: matchedMetadata.some((metadata) => Boolean(metadata.posterPath)),
    },
  };
}
