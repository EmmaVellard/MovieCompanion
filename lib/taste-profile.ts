import {
  extractMovieFeatures,
  languageLabel,
  runtimeBandLabel,
} from '@/lib/movie-features';
import {
  addRating,
  average,
  buildPreferenceStats,
  hasDisplayEvidence,
  STAT_OPTIONS,
  statStrength,
} from '@/lib/statistics';
import type {
  MovieFeatures,
  MovieLibrary,
  MovieMetadata,
  TasteDimension,
  TasteInteractionStat,
  TastePattern,
  TasteProfile,
  TasteStat,
} from '@/lib/types';

const MAX_INTERACTIONS_PER_MOVIE = 18;
const MAX_PROFILE_INTERACTIONS = 32;
const INTERACTION_PRIOR_SAMPLE_SIZE = 9;
const INTERACTION_MINIMUM_SAMPLE = 3;
const INTERACTION_MINIMUM_DELTA = 0.12;
const INTERACTION_MINIMUM_LIFT = 0.08;

interface InteractionDefinition {
  key: string;
  label: string;
  components: TasteInteractionStat['components'];
}

type StatMap = Record<
  Exclude<TasteDimension, 'interaction'>,
  Map<string, number[]>
>;

function emptyGroups(): StatMap {
  return {
    genre: new Map(),
    'genre-combination': new Map(),
    director: new Map(),
    country: new Map(),
    language: new Map(),
    keyword: new Map(),
    runtime: new Map(),
    cast: new Map(),
    decade: new Map(),
  };
}

export function formatDecade(decade: number | string) {
  return `${decade}s`;
}

function addFeatureRatings(
  groups: StatMap,
  features: MovieFeatures,
  rating: number,
) {
  for (const genre of features.genres) addRating(groups.genre, genre, rating);
  for (const combination of features.genreCombinations) {
    addRating(groups['genre-combination'], combination, rating);
  }
  addRating(groups.director, features.director, rating);
  for (const country of features.countries) {
    addRating(groups.country, country, rating);
  }
  addRating(groups.language, features.language, rating);
  for (const keyword of features.keywords) {
    addRating(groups.keyword, keyword, rating);
  }
  addRating(groups.runtime, features.runtimeBand, rating);
  for (const actor of features.cast) addRating(groups.cast, actor, rating);
  addRating(groups.decade, features.decade, rating);
}

function interactionDefinitions(features: MovieFeatures) {
  const definitions: InteractionDefinition[] = [];
  for (const country of features.countries.slice(0, 2)) {
    for (const genre of features.genres.slice(0, 4)) {
      definitions.push({
        key: `country:${country}|genre:${genre}`,
        label: `${country} + ${genre}`,
        components: [
          { dimension: 'country', key: country, label: country },
          { dimension: 'genre', key: genre, label: genre },
        ],
      });
    }
  }
  if (features.language) {
    for (const genre of features.genres.slice(0, 4)) {
      definitions.push({
        key: `language:${features.language}|genre:${genre}`,
        label: `${languageLabel(features.language)} + ${genre}`,
        components: [
          {
            dimension: 'language',
            key: features.language,
            label: languageLabel(features.language),
          },
          { dimension: 'genre', key: genre, label: genre },
        ],
      });
    }
  }
  for (const keyword of features.keywords.slice(0, 6)) {
    for (const genre of features.genres.slice(0, 3)) {
      definitions.push({
        key: `keyword:${keyword}|genre:${genre}`,
        label: `${keyword} + ${genre}`,
        components: [
          { dimension: 'keyword', key: keyword, label: keyword },
          { dimension: 'genre', key: genre, label: genre },
        ],
      });
    }
  }
  return definitions.slice(0, MAX_INTERACTIONS_PER_MOVIE);
}

function statLookup(stats: TasteStat[]) {
  return new Map(stats.map((stat) => [stat.key, stat]));
}

