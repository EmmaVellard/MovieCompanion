import type { TasteDimension, TasteStat } from '@/lib/types';

export interface PreferenceStatOptions {
  dimension: TasteDimension;
  priorSampleSize: number;
  minimumDisplaySample: number;
  labelForKey?: (key: string) => string;
}

export const STAT_OPTIONS: Record<
  Exclude<TasteDimension, 'interaction'>,
  PreferenceStatOptions
> = {
  genre: {
    dimension: 'genre',
    priorSampleSize: 6,
    minimumDisplaySample: 3,
  },
  'genre-combination': {
    dimension: 'genre-combination',
    priorSampleSize: 7,
    minimumDisplaySample: 3,
  },
  director: {
    dimension: 'director',
    priorSampleSize: 6,
    minimumDisplaySample: 2,
  },
  country: {
    dimension: 'country',
    priorSampleSize: 7,
    minimumDisplaySample: 3,
  },
  language: {
    dimension: 'language',
    priorSampleSize: 7,
    minimumDisplaySample: 3,
  },
  keyword: {
    dimension: 'keyword',
    priorSampleSize: 8,
    minimumDisplaySample: 3,
  },
  runtime: {
    dimension: 'runtime',
    priorSampleSize: 8,
    minimumDisplaySample: 5,
  },
  cast: {
    dimension: 'cast',
    priorSampleSize: 10,
    minimumDisplaySample: 4,
  },
  decade: {
    dimension: 'decade',
    priorSampleSize: 6,
    minimumDisplaySample: 3,
  },
};

export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function average(values: number[]) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export function addRating(
  groups: Map<string, number[]>,
  key: string | null | undefined,
  rating: number,
) {
  if (!key) return;
  const values = groups.get(key) ?? [];
  values.push(rating);
  groups.set(key, values);
}

export function buildPreferenceStats(
  groups: Map<string, number[]>,
  overallAverage: number | null,
  options: PreferenceStatOptions,
) {
  return [...groups.entries()].map(([key, values]) => {
    const groupAverage = average(values);
    const baseline = overallAverage ?? groupAverage;
    const sampleSize = values.length;
    const regularizedRating =
      (groupAverage * sampleSize + baseline * options.priorSampleSize) /
      (sampleSize + options.priorSampleSize);
    return {
      key,
      label: options.labelForKey?.(key) ?? key,
      dimension: options.dimension,
      averageRating: groupAverage,
      regularizedRating,
      differenceFromOverall: groupAverage - baseline,
      regularizedDifference: regularizedRating - baseline,
      sampleSize,
      confidence: sampleSize / (sampleSize + options.priorSampleSize),
    } satisfies TasteStat;
  });
}

export function hasDisplayEvidence(stat: TasteStat) {
  const options =
    stat.dimension === 'interaction' ? null : STAT_OPTIONS[stat.dimension];
  return stat.sampleSize >= (options?.minimumDisplaySample ?? 3);
}

export function statStrength(stat: TasteStat) {
  return Math.abs(stat.regularizedDifference) * stat.confidence;
}

export function affinityFromStats(stats: TasteStat[], neutralScore = 0.5) {
  if (stats.length === 0) {
    return { score: neutralScore, confidence: 0, evidence: [] as TasteStat[] };
  }
  const weighted = stats.map((stat) => ({
    stat,
    weight: Math.max(0.05, stat.confidence),
  }));
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
  return {
    score: clamp(
      weighted.reduce(
        (total, item) =>
          total + ((item.stat.regularizedRating - 1) / 4) * item.weight,
        0,
      ) / totalWeight,
    ),
    confidence: clamp(
      weighted.reduce(
        (total, item) => total + item.stat.confidence * item.weight,
        0,
      ) / totalWeight,
    ),
    evidence: stats,
  };
}
