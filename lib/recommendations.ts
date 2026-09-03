import {
  scoreCompany,
  scoreEnergy,
  scoreMood,
  scoreRuntime,
  type ContextSignal,
} from '@/lib/recommendation-mappings';
import { extractMovieFeatures } from '@/lib/movie-features';
import { movieSimilarity } from '@/lib/movie-similarity';
import { affinityFromStats, clamp } from '@/lib/statistics';
import { formatDecade } from '@/lib/taste-profile';
import type {
  MovieLibrary,
  MovieRecommendation,
  RecommendationContext,
  RecommendationContribution,
  RecommendationMode,
  RecommendationResult,
  RecommendationSignals,
  TasteScoreComponent,
  TasteScoreComponentName,
  TasteProfile,
  TasteStat,
  WatchlistMovie,
} from '@/lib/types';

interface TasteSignals {
  decade: string | null;
  decadeSampleSize: number;
  decadeDifference: number;
  decadeConfidence: number;
  decadeFit: number;
  similarRatedMovie: RecommendationSignals['similarRatedMovie'];
  yearSimilarity: number;
  metadataSimilarity: number;
  genreAffinity: number;
  genreConfidence: number;
  evidenceConfidence: number;
  watchlistAge: number;
  habitDistance: number;
  tasteScore: number;
  tasteComponents: TasteScoreComponent[];
  contributions: RecommendationContribution[];
}

export const PERSONAL_TASTE_WEIGHTS: Record<TasteScoreComponentName, number> = {
  genres: 0.22,
  'genre combinations': 0.12,
  keywords: 0.06,
  director: 0.13,
  cast: 0.01,
  'country and language': 0.06,
  decade: 0.14,
  runtime: 0.16,
  'interaction patterns': 0.025,
  similarity: 0.025,
  'evidence confidence': 0.05,
};

interface CandidateScore {
  movie: WatchlistMovie;
  score: number;
  signals: RecommendationSignals;
  contextMatches: {
    mood: string[];
    energy: string[];
    company: string[];
    runtime: string[];
  };
  limitedMetadata: boolean;
}

function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function watchlistAge(dateValue: string | null, nowMs: number) {
  if (!dateValue) return 0.25;
  const timestamp = Date.parse(dateValue);
  if (!Number.isFinite(timestamp)) return 0.25;
  const days = (nowMs - timestamp) / 86_400_000;
  return clamp(days / (365 * 4));
}

function matchingStats(keys: Array<string | null>, stats: TasteStat[]) {
  const wanted = new Set(keys.filter((key): key is string => Boolean(key)));
  return stats.filter((stat) => wanted.has(stat.key));
}

function supportedStats(
  keys: Array<string | null>,
  stats: TasteStat[],
  minimumSamples: number,
) {
  return matchingStats(keys, stats).filter(
    (stat) => stat.sampleSize >= minimumSamples,
  );
}

function evidenceLabel(stats: TasteStat[]) {
  return [...stats]
    .sort(
      (a, b) =>
        Math.abs(b.regularizedDifference) * b.confidence -
        Math.abs(a.regularizedDifference) * a.confidence,
    )
    .slice(0, 2)
    .map(
      (stat) =>
        `${stat.label} ${stat.regularizedDifference >= 0 ? '+' : ''}${stat.regularizedDifference.toFixed(1)} (${stat.sampleSize})`,
    );
}

function scoreComponent(
  name: TasteScoreComponentName,
  score: number,
  confidence: number,
  evidence: string[],
): TasteScoreComponent {
  const weight = PERSONAL_TASTE_WEIGHTS[name];
  return {
    name,
    score: clamp(score),
    confidence: clamp(confidence),
    weight,
    contribution: clamp(score) * weight,
    evidence,
  };
}

function combinedAffinity(
  first: ReturnType<typeof affinityFromStats>,
  second: ReturnType<typeof affinityFromStats>,
  firstWeight: number,
) {
  return {
    score: first.score * firstWeight + second.score * (1 - firstWeight),
    confidence:
      first.confidence * firstWeight + second.confidence * (1 - firstWeight),
    evidence: [...first.evidence, ...second.evidence],
  };
}

