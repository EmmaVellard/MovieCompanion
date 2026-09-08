import { extractMovieFeatures } from '@/lib/movie-features';
import { scorePersonalTaste } from '@/lib/recommendations';
import { affinityFromStats, clamp } from '@/lib/statistics';
import { buildTasteProfile } from '@/lib/taste-profile';
import type {
  MovieLibrary,
  TasteProfile,
  TasteScoreComponent,
  TasteScoreComponentName,
  WatchedMovie,
} from '@/lib/types';

export type EvaluationVariant =
  | 'Genres + decades'
  | '+ Directors'
  | '+ Countries/languages'
  | '+ Keywords'
  | '+ Genre combinations'
  | '+ Runtime'
  | '+ Cast'
  | '+ Interaction patterns'
  | '+ Richer similarity'
  | 'Personal Taste v2';

export interface EvaluationMetrics {
  variant: EvaluationVariant;
  evaluatedMovies: number;
  meanAbsoluteError: number | null;
  pearsonCorrelation: number | null;
  likedVsDislikedAccuracy: number | null;
  topQuartilePrecision: number | null;
  pairwiseRankingAccuracy: number | null;
}

export interface HeldOutPrediction {
  movieId: string;
  title: string;
  actualRating: number;
  predictions: Record<EvaluationVariant, number>;
}

export interface OfflineEvaluationResult {
  method: 'leave-one-out' | 'time-ordered';
  ratedMovies: number;
  datedMovies: number;
  matchedMovies: number;
  skippedMovies: number;
  minimumTrainingSize: number;
  metrics: EvaluationMetrics[];
  predictions: HeldOutPrediction[];
}

export interface EvaluationSuiteResult {
  temporal: OfflineEvaluationResult;
  leaveOneOut: OfflineEvaluationResult;
}

const VARIANT_COMPONENTS: Record<EvaluationVariant, TasteScoreComponentName[]> =
  {
    'Genres + decades': ['genres', 'decade'],
    '+ Directors': ['genres', 'decade', 'director'],
    '+ Countries/languages': [
      'genres',
      'decade',
      'director',
      'country and language',
    ],
    '+ Keywords': [
      'genres',
      'decade',
      'director',
      'country and language',
      'keywords',
    ],
    '+ Genre combinations': [
      'genres',
      'decade',
      'director',
      'country and language',
      'keywords',
      'genre combinations',
    ],
    '+ Runtime': [
      'genres',
      'decade',
      'director',
      'country and language',
      'keywords',
      'genre combinations',
      'runtime',
    ],
    '+ Cast': [
      'genres',
      'decade',
      'director',
      'country and language',
      'keywords',
      'genre combinations',
      'runtime',
      'cast',
    ],
    '+ Interaction patterns': [
      'genres',
      'decade',
      'director',
      'country and language',
      'keywords',
      'genre combinations',
      'runtime',
      'cast',
      'interaction patterns',
    ],
    '+ Richer similarity': [
      'genres',
      'decade',
      'director',
      'country and language',
      'keywords',
      'genre combinations',
      'runtime',
      'cast',
      'interaction patterns',
      'similarity',
    ],
    'Personal Taste v2': [
      'genres',
      'genre combinations',
      'keywords',
      'director',
      'cast',
      'country and language',
      'decade',
      'runtime',
      'interaction patterns',
      'similarity',
      'evidence confidence',
    ],
  };

function predictedRating(
  components: TasteScoreComponent[],
  included: TasteScoreComponentName[],
  profile: TasteProfile,
) {
  const selected = components.filter((component) =>
    included.includes(component.name),
  );
  const weight = selected.reduce(
    (total, component) => total + component.weight,
    0,
  );
  const neutral = clamp(((profile.overallAverage ?? 3) - 1) / 4);
  const normalized =
    weight > 0
      ? selected.reduce(
          (total, component) => total + component.score * component.weight,
          0,
        ) / weight
      : neutral;
  return clamp(1 + normalized * 4, 0.5, 5);
}

function baselineComponents(movie: WatchedMovie, profile: TasteProfile) {
  const features = extractMovieFeatures(movie.metadata, movie.year);
  const neutral = clamp(((profile.overallAverage ?? 3) - 1) / 4);
  const genreKeys = new Set(features.genres);
  const decadeKeys = new Set(features.decade ? [features.decade] : []);
  return {
    genres: affinityFromStats(
      profile.genres.filter((stat) => genreKeys.has(stat.key)),
      neutral,
    ).score,
    decades: affinityFromStats(
      profile.decades.filter((stat) => decadeKeys.has(stat.key)),
      neutral,
    ).score,
  };
}

