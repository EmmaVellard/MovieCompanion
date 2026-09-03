import { formatDecade } from '@/lib/taste-profile';
import type {
  MovieLibrary,
  MovieRecommendation,
  RecommendationContext,
  RecommendationMode,
  RecommendationSignals,
  TasteProfile,
  WatchlistMovie,
} from '@/lib/types';

interface CandidateScore {
  movie: WatchlistMovie;
  score: number;
  signals: RecommendationSignals;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function watchlistAge(dateValue: string | null) {
  if (!dateValue) return 0.25;
  const timestamp = Date.parse(dateValue);
  if (!Number.isFinite(timestamp)) return 0.25;
  const days = (Date.now() - timestamp) / 86_400_000;
  return clamp(days / (365 * 4));
}

function closestHighlyRatedMovie(movie: WatchlistMovie, profile: TasteProfile) {
  if (movie.year === null) return null;
  return (
    profile.highRatedMovies
      .filter((ratedMovie) => ratedMovie.year !== null)
      .map((ratedMovie) => ({
        movie: ratedMovie,
        distance: Math.abs(movie.year! - ratedMovie.year!),
      }))
      .sort(
        (a, b) => a.distance - b.distance || b.movie.rating - a.movie.rating,
      )[0] ?? null
  );
}

function scoreCandidate(
  movie: WatchlistMovie,
  profile: TasteProfile,
  mode: RecommendationMode,
  runIndex: number,
): CandidateScore {
  const decade = movie.year === null ? null : Math.floor(movie.year / 10) * 10;
  const decadeStat = profile.decades.find(
    (stat) => stat.key === String(decade),
  );
  const closest = closestHighlyRatedMovie(movie, profile);
  const yearSimilarity = closest ? clamp(1 - closest.distance / 35) : 0;
  const decadeFit = decadeStat
    ? clamp((decadeStat.regularizedRating - 1) / 4)
    : 0.5;
  const decadeConfidence = decadeStat?.confidence ?? 0;
  const age = watchlistAge(movie.addedDate);
  const habitDistance =
    movie.year !== null && profile.averageRatedYear !== null
      ? clamp(Math.abs(movie.year - profile.averageRatedYear) / 45)
      : 0.5;
  const uncertainty = 1 - decadeConfidence;
  const positiveBridge = Math.max(
    yearSimilarity,
    decadeStat ? clamp(0.5 + decadeStat.differenceFromOverall / 2) : 0,
  );
  const jitter = hashUnit(`${movie.id}:${mode}:${runIndex}`) * 0.045;

  let score: number;
  if (mode === 'risky') {
    score =
      decadeFit * 0.38 +
      uncertainty * 0.32 +
      positiveBridge * 0.22 +
      age * 0.08;
  } else if (mode === 'wildcard') {
    score =
      habitDistance * 0.48 +
      uncertainty * 0.24 +
      positiveBridge * 0.2 +
      age * 0.08;
  } else {
    score =
      decadeFit * 0.56 +
      yearSimilarity * 0.22 +
      decadeConfidence * 0.12 +
      age * 0.1;
  }

  return {
    movie,
    score: score + jitter,
    signals: {
      decade: decade === null ? null : formatDecade(decade),
      decadeSampleSize: decadeStat?.sampleSize ?? 0,
      decadeDifference: decadeStat?.differenceFromOverall ?? 0,
      decadeConfidence,
      similarRatedMovie: closest?.movie ?? null,
      yearSimilarity,
      watchlistAge: age,
      habitDistance,
    },
  };
}

function scoreAsPercent(score: number, mode: RecommendationMode) {
  if (mode === 'wildcard') return Math.round(58 + clamp(score) * 25);
  if (mode === 'risky') return Math.round(61 + clamp(score) * 29);
  return Math.round(64 + clamp(score) * 31);
}

function waitingReason(movie: WatchlistMovie, age: number) {
  if (!movie.addedDate || age < 0.2) return null;
  const year = movie.addedDate.match(/^\d{4}/)?.[0];
  return year
    ? `It has been waiting on your watchlist since ${year}.`
    : 'It receives a small boost for waiting on your watchlist.';
}

function buildReasons(
  candidate: CandidateScore,
  profile: TasteProfile,
  mode: RecommendationMode,
) {
  const { movie, signals } = candidate;
  const reasons: string[] = [];

  if (profile.overallAverage === null) {
    reasons.push(
      'Ratings are missing, so this pick uses watchlist priority for now.',
    );
  } else if (
    signals.decade &&
    signals.decadeSampleSize >= 3 &&
    signals.decadeDifference >= 0.1
  ) {
    reasons.push(
      `You rate ${signals.decade} films ${signals.decadeDifference >= 0 ? '+' : ''}${signals.decadeDifference.toFixed(1)} stars above your average, across ${signals.decadeSampleSize} films.`,
    );
  }

  if (mode === 'wildcard') {
    if (signals.decadeSampleSize < 3 && signals.decade) {
      reasons.push(
        `${signals.decade} films are still underexplored in your ratings.`,
      );
    } else if (signals.habitDistance >= 0.45) {
      reasons.push(
        'Its release era sits outside the center of your usual rated history.',
      );
    }
  } else if (
    mode === 'risky' &&
    signals.decadeSampleSize < 5 &&
    signals.decade
  ) {
    reasons.push(
      `Your taste model has only ${signals.decadeSampleSize} rated ${signals.decade} ${signals.decadeSampleSize === 1 ? 'film' : 'films'}, so there is useful uncertainty here.`,
    );
  }

  if (signals.similarRatedMovie && signals.yearSimilarity >= 0.72) {
    reasons.push(
      `Close in release era to ${signals.similarRatedMovie.title}, which you rated ${signals.similarRatedMovie.rating} stars.`,
    );
  }

  const ageReason = waitingReason(movie, signals.watchlistAge);
  if (ageReason) reasons.push(ageReason);

  if (reasons.length < 2) {
    reasons.push(
      'Ranked from your real ratings, release-year patterns, and watchlist history.',
    );
  }
  if (reasons.length < 2) {
    reasons.push(
      'Kept eligible because it is on your current Letterboxd watchlist.',
    );
  }

  return reasons.slice(0, 3);
}

function eligibleWatchlist(library: MovieLibrary, excludedIds: Set<string>) {
  const watchedIds = new Set(library.watched.map((movie) => movie.id));
  const eligible = library.watchlist.filter(
    (movie) => !watchedIds.has(movie.id),
  );
  const fresh = eligible.filter((movie) => !excludedIds.has(movie.id));
  return fresh.length >= Math.min(3, eligible.length) ? fresh : eligible;
}

export function recommendMovies({
  library,
  profile,
  context: _context,
  excludedIds = [],
  runIndex = 0,
}: {
  library: MovieLibrary;
  profile: TasteProfile;
  context: RecommendationContext;
  excludedIds?: string[];
  runIndex?: number;
}): MovieRecommendation[] {
  const candidates = eligibleWatchlist(library, new Set(excludedIds));
  return candidates
    .map((movie) => scoreCandidate(movie, profile, 'tonight', runIndex))
    .sort(
      (a, b) => b.score - a.score || a.movie.title.localeCompare(b.movie.title),
    )
    .slice(0, 3)
    .map((candidate) => ({
      movie: candidate.movie,
      mode: 'tonight',
      matchScore: scoreAsPercent(candidate.score, 'tonight'),
      reasons: buildReasons(candidate, profile, 'tonight'),
      signals: candidate.signals,
      limitedMetadata: true,
    }));
}

export function surpriseMe({
  library,
  profile,
  mode,
  excludedIds = [],
  runIndex = 0,
}: {
  library: MovieLibrary;
  profile: TasteProfile;
  mode: Exclude<RecommendationMode, 'tonight'>;
  excludedIds?: string[];
  runIndex?: number;
}): MovieRecommendation | null {
  const candidates = eligibleWatchlist(library, new Set(excludedIds));
  const scored = candidates
    .map((movie) => scoreCandidate(movie, profile, mode, runIndex))
    .filter((candidate) => {
      if (mode !== 'wildcard') return true;
      return (
        candidate.signals.yearSimilarity >= 0.25 ||
        candidate.signals.decadeDifference > 0
      );
    })
    .sort(
      (a, b) => b.score - a.score || a.movie.title.localeCompare(b.movie.title),
    );
  const candidate = scored[0];
  if (!candidate) return null;

  return {
    movie: candidate.movie,
    mode,
    matchScore: scoreAsPercent(candidate.score, mode),
    reasons: buildReasons(candidate, profile, mode),
    signals: candidate.signals,
    limitedMetadata: true,
  };
}