function interactionMatches(
  profile: TasteProfile,
  features: ReturnType<typeof extractMovieFeatures>,
) {
  const values: Partial<Record<string, Set<string>>> = {
    genre: new Set(features.genres),
    country: new Set(features.countries),
    language: new Set(features.language ? [features.language] : []),
    keyword: new Set(features.keywords),
  };
  return profile.interactions.filter((stat) =>
    stat.components.every((component) =>
      values[component.dimension]?.has(component.key),
    ),
  );
}

export function scorePersonalTaste(
  movie: Pick<WatchlistMovie, 'id' | 'title' | 'year' | 'metadata'>,
  profile: TasteProfile,
) {
  const features = extractMovieFeatures(movie.metadata, movie.year);
  const neutralScore = clamp(((profile.overallAverage ?? 3) - 1) / 4);
  const affinity = (stats: TasteStat[]) =>
    affinityFromStats(stats, neutralScore);
  const genres = affinity(matchingStats(features.genres, profile.genres));
  const combinations = affinity(
    supportedStats(features.genreCombinations, profile.genreCombinations, 3),
  );
  const keywords = affinity(
    supportedStats(features.keywords, profile.keywords, 3),
  );
  const director = affinity(
    supportedStats([features.director], profile.directors, 2),
  );
  const cast = affinity(supportedStats(features.cast, profile.cast, 4));
  const country = affinity(
    supportedStats(features.countries, profile.countries, 3),
  );
  const language = affinity(
    supportedStats([features.language], profile.languages, 3),
  );
  const origin = combinedAffinity(country, language, 0.58);
  const decade = affinity(matchingStats([features.decade], profile.decades));
  const runtime = affinity(
    supportedStats([features.runtimeBand], profile.runtimeBands, 5),
  );
  const interactions = affinity(interactionMatches(profile, features));
  const closest =
    profile.highRatedMovies
      .filter((ratedMovie) => ratedMovie.id !== movie.id)
      .map((ratedMovie) => ({
        movie: ratedMovie,
        similarity: movieSimilarity(features, ratedMovie.features),
      }))
      .sort(
        (a, b) =>
          b.similarity.score * b.similarity.confidence -
            a.similarity.score * a.similarity.confidence ||
          b.movie.rating - a.movie.rating,
      )[0] ?? null;
  const similarityScore = closest?.similarity.score ?? neutralScore;
  const similarityConfidence = closest?.similarity.confidence ?? 0;
  const evidenceConfidence =
    [
      genres,
      combinations,
      keywords,
      director,
      cast,
      origin,
      decade,
      runtime,
      interactions,
    ].reduce((total, signal) => total + signal.confidence, 0) / 9;
  const components: TasteScoreComponent[] = [
    scoreComponent(
      'genres',
      genres.score,
      genres.confidence,
      evidenceLabel(genres.evidence),
    ),
    scoreComponent(
      'genre combinations',
      combinations.score,
      combinations.confidence,
      evidenceLabel(combinations.evidence),
    ),
    scoreComponent(
      'keywords',
      keywords.score,
      keywords.confidence,
      evidenceLabel(keywords.evidence),
    ),
    scoreComponent(
      'director',
      director.score,
      director.confidence,
      evidenceLabel(director.evidence),
    ),
    scoreComponent(
      'cast',
      cast.score,
      cast.confidence,
      evidenceLabel(cast.evidence),
    ),
    scoreComponent(
      'country and language',
      origin.score,
      origin.confidence,
      evidenceLabel(origin.evidence),
    ),
    scoreComponent(
      'decade',
      decade.score,
      decade.confidence,
      evidenceLabel(decade.evidence),
    ),
    scoreComponent(
      'runtime',
      runtime.score,
      runtime.confidence,
      evidenceLabel(runtime.evidence),
    ),
    scoreComponent(
      'interaction patterns',
      interactions.score,
      interactions.confidence,
      evidenceLabel(interactions.evidence),
    ),
    scoreComponent(
      'similarity',
      similarityScore,
      similarityConfidence,
      closest
        ? [
            `${closest.movie.title}${closest.similarity.sharedFeatures.length > 0 ? ` · ${closest.similarity.sharedFeatures.join(', ')}` : ''}`,
          ]
        : [],
    ),
    scoreComponent(
      'evidence confidence',
      neutralScore * (0.9 + evidenceConfidence * 0.1),
      evidenceConfidence,
      [`${Math.round(evidenceConfidence * 100)}% feature evidence`],
    ),
  ];
  const tasteScore = clamp(
    components.reduce((total, component) => total + component.contribution, 0),
  );
  return {
    tasteScore,
    components,
    closest,
    features,
    genreAffinity: genres.score,
    genreConfidence: genres.confidence,
    evidenceConfidence,
  };
}

