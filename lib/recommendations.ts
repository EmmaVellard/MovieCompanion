import {
  scoreCompany,
  scoreEnergy,
  scoreMood,
  scoreRuntime,
  type ContextSignal,
} from '@/lib/recommendation-mappings';
import { extractMovieFeatures } from '@/lib/movie-features';
import { movieSimilarity } from '@/lib/movie-similarity';
import { affinityFromStats, average, clamp } from '@/lib/statistics';
import { formatDecade } from '@/lib/taste-profile';
import type {
  MovieLibrary,
  MovieFeatures,
  MovieRecommendation,
  HabitDistanceComponent,
  RecommendationBridge,
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
  habitDistanceComponents: HabitDistanceComponent[];
  positiveBridge: RecommendationBridge | null;
  signalAgreement: number;
  neutralScore: number;
  tasteScore: number;
  tasteComponents: TasteScoreComponent[];
  contributions: RecommendationContribution[];
}

export const PERSONAL_TASTE_WEIGHTS: Record<TasteScoreComponentName, number> = {
  genres: 0.51,
  'genre combinations': 0.015,
  keywords: 0.02,
  director: 0.02,
  cast: 0,
  'country and language': 0.015,
  decade: 0.29,
  runtime: 0.12,
  'interaction patterns': 0.005,
  similarity: 0.005,
  'evidence confidence': 0,
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
  diversityReason?: string | null;
}

const DIVERSITY_PENALTY = 0.12;
const DIVERSITY_RELEVANCE_FLOOR = 0.1;

const HABIT_DISTANCE_WEIGHTS: Record<
  HabitDistanceComponent['feature'],
  number
> = {
  genres: 0.27,
  countries: 0.14,
  language: 0.14,
  decade: 0.15,
  runtime: 0.12,
  keywords: 0.18,
};

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

function residualAffinity(
  stats: TasteStat[],
  expectedDifference: (stat: TasteStat) => number,
  overallAverage: number,
  neutralScore: number,
) {
  const residualStats = stats.map((stat) => {
    const residual = stat.regularizedDifference - expectedDifference(stat);
    return {
      ...stat,
      regularizedRating: clamp(overallAverage + residual, 0.5, 5),
      regularizedDifference: residual,
    };
  });
  return affinityFromStats(residualStats, neutralScore);
}