function buildInteractions(
  movies: Array<{ rating: number; features: MovieFeatures }>,
  overallAverage: number,
  statsByDimension: Record<Exclude<TasteDimension, 'interaction'>, TasteStat[]>,
) {
  const ratingGroups = new Map<string, number[]>();
  const definitions = new Map<string, InteractionDefinition>();
  for (const movie of movies) {
    for (const definition of interactionDefinitions(movie.features)) {
      addRating(ratingGroups, definition.key, movie.rating);
      definitions.set(definition.key, definition);
    }
  }

  const lookups = Object.fromEntries(
    Object.entries(statsByDimension).map(([dimension, stats]) => [
      dimension,
      statLookup(stats),
    ]),
  ) as Record<Exclude<TasteDimension, 'interaction'>, Map<string, TasteStat>>;

  return buildPreferenceStats(ratingGroups, overallAverage, {
    dimension: 'interaction',
    priorSampleSize: INTERACTION_PRIOR_SAMPLE_SIZE,
    minimumDisplaySample: INTERACTION_MINIMUM_SAMPLE,
    labelForKey: (key) => definitions.get(key)?.label ?? key,
  })
    .map((stat) => {
      const definition = definitions.get(stat.key)!;
      const componentDeltas = definition.components
        .map(
          (component) =>
            lookups[component.dimension].get(component.key)
              ?.regularizedDifference,
        )
        .filter((value): value is number => value !== undefined);
      const expectedDelta =
        componentDeltas.length > 0 ? average(componentDeltas) : 0;
      return {
        ...stat,
        components: definition.components,
        interactionLift: stat.regularizedDifference - expectedDelta,
      } satisfies TasteInteractionStat;
    })
    .filter(
      (stat) =>
        stat.sampleSize >= INTERACTION_MINIMUM_SAMPLE &&
        Math.abs(stat.regularizedDifference) >= INTERACTION_MINIMUM_DELTA &&
        Math.abs(stat.interactionLift) >= INTERACTION_MINIMUM_LIFT,
    )
    .sort(
      (a, b) =>
        Math.abs(b.interactionLift) * b.confidence -
          Math.abs(a.interactionLift) * a.confidence ||
        b.sampleSize - a.sampleSize,
    )
    .slice(0, MAX_PROFILE_INTERACTIONS);
}

function diversePatterns(
  stats: TasteStat[],
  kind: 'strong' | 'weak',
  limit: number,
) {
  const sorted = stats
    .filter(
      (stat) =>
        hasDisplayEvidence(stat) &&
        (kind === 'strong'
          ? stat.regularizedDifference >= 0.08
          : stat.regularizedDifference <= -0.08),
    )
    .sort((a, b) => statStrength(b) - statStrength(a));
  const selected: TastePattern[] = [];
  const perDimension = new Map<TasteDimension, number>();
  for (const stat of sorted) {
    if ((perDimension.get(stat.dimension) ?? 0) >= 2) continue;
    selected.push({ stat, kind });
    perDimension.set(
      stat.dimension,
      (perDimension.get(stat.dimension) ?? 0) + 1,
    );
    if (selected.length >= limit) break;
  }
  return selected;
}