function tasteSignals(
  movie: WatchlistMovie,
  profile: TasteProfile,
  nowMs: number,
): TasteSignals {
  const scored = scorePersonalTaste(movie, profile);
  const decade = movie.year === null ? null : Math.floor(movie.year / 10) * 10;
  const decadeStat = profile.decades.find(
    (stat) => stat.key === String(decade),
  );
  const closest = scored.closest;
  const decadeFit = decadeStat
    ? clamp((decadeStat.regularizedRating - 1) / 4)
    : 0.5;
  const metadataSimilarity = closest?.similarity.score ?? 0.5;
  const age = watchlistAge(movie.addedDate, nowMs);
  const habitDistance =
    movie.year !== null && profile.averageRatedYear !== null
      ? clamp(Math.abs(movie.year - profile.averageRatedYear) / 45)
      : 0.5;
  const contributions: RecommendationContribution[] = scored.components.map(
    (component) => ({
      category: 'taste',
      label: `${component.name}${component.evidence.length > 0 ? `: ${component.evidence.join('; ')}` : ' (neutral prior)'}`,
      points: Math.round(component.contribution * 100),
    }),
  );

  return {
    decade: decade === null ? null : formatDecade(decade),
    decadeSampleSize: decadeStat?.sampleSize ?? 0,
    decadeDifference: decadeStat?.regularizedDifference ?? 0,
    decadeConfidence: decadeStat?.confidence ?? 0,
    decadeFit,
    similarRatedMovie: closest?.movie ?? null,
    yearSimilarity:
      closest?.similarity.components.find(
        (component) => component.feature === 'year',
      )?.score ?? 0,
    metadataSimilarity,
    genreAffinity: scored.genreAffinity,
    genreConfidence: scored.genreConfidence,
    evidenceConfidence: scored.evidenceConfidence,
    watchlistAge: age,
    habitDistance,
    tasteScore: scored.tasteScore,
    tasteComponents: scored.components,
    contributions,
  };
}

function averageSignal(signals: ContextSignal[]) {
  if (signals.length === 0) {
    return {
      score: 0.5,
      matches: [],
      available: true,
    } satisfies ContextSignal;
  }
  return {
    score:
      signals.reduce((total, signal) => total + signal.score, 0) /
      signals.length,
    matches: [...new Set(signals.flatMap((signal) => signal.matches))],
    available: signals.every((signal) => signal.available),
  };
}

function label(value: string) {
  return value.replaceAll('-', ' ');
}