function pearson(actual: number[], predicted: number[]) {
  if (actual.length < 3) return null;
  const meanActual =
    actual.reduce((total, value) => total + value, 0) / actual.length;
  const meanPredicted =
    predicted.reduce((total, value) => total + value, 0) / predicted.length;
  let numerator = 0;
  let actualVariance = 0;
  let predictedVariance = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const actualDelta = actual[index] - meanActual;
    const predictedDelta = predicted[index] - meanPredicted;
    numerator += actualDelta * predictedDelta;
    actualVariance += actualDelta ** 2;
    predictedVariance += predictedDelta ** 2;
  }
  const denominator = Math.sqrt(actualVariance * predictedVariance);
  return denominator === 0 ? null : numerator / denominator;
}

function pairwiseAccuracy(actual: number[], predicted: number[]) {
  let correct = 0;
  let comparable = 0;
  for (let first = 0; first < actual.length; first += 1) {
    for (let second = first + 1; second < actual.length; second += 1) {
      if (actual[first] === actual[second]) continue;
      comparable += 1;
      const actualOrder = Math.sign(actual[first] - actual[second]);
      const predictedOrder = Math.sign(predicted[first] - predicted[second]);
      if (predictedOrder === actualOrder) correct += 1;
      else if (predictedOrder === 0) correct += 0.5;
    }
  }
  return comparable === 0 ? null : correct / comparable;
}

function highLowAccuracy(actual: number[], predicted: number[]) {
  const liked = actual
    .map((rating, index) => ({ rating, predicted: predicted[index] }))
    .filter(({ rating }) => rating >= 4);
  const disliked = actual
    .map((rating, index) => ({ rating, predicted: predicted[index] }))
    .filter(({ rating }) => rating <= 2.5);
  if (liked.length === 0 || disliked.length === 0) return null;
  let correct = 0;
  let comparisons = 0;
  for (const high of liked) {
    for (const low of disliked) {
      comparisons += 1;
      if (high.predicted > low.predicted) correct += 1;
      else if (high.predicted === low.predicted) correct += 0.5;
    }
  }
  return correct / comparisons;
}

