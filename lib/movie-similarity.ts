import { clamp } from '@/lib/statistics';
import type { MovieFeatures } from '@/lib/types';

export const SIMILARITY_WEIGHTS = {
  genres: 0.22,
  keywords: 0.24,
  director: 0.13,
  countries: 0.08,
  language: 0.07,
  year: 0.1,
  runtime: 0.09,
  cast: 0.07,
} as const;

export type SimilarityFeature = keyof typeof SIMILARITY_WEIGHTS;

export interface SimilarityComponent {
  feature: SimilarityFeature;
  score: number;
  weight: number;
  available: boolean;
  shared: string[];
}

export interface MovieSimilarity {
  score: number;
  confidence: number;
  components: SimilarityComponent[];
  sharedFeatures: string[];
}

function normalizedSet(values: string[]) {
  return new Map(values.map((value) => [value.toLowerCase(), value]));
}

function setComponent(
  feature: SimilarityFeature,
  first: string[],
  second: string[],
): SimilarityComponent {
  const a = normalizedSet(first);
  const b = normalizedSet(second);
  const shared = [...a.entries()]
    .filter(([key]) => b.has(key))
    .map(([, value]) => value);
  const union = new Set([...a.keys(), ...b.keys()]);
  return {
    feature,
    score: union.size === 0 ? 0 : shared.length / union.size,
    weight: SIMILARITY_WEIGHTS[feature],
    available: a.size > 0 && b.size > 0,
    shared,
  };
}

function exactComponent(
  feature: 'director' | 'language',
  first: string | null,
  second: string | null,
): SimilarityComponent {
  const match =
    first !== null &&
    second !== null &&
    first.toLowerCase() === second.toLowerCase();
  return {
    feature,
    score: match ? 1 : 0,
    weight: SIMILARITY_WEIGHTS[feature],
    available: first !== null && second !== null,
    shared: match ? [first] : [],
  };
}

function distanceComponent(
  feature: 'year' | 'runtime',
  first: number | null,
  second: number | null,
  fullDistance: number,
): SimilarityComponent {
  const available = first !== null && second !== null;
  return {
    feature,
    score: available ? clamp(1 - Math.abs(first - second) / fullDistance) : 0,
    weight: SIMILARITY_WEIGHTS[feature],
    available,
    shared: [],
  };
}

export function movieSimilarity(
  first: MovieFeatures,
  second: MovieFeatures,
): MovieSimilarity {
  const components = [
    setComponent('genres', first.genres, second.genres),
    setComponent('keywords', first.keywords, second.keywords),
    exactComponent('director', first.director, second.director),
    setComponent('countries', first.countries, second.countries),
    exactComponent('language', first.language, second.language),
    distanceComponent('year', first.year, second.year, 40),
    distanceComponent(
      'runtime',
      first.runtimeMinutes,
      second.runtimeMinutes,
      90,
    ),
    setComponent('cast', first.cast, second.cast),
  ];
  const available = components.filter((component) => component.available);
  const availableWeight = available.reduce(
    (total, component) => total + component.weight,
    0,
  );
  const score =
    availableWeight === 0
      ? 0.5
      : available.reduce(
          (total, component) => total + component.score * component.weight,
          0,
        ) / availableWeight;
  return {
    score: clamp(score),
    confidence: clamp(availableWeight),
    components,
    sharedFeatures: available
      .flatMap((component) => component.shared)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, 5),
  };
}