function scoreTonightCandidate(
  movie: WatchlistMovie,
  profile: TasteProfile,
  context: RecommendationContext,
  runIndex: number,
  nowMs: number,
): CandidateScore {
  const taste = tasteSignals(movie, profile, nowMs);
  const mood = averageSignal(
    context.moods.map((selectedMood) =>
      scoreMood(movie.metadata, selectedMood),
    ),
  );
  const energy = scoreEnergy(movie.metadata, context.energy);
  const company = scoreCompany(movie.metadata, context.watchingWith);
  const runtime = scoreRuntime(movie.metadata, context.runtimeLimit);
  const tonightScore = clamp(
    mood.score * 0.48 +
      energy.score * 0.29 +
      company.score * 0.13 +
      runtime.score * 0.1,
  );
  const baseScore = clamp(
    taste.tasteScore * 0.56 + tonightScore * 0.41 + taste.watchlistAge * 0.03,
  );
  const contextKey = `${context.moods.slice().sort().join(',')}:${context.runtimeLimit}:${context.watchingWith}:${context.energy}`;
  const nearTieVariation =
    (hashUnit(`${movie.id}:${contextKey}:${runIndex}`) - 0.5) * 0.008;
  const score = clamp(baseScore + nearTieVariation);
  const contributions: RecommendationContribution[] = [
    ...taste.contributions,
    {
      category: 'mood',
      label:
        context.moods.length === 0
          ? 'no mood selected'
          : mood.matches.length > 0
            ? `${context.moods.map(label).join(' + ')}: ${mood.matches.join(', ')}`
            : `${context.moods.map(label).join(' + ')}: no confirmed match`,
      points: Math.round(mood.score * 48),
    },
    {
      category: 'runtime',
      label:
        context.runtimeLimit === null
          ? 'no runtime limit'
          : (runtime.matches[0] ?? 'runtime unavailable'),
      points: Math.round(runtime.score * 10),
    },
    {
      category: 'energy',
      label:
        energy.matches.length > 0
          ? `${label(context.energy)}: ${energy.matches.join(', ')}`
          : `${label(context.energy)}: limited signal`,
      points: Math.round(energy.score * 29),
    },
    {
      category: 'company',
      label:
        company.matches.length > 0
          ? `${label(context.watchingWith)}: ${company.matches.join(', ')}`
          : `${label(context.watchingWith)}: limited signal`,
      points: Math.round(company.score * 13),
    },
    {
      category: 'priority',
      label: 'watchlist age',
      points: Math.round(taste.watchlistAge * 3),
    },
  ];

  return {
    movie,
    score,
    signals: {
      decade: taste.decade,
      decadeSampleSize: taste.decadeSampleSize,
      decadeDifference: taste.decadeDifference,
      decadeConfidence: taste.decadeConfidence,
      similarRatedMovie: taste.similarRatedMovie,
      yearSimilarity: taste.yearSimilarity,
      watchlistAge: taste.watchlistAge,
      habitDistance: taste.habitDistance,
      genreAffinity: taste.genreAffinity,
      metadataSimilarity: taste.metadataSimilarity,
      tasteScore: taste.tasteScore,
      tonightScore,
      finalScore: score,
      tasteComponents: taste.tasteComponents,
      contributions,
    },
    contextMatches: {
      mood: mood.matches,
      energy: energy.matches,
      company: company.matches,
      runtime: runtime.matches,
    },
    limitedMetadata:
      movie.metadata?.status !== 'matched' ||
      !mood.available ||
      !energy.available ||
      !company.available ||
      !runtime.available,
  };
}

function scoreAsPercent(score: number, mode: RecommendationMode) {
  if (mode === 'wildcard') return Math.round(55 + clamp(score) * 31);
  if (mode === 'risky') return Math.round(58 + clamp(score) * 34);
  return Math.round(48 + clamp(score) * 49);
}

function waitingReason(movie: WatchlistMovie, age: number) {
  if (!movie.addedDate || age < 0.2) return null;
  const year = movie.addedDate.match(/^\d{4}/)?.[0];
  return year
    ? `It has been waiting on your watchlist since ${year}.`
    : 'It receives a small boost for waiting on your watchlist.';
}