export function buildTasteProfile(library: MovieLibrary): TasteProfile {
  const ratedMovies = library.watched.filter(
    (movie): movie is typeof movie & { rating: number } =>
      movie.rating !== null,
  );
  const ratings = ratedMovies.map((movie) => movie.rating);
  const overallAverage = ratings.length > 0 ? average(ratings) : null;
  const groups = emptyGroups();
  const featuredRatedMovies = ratedMovies.map((movie) => ({
    movie,
    rating: movie.rating,
    features: extractMovieFeatures(movie.metadata, movie.year),
  }));

  for (const movie of featuredRatedMovies) {
    addFeatureRatings(groups, movie.features, movie.rating);
  }

  const statsByDimension = {
    genre: buildPreferenceStats(
      groups.genre,
      overallAverage,
      STAT_OPTIONS.genre,
    ),
    'genre-combination': buildPreferenceStats(
      groups['genre-combination'],
      overallAverage,
      STAT_OPTIONS['genre-combination'],
    ),
    director: buildPreferenceStats(
      groups.director,
      overallAverage,
      STAT_OPTIONS.director,
    ),
    country: buildPreferenceStats(
      groups.country,
      overallAverage,
      STAT_OPTIONS.country,
    ),
    language: buildPreferenceStats(groups.language, overallAverage, {
      ...STAT_OPTIONS.language,
      labelForKey: languageLabel,
    }),
    keyword: buildPreferenceStats(
      groups.keyword,
      overallAverage,
      STAT_OPTIONS.keyword,
    ),
    runtime: buildPreferenceStats(groups.runtime, overallAverage, {
      ...STAT_OPTIONS.runtime,
      labelForKey: runtimeBandLabel,
    }),
    cast: buildPreferenceStats(groups.cast, overallAverage, STAT_OPTIONS.cast),
    decade: buildPreferenceStats(groups.decade, overallAverage, {
      ...STAT_OPTIONS.decade,
      labelForKey: formatDecade,
    }),
  } satisfies Record<Exclude<TasteDimension, 'interaction'>, TasteStat[]>;

  for (const stats of Object.values(statsByDimension)) {
    stats.sort(
      (a, b) =>
        b.regularizedRating - a.regularizedRating ||
        b.sampleSize - a.sampleSize ||
        a.label.localeCompare(b.label),
    );
  }

  const interactions =
    overallAverage === null
      ? []
      : buildInteractions(
          featuredRatedMovies,
          overallAverage,
          statsByDimension,
        );
  const patternPool = [
    ...statsByDimension.genre,
    ...statsByDimension['genre-combination'],
    ...statsByDimension.director,
    ...statsByDimension.country,
    ...statsByDimension.language,
    ...statsByDimension.keyword,
    ...statsByDimension.runtime,
    ...statsByDimension.cast,
    ...statsByDimension.decade,
  ];
  const strongestPatterns = diversePatterns(patternPool, 'strong', 6);
  const weakestPatterns = diversePatterns(patternPool, 'weak', 5);
  const unexpectedPatterns = interactions
    .slice(0, 5)
    .map((stat) => ({ stat, kind: 'unexpected' }) satisfies TastePattern);

  const displayableDecades = statsByDimension.decade.filter(hasDisplayEvidence);
  const strongestDecades = [...displayableDecades]
    .sort((a, b) => b.regularizedRating - a.regularizedRating)
    .slice(0, 3);
  const weakestDecades = [...displayableDecades]
    .sort((a, b) => a.regularizedRating - b.regularizedRating)
    .slice(0, 3);
  const years = featuredRatedMovies
    .map(({ features }) => features.year)
    .filter((year): year is number => year !== null);
  const highRatingThreshold = Math.min(
    4.5,
    Math.max(4, (overallAverage ?? 3) + 0.5),
  );
  const highRatedMovies = featuredRatedMovies
    .filter(({ rating }) => rating >= highRatingThreshold)
    .sort(
      (a, b) =>
        b.rating - a.rating || a.movie.title.localeCompare(b.movie.title),
    )
    .slice(0, 36)
    .map(({ movie, rating, features }) => ({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      rating,
      genres: features.genres,
      features,
    }));

  const allMovies = [...library.watched, ...library.watchlist];
  const matchedMetadata = allMovies
    .map((movie) => movie.metadata)
    .filter(
      (metadata): metadata is MovieMetadata => metadata?.status === 'matched',
    );
  const matchedRatedMovies = featuredRatedMovies.filter(
    ({ movie }) => movie.metadata?.status === 'matched',
  ).length;

  return {
    ratedMovieCount: ratedMovies.length,
    overallAverage,
    decades: statsByDimension.decade.sort(
      (a, b) => Number(b.key) - Number(a.key),
    ),
    genres: statsByDimension.genre,
    genreCombinations: statsByDimension['genre-combination'],
    directors: statsByDimension.director,
    countries: statsByDimension.country,
    languages: statsByDimension.language,
    keywords: statsByDimension.keyword,
    runtimeBands: statsByDimension.runtime,
    cast: statsByDimension.cast,
    interactions,
    strongestDecades,
    weakestDecades,
    strongestPatterns,
    weakestPatterns,
    unexpectedPatterns,
    averageRatedYear: years.length > 0 ? average(years) : null,
    highRatedMovies,
    metadataCoverage: {
      genres: matchedMetadata.some((metadata) => metadata.genres.length > 0),
      directors: matchedMetadata.some((metadata) => Boolean(metadata.director)),
      countries: matchedMetadata.some(
        (metadata) => metadata.productionCountries.length > 0,
      ),
      languages: matchedMetadata.some((metadata) =>
        Boolean(metadata.originalLanguage),
      ),
      runtime: matchedMetadata.some(
        (metadata) => metadata.runtimeMinutes !== null,
      ),
      posters: matchedMetadata.some((metadata) => Boolean(metadata.posterPath)),
      keywords: matchedMetadata.some(
        (metadata) => metadata.keywords.length > 0,
      ),
      cast: matchedMetadata.some((metadata) => metadata.cast.length > 0),
      matchedRatedMovies,
      totalRatedMovies: ratedMovies.length,
    },
  };
}