function topQuartilePrecision(actual: number[], predicted: number[]) {
  if (actual.length < 8) return null;
  const count = Math.max(1, Math.ceil(actual.length * 0.25));
  const topPredicted = predicted
    .map((score, index) => ({ score, actual: actual[index] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
  return (
    topPredicted.filter(({ actual: rating }) => rating >= 4).length / count
  );
}

function metricsFor(
  variant: EvaluationVariant,
  predictions: HeldOutPrediction[],
): EvaluationMetrics {
  const actual = predictions.map((prediction) => prediction.actualRating);
  const predicted = predictions.map(
    (prediction) => prediction.predictions[variant],
  );
  return {
    variant,
    evaluatedMovies: predictions.length,
    meanAbsoluteError:
      predictions.length === 0
        ? null
        : actual.reduce(
            (total, rating, index) =>
              total + Math.abs(rating - predicted[index]),
            0,
          ) / predictions.length,
    pearsonCorrelation: pearson(actual, predicted),
    likedVsDislikedAccuracy: highLowAccuracy(actual, predicted),
    topQuartilePrecision: topQuartilePrecision(actual, predicted),
    pairwiseRankingAccuracy: pairwiseAccuracy(actual, predicted),
  };
}

function predictHeldOut(
  heldOut: WatchedMovie & { rating: number },
  trainingMovies: Array<WatchedMovie & { rating: number }>,
  tmdbImageConfiguration: MovieLibrary['tmdbImageConfiguration'],
) {
  const trainingLibrary: MovieLibrary = {
    watched: trainingMovies,
    watchlist: [],
    tmdbImageConfiguration,
  };
  const profile = buildTasteProfile(trainingLibrary);
  if (profile.overallAverage === null) return null;
  const scored = scorePersonalTaste(heldOut, profile);
  const baseline = baselineComponents(heldOut, profile);
  const variantPredictions = {} as Record<EvaluationVariant, number>;
  for (const [variant, included] of Object.entries(VARIANT_COMPONENTS) as Array<
    [EvaluationVariant, TasteScoreComponentName[]]
  >) {
    if (variant === 'Genres + decades') {
      variantPredictions[variant] =
        1 + (baseline.genres * 0.65 + baseline.decades * 0.35) * 4;
    } else {
      variantPredictions[variant] = predictedRating(
        scored.components,
        included,
        profile,
      );
    }
  }
  return {
    movieId: heldOut.id,
    title: heldOut.title,
    actualRating: heldOut.rating,
    predictions: variantPredictions,
  } satisfies HeldOutPrediction;
}

function buildResult({
  method,
  rated,
  datedMovies,
  matchedMovies,
  predictions,
  minimumTrainingSize,
}: {
  method: OfflineEvaluationResult['method'];
  rated: Array<WatchedMovie & { rating: number }>;
  datedMovies: number;
  matchedMovies: number;
  predictions: HeldOutPrediction[];
  minimumTrainingSize: number;
}): OfflineEvaluationResult {
  const variants = Object.keys(VARIANT_COMPONENTS) as EvaluationVariant[];
  return {
    method,
    ratedMovies: rated.length,
    datedMovies,
    matchedMovies,
    skippedMovies: rated.length - predictions.length,
    minimumTrainingSize,
    metrics: variants.map((variant) => metricsFor(variant, predictions)),
    predictions,
  };
}

export function runOfflineEvaluation(
  library: MovieLibrary,
): OfflineEvaluationResult {
  const rated = library.watched.filter(
    (movie): movie is WatchedMovie & { rating: number } =>
      movie.rating !== null,
  );
  const predictions: HeldOutPrediction[] = [];
  for (let heldOutIndex = 0; heldOutIndex < rated.length; heldOutIndex += 1) {
    const heldOut = rated[heldOutIndex];
    const prediction = predictHeldOut(
      heldOut,
      rated.filter((_, index) => index !== heldOutIndex),
      library.tmdbImageConfiguration,
    );
    if (prediction) predictions.push(prediction);
  }

  return buildResult({
    method: 'leave-one-out',
    rated,
    datedMovies: rated.filter((movie) => Boolean(movie.watchedDate)).length,
    matchedMovies: rated.filter((movie) => movie.metadata?.status === 'matched')
      .length,
    predictions,
    minimumTrainingSize: Math.max(0, rated.length - 1),
  });
}

function activityTimestamp(movie: WatchedMovie) {
  const activityDate = movie.ratingDate ?? movie.watchedDate;
  if (!activityDate) return null;
  const timestamp = Date.parse(activityDate);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function runTemporalEvaluation(
  library: MovieLibrary,
  { minimumTrainingSize = 12 }: { minimumTrainingSize?: number } = {},
): OfflineEvaluationResult {
  const rated = library.watched.filter(
    (movie): movie is WatchedMovie & { rating: number } =>
      movie.rating !== null,
  );
  const dated = rated
    .map((movie) => ({ movie, timestamp: activityTimestamp(movie) }))
    .filter(
      (
        entry,
      ): entry is {
        movie: WatchedMovie & { rating: number };
        timestamp: number;
      } => entry.timestamp !== null,
    )
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp || a.movie.title.localeCompare(b.movie.title),
    );
  const predictions: HeldOutPrediction[] = [];

  for (const heldOut of dated) {
    const trainingMovies = dated
      .filter((entry) => entry.timestamp < heldOut.timestamp)
      .map((entry) => entry.movie);
    if (trainingMovies.length < minimumTrainingSize) continue;
    const prediction = predictHeldOut(
      heldOut.movie,
      trainingMovies,
      library.tmdbImageConfiguration,
    );
    if (prediction) predictions.push(prediction);
  }

  return buildResult({
    method: 'time-ordered',
    rated,
    datedMovies: dated.length,
    matchedMovies: dated.filter(
      ({ movie }) => movie.metadata?.status === 'matched',
    ).length,
    predictions,
    minimumTrainingSize,
  });
}

export function runEvaluationSuite(
  library: MovieLibrary,
): EvaluationSuiteResult {
  return {
    temporal: runTemporalEvaluation(library),
    leaveOneOut: runOfflineEvaluation(library),
  };
}