function buildTonightReasons(
  candidate: CandidateScore,
  profile: TasteProfile,
  context: RecommendationContext,
) {
  const { movie, signals, contextMatches } = candidate;
  const reasons: string[] = [];
  if (context.moods.length > 0 && contextMatches.mood.length > 0) {
    reasons.push(
      `Matches tonight’s ${context.moods.map(label).join(' + ')} mood through ${contextMatches.mood.slice(0, 2).join(' and ')}.`,
    );
  }
  if (
    context.runtimeLimit !== null &&
    typeof movie.metadata?.runtimeMinutes === 'number'
  ) {
    reasons.push(
      `Fits your ${context.runtimeLimit}-minute limit at ${movie.metadata?.runtimeMinutes} minutes.`,
    );
  }
  if (context.energy !== 'normal' && contextMatches.energy.length > 0) {
    reasons.push(
      `Its ${contextMatches.energy.slice(0, 2).join(' and ')} signals fit a ${label(context.energy)} night.`,
    );
  }
  if (context.watchingWith !== 'alone' && contextMatches.company.length > 0) {
    reasons.push(
      `${contextMatches.company.slice(0, 2).join(' and ')} make it a stronger ${context.watchingWith} pick.`,
    );
  }

  const positiveGenre = (movie.metadata?.genres ?? [])
    .map((genre) => profile.genres.find((stat) => stat.key === genre))
    .filter((stat): stat is NonNullable<typeof stat> => Boolean(stat))
    .sort((a, b) => b.regularizedRating - a.regularizedRating)[0];
  if (
    positiveGenre &&
    positiveGenre.sampleSize >= 3 &&
    positiveGenre.regularizedDifference >= 0.1
  ) {
    reasons.push(
      `Your regularized ${positiveGenre.label} pattern is +${positiveGenre.regularizedDifference.toFixed(1)} stars across ${positiveGenre.sampleSize} rated films.`,
    );
  } else if (
    signals.decade &&
    signals.decadeSampleSize >= 3 &&
    signals.decadeDifference >= 0.1
  ) {
    reasons.push(
      `You rate ${signals.decade} films +${signals.decadeDifference.toFixed(1)} stars above your average across ${signals.decadeSampleSize} films.`,
    );
  }
  if (signals.similarRatedMovie && signals.metadataSimilarity >= 0.45) {
    const shared = signals.tasteComponents.find(
      (component) => component.name === 'similarity',
    )?.evidence[0];
    reasons.push(
      `${shared ? `${shared} connects it to` : 'Its metadata connects it to'} ${signals.similarRatedMovie.title}, which you rated ${signals.similarRatedMovie.rating} stars.`,
    );
  }
  const ageReason = waitingReason(movie, signals.watchlistAge);
  if (ageReason) reasons.push(ageReason);
  if (candidate.limitedMetadata && reasons.length < 2) {
    reasons.push(
      'Some context signals remain limited until this film has confirmed metadata.',
    );
  }
  if (reasons.length === 0) {
    reasons.push(
      'Balanced from your rating history and tonight’s confirmed context signals.',
    );
  }
  return reasons.slice(0, 3);
}

function unwatchedWatchlist(library: MovieLibrary) {
  const watchedIds = new Set(library.watched.map((movie) => movie.id));
  return {
    watchedIds,
    movies: library.watchlist.filter((movie) => !watchedIds.has(movie.id)),
  };
}

function avoidRecent(
  movies: WatchlistMovie[],
  excludedIds: Set<string>,
  requestedCount: number,
) {
  const fresh = movies.filter((movie) => !excludedIds.has(movie.id));
  return fresh.length >= Math.min(requestedCount, movies.length)
    ? fresh
    : movies;
}