function combinationAffinity(
  profile: TasteProfile,
  features: MovieFeatures,
  neutralScore: number,
) {
  const combinations = supportedStats(
    features.genreCombinations,
    profile.genreCombinations,
    3,
  );
  const genreLookup = new Map(profile.genres.map((stat) => [stat.key, stat]));
  return residualAffinity(
    combinations,
    (combination) => {
      const parentDifferences = combination.key
        .split(' + ')
        .map((genre) => genreLookup.get(genre)?.regularizedDifference)
        .filter((value): value is number => value !== undefined);
      return parentDifferences.length > 0 ? average(parentDifferences) : 0;
    },
    profile.overallAverage ?? 3,
    neutralScore,
  );
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

function interactionAffinity(
  profile: TasteProfile,
  features: MovieFeatures,
  neutralScore: number,
) {
  const matches = interactionMatches(profile, features);
  const liftByKey = new Map(
    matches.map((interaction) => [
      interaction.key,
      interaction.interactionLift,
    ]),
  );
  return residualAffinity(
    matches,
    (interaction) =>
      interaction.regularizedDifference - (liftByKey.get(interaction.key) ?? 0),
    profile.overallAverage ?? 3,
    neutralScore,
  );
}

function strongestPositiveBridge(
  components: TasteScoreComponent[],
  neutralScore: number,
): RecommendationBridge | null {
  return (
    components
      .filter(
        (component) =>
          component.name !== 'evidence confidence' &&
          component.confidence >= 0.12 &&
          component.score >= neutralScore + 0.025 &&
          component.evidence.length > 0,
      )
      .map((component) => ({
        component: component.name,
        label: component.evidence[0],
        score: clamp(
          (0.5 + (component.score - neutralScore) * 2) * component.confidence,
        ),
        confidence: component.confidence,
      }))
      .sort((a, b) => b.score - a.score || b.confidence - a.confidence)[0] ??
    null
  );
}

function componentAgreement(components: TasteScoreComponent[]) {
  const supported = components.filter(
    (component) =>
      component.name !== 'evidence confidence' && component.confidence >= 0.12,
  );
  if (supported.length < 2) return 0.5;
  const totalConfidence = supported.reduce(
    (total, component) => total + component.confidence,
    0,
  );
  const mean =
    supported.reduce(
      (total, component) => total + component.score * component.confidence,
      0,
    ) / totalConfidence;
  const deviation =
    supported.reduce(
      (total, component) =>
        total + Math.abs(component.score - mean) * component.confidence,
      0,
    ) / totalConfidence;
  return clamp(1 - deviation / 0.22);
}

function habitComponent(
  feature: HabitDistanceComponent['feature'],
  keys: string[],
  stats: TasteStat[],
  ratedMovieCount: number,
  commonShare: number,
): HabitDistanceComponent | null {
  if (keys.length === 0) return null;
  const lookup = new Map(stats.map((stat) => [stat.key, stat]));
  const commonSampleSize = Math.max(3, ratedMovieCount * commonShare);
  const familiarity = average(
    keys.map((key) =>
      clamp((lookup.get(key)?.sampleSize ?? 0) / commonSampleSize),
    ),
  );
  const evidence = [...keys]
    .sort(
      (a, b) =>
        (lookup.get(a)?.sampleSize ?? 0) - (lookup.get(b)?.sampleSize ?? 0),
    )
    .slice(0, 2);
  return {
    feature,
    distance: 1 - familiarity,
    confidence: clamp(ratedMovieCount / 24),
    evidence,
  };
}

export function scoreHabitDistance(
  features: MovieFeatures,
  profile: TasteProfile,
) {
  const components = [
    habitComponent(
      'genres',
      features.genres,
      profile.genres,
      profile.ratedMovieCount,
      0.22,
    ),
    habitComponent(
      'countries',
      features.countries,
      profile.countries,
      profile.ratedMovieCount,
      0.16,
    ),
    habitComponent(
      'language',
      features.language ? [features.language] : [],
      profile.languages,
      profile.ratedMovieCount,
      0.2,
    ),
    habitComponent(
      'decade',
      features.decade ? [features.decade] : [],
      profile.decades,
      profile.ratedMovieCount,
      0.2,
    ),
    habitComponent(
      'runtime',
      features.runtimeBand ? [features.runtimeBand] : [],
      profile.runtimeBands,
      profile.ratedMovieCount,
      0.24,
    ),
    habitComponent(
      'keywords',
      features.keywords.slice(0, 8),
      profile.keywords,
      profile.ratedMovieCount,
      0.1,
    ),
  ].filter((component): component is HabitDistanceComponent =>
    Boolean(component),
  );
  const availableWeight = components.reduce(
    (total, component) => total + HABIT_DISTANCE_WEIGHTS[component.feature],
    0,
  );
  const rawDistance =
    availableWeight === 0
      ? 0.5
      : components.reduce(
          (total, component) =>
            total +
            component.distance * HABIT_DISTANCE_WEIGHTS[component.feature],
          0,
        ) / availableWeight;
  const historyConfidence = clamp(profile.ratedMovieCount / 24);
  return {
    score: clamp(0.5 + (rawDistance - 0.5) * historyConfidence),
    confidence: historyConfidence * clamp(availableWeight),
    components,
  };
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
  const combinations = combinationAffinity(profile, features, neutralScore);
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
  const interactions = interactionAffinity(profile, features, neutralScore);
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
    positiveBridge: strongestPositiveBridge(components, neutralScore),
    signalAgreement: componentAgreement(components),
    neutralScore,
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
  const habitDistance = scoreHabitDistance(scored.features, profile);
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
    habitDistance: habitDistance.score,
    habitDistanceComponents: habitDistance.components,
    positiveBridge: scored.positiveBridge,
    signalAgreement: scored.signalAgreement,
    neutralScore: scored.neutralScore,
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

function candidateSimilarity(first: CandidateScore, second: CandidateScore) {
  const similarity = movieSimilarity(
    extractMovieFeatures(first.movie.metadata, first.movie.year),
    extractMovieFeatures(second.movie.metadata, second.movie.year),
  );
  return {
    ...similarity,
    reliableScore: similarity.score * similarity.confidence,
  };
}

function diversityExplanation(
  candidate: CandidateScore,
  selected: CandidateScore[],
) {
  const features = extractMovieFeatures(
    candidate.movie.metadata,
    candidate.movie.year,
  );
  const selectedFeatures = selected.map((item) =>
    extractMovieFeatures(item.movie.metadata, item.movie.year),
  );
  const selectedGenres = new Set(
    selectedFeatures.flatMap((item) =>
      item.genres.map((genre) => genre.toLowerCase()),
    ),
  );
  const distinctiveGenres = features.genres.filter(
    (genre) => !selectedGenres.has(genre.toLowerCase()),
  );
  if (distinctiveGenres.length > 0) {
    return `Adds variety to the three with ${distinctiveGenres.slice(0, 2).join(' and ')}.`;
  }

  const selectedRuntimes = selectedFeatures
    .map((item) => item.runtimeMinutes)
    .filter((runtime): runtime is number => runtime !== null);
  const runtimeMinutes = features.runtimeMinutes;
  if (
    runtimeMinutes !== null &&
    selectedRuntimes.some((runtime) => Math.abs(runtime - runtimeMinutes) >= 30)
  ) {
    return `Adds a different pacing option at ${runtimeMinutes} minutes.`;
  }

  if (
    features.decade &&
    selectedFeatures.every((item) => item.decade !== features.decade)
  ) {
    return `Adds a different-era option from the ${formatDecade(Number(features.decade))}.`;
  }

  return 'Adds a meaningfully different option without leaving the strongest tier.';
}

function selectDiverseCandidates(scored: CandidateScore[], count: number) {
  const remaining = [...scored];
  const selected: CandidateScore[] = [];
  let promotions = 0;
  const strongestScore = scored[0]?.score ?? 0;

  while (remaining.length > 0 && selected.length < count) {
    const baseLeader = remaining[0];
    if (selected.length === 0) {
      selected.push(baseLeader);
      remaining.shift();
      continue;
    }

    const qualityTier = remaining.filter(
      (candidate) =>
        candidate.score >= strongestScore - DIVERSITY_RELEVANCE_FLOOR,
    );
    const eligible = qualityTier.length > 0 ? qualityTier : [baseLeader];
    const rankedForSlate = eligible
      .map((candidate) => {
        const closestSelected = selected
          .map((selectedCandidate) => ({
            candidate: selectedCandidate,
            similarity: candidateSimilarity(candidate, selectedCandidate),
          }))
          .sort(
            (a, b) => b.similarity.reliableScore - a.similarity.reliableScore,
          )[0];
        return {
          candidate,
          closestSelected,
          slateScore:
            candidate.score -
            (closestSelected?.similarity.reliableScore ?? 0) *
              DIVERSITY_PENALTY,
        };
      })
      .sort(
        (a, b) =>
          b.slateScore - a.slateScore ||
          b.candidate.score - a.candidate.score ||
          a.candidate.movie.title.localeCompare(b.candidate.movie.title),
      );
    const choice = rankedForSlate[0];
    const promoted = choice.candidate.movie.id !== baseLeader.movie.id;
    if (promoted) promotions += 1;
    selected.push({
      ...choice.candidate,
      diversityReason: promoted
        ? diversityExplanation(choice.candidate, selected)
        : null,
    });
    remaining.splice(
      remaining.findIndex(
        (candidate) => candidate.movie.id === choice.candidate.movie.id,
      ),
      1,
    );
  }

  return { selected, promotions };
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
      habitDistanceComponents: taste.habitDistanceComponents,
      positiveBridge: taste.positiveBridge,
      signalAgreement: taste.signalAgreement,
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

function bridgeHabitFeatures(bridge: RecommendationBridge | null) {
  if (!bridge) return new Set<HabitDistanceComponent['feature']>();
  const mapping: Partial<
    Record<TasteScoreComponentName, HabitDistanceComponent['feature'][]>
  > = {
    genres: ['genres'],
    'genre combinations': ['genres'],
    keywords: ['keywords'],
    'country and language': ['countries', 'language'],
    decade: ['decade'],
    runtime: ['runtime'],
  };
  return new Set(mapping[bridge.component] ?? []);
}

function buildTonightReasons(
  candidate: CandidateScore,
  profile: TasteProfile,
  context: RecommendationContext,
) {
  const { movie, signals, contextMatches } = candidate;
  const reasons: string[] = [];
  if (candidate.diversityReason) reasons.push(candidate.diversityReason);
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
  const diverseSelection = selectDiverseCandidates(scored, 3);
  const recommendations = diverseSelection.selected.map((candidate) => ({
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
      diversityPromotions: diverseSelection.promotions,
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
    const bridgeFeatures = bridgeHabitFeatures(taste.positiveBridge);
    const novel = [...taste.habitDistanceComponents]
      .filter(
        (component) =>
          component.distance >= 0.5 && !bridgeFeatures.has(component.feature),
      )
      .sort((a, b) => b.distance * b.confidence - a.distance * a.confidence)
      .slice(0, 2);
    if (novel.length > 0) {
      const novelty = novel
        .map((component) => {
          const feature =
            component.feature === 'countries'
              ? 'country'
              : component.feature === 'genres'
                ? 'genre'
                : component.feature;
          return `${feature}: ${component.evidence.join(' + ')}`;
        })
        .join('; ');
      reasons.push(
        `Explores less familiar parts of your history — ${novelty}.`,
      );
    }
  } else if (mode === 'risky') {
    if (taste.signalAgreement < 0.68) {
      reasons.push(
        'Its supported taste signals disagree, making it promising but genuinely uncertain.',
      );
    } else {
      reasons.push(
        `It has a positive connection with only ${Math.round(taste.evidenceConfidence * 100)}% feature confidence.`,
      );
    }
  } else if (
    taste.decade &&
    taste.decadeSampleSize >= 3 &&
    taste.decadeDifference >= 0.1
  ) {
    reasons.push(
      `You rate ${taste.decade} films +${taste.decadeDifference.toFixed(1)} stars above your average.`,
    );
  }
  if (taste.positiveBridge) {
    reasons.push(
      `${taste.positiveBridge.label} provides a confidence-backed bridge to your taste.`,
    );
  }
  if (taste.similarRatedMovie && taste.metadataSimilarity >= 0.35) {
    const alreadyExplained = taste.positiveBridge?.component === 'similarity';
    if (!alreadyExplained) {
      reasons.push(
        `It has a bridge to ${taste.similarRatedMovie.title}, which you rated ${taste.similarRatedMovie.rating} stars.`,
      );
    }
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
      const disagreement = 1 - taste.signalAgreement;
      const positiveBridge = taste.positiveBridge?.score ?? 0;
      const bridgeFeatures = bridgeHabitFeatures(taste.positiveBridge);
      const independentNovelty = taste.habitDistanceComponents
        .filter((component) => !bridgeFeatures.has(component.feature))
        .reduce(
          (strongest, component) =>
            Math.max(strongest, component.distance * component.confidence),
          0,
        );
      const baseScore =
        mode === 'risky'
          ? taste.tasteScore * 0.45 +
            uncertainty * 0.17 +
            disagreement * 0.2 +
            positiveBridge * 0.12 +
            taste.watchlistAge * 0.06
          : mode === 'wildcard'
            ? taste.habitDistance * 0.5 +
              positiveBridge * 0.25 +
              uncertainty * 0.08 +
              taste.tasteScore * 0.11 +
              taste.watchlistAge * 0.06
            : taste.tasteScore * 0.72 +
              taste.evidenceConfidence * 0.16 +
              taste.signalAgreement * 0.08 +
              taste.watchlistAge * 0.04;
      const score = clamp(
        baseScore + (hashUnit(`${movie.id}:${mode}:${runIndex}`) - 0.5) * 0.008,
      );
      return { movie, taste, score, positiveBridge, independentNovelty };
    })
    .filter(({ taste, positiveBridge, independentNovelty }) =>
      mode === 'wildcard'
        ? positiveBridge >= 0.14 &&
          taste.habitDistance >= 0.42 &&
          independentNovelty >= 0.28 &&
          taste.tasteScore >= taste.neutralScore - 0.06
        : mode === 'risky'
          ? positiveBridge >= 0.08 ||
            taste.tasteScore >= taste.neutralScore + 0.02
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
    habitDistanceComponents: candidate.taste.habitDistanceComponents,
    positiveBridge: candidate.taste.positiveBridge,
    signalAgreement: candidate.taste.signalAgreement,
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