export function recommendMovies({
  library,
  profile,
  context,
  excludedIds = [],
  runIndex = 0,
  nowMs = Date.now(),
}: {
  library: MovieLibrary;
  profile: TasteProfile;
  context: RecommendationContext;
  excludedIds?: string[];
  runIndex?: number;
  nowMs?: number;
}): RecommendationResult {
  const { movies: unwatched, watchedIds } = unwatchedWatchlist(library);
  let excludedByRuntime = 0;
  let excludedMissingRuntime = 0;
  const runtimeEligible = unwatched.filter((movie) => {
    if (context.runtimeLimit === null) return true;
    const runtime = movie.metadata?.runtimeMinutes;
    if (runtime === null || runtime === undefined) {
      excludedMissingRuntime += 1;
      return false;
    }
    if (runtime > context.runtimeLimit) {
      excludedByRuntime += 1;
      return false;
    }
    return true;
  });
  const candidates = avoidRecent(runtimeEligible, new Set(excludedIds), 3);
  const scored = candidates
    .map((movie) =>
      scoreTonightCandidate(movie, profile, context, runIndex, nowMs),
    )
    .sort(
      (a, b) => b.score - a.score || a.movie.title.localeCompare(b.movie.title),
    );
  const recommendations = scored.slice(0, 3).map((candidate) => ({
    movie: candidate.movie,
    mode: 'tonight' as const,
    matchScore: scoreAsPercent(candidate.score, 'tonight'),
    reasons: buildTonightReasons(candidate, profile, context),
    signals: candidate.signals,
    limitedMetadata: candidate.limitedMetadata,
  }));
  const limitLabel =
    context.runtimeLimit === null ? null : `${context.runtimeLimit} minutes`;
  const message =
    runtimeEligible.length < 3 && context.runtimeLimit !== null
      ? `Only ${runtimeEligible.length} unwatched watchlist ${runtimeEligible.length === 1 ? 'movie has' : 'movies have'} a confirmed runtime of ${limitLabel} or less. ${excludedMissingRuntime > 0 ? `${excludedMissingRuntime} with missing runtime metadata were excluded.` : ''}`.trim()
      : excludedMissingRuntime > 0 && context.runtimeLimit !== null
        ? `${excludedMissingRuntime} ${excludedMissingRuntime === 1 ? 'movie was' : 'movies were'} excluded because runtime metadata is missing.`
        : null;

  if (process.env.NODE_ENV !== 'production') {
    console.table(
      recommendations.map((recommendation) => ({
        movie: recommendation.movie.title,
        taste: Math.round(recommendation.signals.tasteScore * 100),
        tonight: Math.round(recommendation.signals.tonightScore * 100),
        final: Math.round(recommendation.signals.finalScore * 100),
        genres: Math.round(
          (recommendation.signals.tasteComponents.find(
            (item) => item.name === 'genres',
          )?.score ?? 0.5) * 100,
        ),
        keywords: Math.round(
          (recommendation.signals.tasteComponents.find(
            (item) => item.name === 'keywords',
          )?.score ?? 0.5) * 100,
        ),
        director: Math.round(
          (recommendation.signals.tasteComponents.find(
            (item) => item.name === 'director',
          )?.score ?? 0.5) * 100,
        ),
        origin: Math.round(
          (recommendation.signals.tasteComponents.find(
            (item) => item.name === 'country and language',
          )?.score ?? 0.5) * 100,
        ),
        similarity: Math.round(recommendation.signals.metadataSimilarity * 100),
        mood: recommendation.signals.contributions.find(
          (item) => item.category === 'mood',
        )?.label,
        runtime: recommendation.movie.metadata?.runtimeMinutes ?? 'missing',
      })),
    );
  }

  return {
    recommendations,
    diagnostics: {
      watchlistCandidates: library.watchlist.length,
      excludedWatched: library.watchlist.filter((movie) =>
        watchedIds.has(movie.id),
      ).length,
      excludedByRuntime,
      excludedMissingRuntime,
      eligibleAfterFilters: runtimeEligible.length,
      message,
    },
  };
}

function surpriseReasons(
  movie: WatchlistMovie,
  taste: TasteSignals,
  profile: TasteProfile,
  mode: Exclude<RecommendationMode, 'tonight'>,
) {
  const reasons: string[] = [];
  if (mode === 'wildcard') {
    if (taste.decadeSampleSize < 3 && taste.decade) {
      reasons.push(
        `${taste.decade} films are still underexplored in your ratings.`,
      );
    } else if (taste.habitDistance >= 0.45) {
      reasons.push(
        'Its release era sits outside the center of your usual rated history.',
      );
    }
  } else if (mode === 'risky' && taste.decadeSampleSize < 5 && taste.decade) {
    reasons.push(
      `Your taste model has only ${taste.decadeSampleSize} rated ${taste.decade} ${taste.decadeSampleSize === 1 ? 'film' : 'films'}, so there is useful uncertainty here.`,
    );
  } else if (
    taste.decade &&
    taste.decadeSampleSize >= 3 &&
    taste.decadeDifference >= 0.1
  ) {
    reasons.push(
      `You rate ${taste.decade} films +${taste.decadeDifference.toFixed(1)} stars above your average.`,
    );
  }
  if (taste.similarRatedMovie && taste.metadataSimilarity >= 0.35) {
    reasons.push(
      `It has a bridge to ${taste.similarRatedMovie.title}, which you rated ${taste.similarRatedMovie.rating} stars.`,
    );
  }
  const ageReason = waitingReason(movie, taste.watchlistAge);
  if (ageReason) reasons.push(ageReason);
  if (reasons.length === 0) {
    reasons.push(
      profile.overallAverage === null
        ? 'Ratings are missing, so this pick uses watchlist priority for now.'
        : 'Chosen from your real ratings, metadata confidence, and watchlist history.',
    );
  }
  return reasons.slice(0, 3);
}

export function surpriseMe({
  library,
  profile,
  mode,
  excludedIds = [],
  runIndex = 0,
  nowMs = Date.now(),
}: {
  library: MovieLibrary;
  profile: TasteProfile;
  mode: Exclude<RecommendationMode, 'tonight'>;
  excludedIds?: string[];
  runIndex?: number;
  nowMs?: number;
}): MovieRecommendation | null {
  const { movies } = unwatchedWatchlist(library);
  const candidates = avoidRecent(movies, new Set(excludedIds), 1);
  const scored = candidates
    .map((movie) => {
      const taste = tasteSignals(movie, profile, nowMs);
      const uncertainty = 1 - taste.evidenceConfidence;
      const positiveBridge = Math.max(
        taste.metadataSimilarity,
        taste.decadeFit,
      );
      const baseScore =
        mode === 'risky'
          ? taste.tasteScore * 0.42 +
            uncertainty * 0.32 +
            positiveBridge * 0.2 +
            taste.watchlistAge * 0.06
          : mode === 'wildcard'
            ? taste.habitDistance * 0.46 +
              uncertainty * 0.24 +
              positiveBridge * 0.24 +
              taste.watchlistAge * 0.06
            : taste.tasteScore * 0.84 +
              taste.watchlistAge * 0.08 +
              Math.max(taste.decadeConfidence, taste.genreConfidence) * 0.08;
      const score = clamp(
        baseScore + (hashUnit(`${movie.id}:${mode}:${runIndex}`) - 0.5) * 0.008,
      );
      return { movie, taste, score, positiveBridge };
    })
    .filter(({ taste, positiveBridge }) =>
      mode === 'wildcard'
        ? positiveBridge >= 0.25 &&
          (taste.habitDistance >= 0.25 || taste.decadeSampleSize < 3)
        : true,
    )
    .sort(
      (a, b) => b.score - a.score || a.movie.title.localeCompare(b.movie.title),
    );
  const candidate = scored[0];
  if (!candidate) return null;

  const signals: RecommendationSignals = {
    decade: candidate.taste.decade,
    decadeSampleSize: candidate.taste.decadeSampleSize,
    decadeDifference: candidate.taste.decadeDifference,
    decadeConfidence: candidate.taste.decadeConfidence,
    similarRatedMovie: candidate.taste.similarRatedMovie,
    yearSimilarity: candidate.taste.yearSimilarity,
    watchlistAge: candidate.taste.watchlistAge,
    habitDistance: candidate.taste.habitDistance,
    genreAffinity: candidate.taste.genreAffinity,
    metadataSimilarity: candidate.taste.metadataSimilarity,
    tasteScore: candidate.taste.tasteScore,
    tonightScore: 0.5,
    finalScore: candidate.score,
    tasteComponents: candidate.taste.tasteComponents,
    contributions: candidate.taste.contributions,
  };
  return {
    movie: candidate.movie,
    mode,
    matchScore: scoreAsPercent(candidate.score, mode),
    reasons: surpriseReasons(candidate.movie, candidate.taste, profile, mode),
    signals,
    limitedMetadata: candidate.movie.metadata?.status !== 'matched',
  };
}
