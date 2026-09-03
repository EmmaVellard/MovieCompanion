import type { MovieMetadataCandidate } from '@/lib/types';

export interface TmdbSearchCandidate {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  popularity?: number;
  alternative_titles?: string[];
}

interface ScoredCandidate extends MovieMetadataCandidate {
  source: TmdbSearchCandidate;
  exactTitle: boolean;
  exactYear: boolean;
}

export type TmdbMatchDecision =
  | {
      status: 'matched';
      match: TmdbSearchCandidate;
      confidence: number;
      candidates: MovieMetadataCandidate[];
    }
  | {
      status: 'unmatched' | 'ambiguous';
      match: null;
      confidence: number | null;
      candidates: MovieMetadataCandidate[];
    };

function normalizeTitle(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: string) {
  return new Set(normalizeTitle(value).split(' ').filter(Boolean));
}

function tokenSimilarity(a: string, b: string) {
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return (2 * overlap) / (aTokens.size + bTokens.size);
}

function releaseYear(value?: string) {
  const year = value?.match(/^\d{4}/)?.[0];
  return year ? Number(year) : null;
}

function scoreCandidate(
  title: string,
  year: number | null,
  candidate: TmdbSearchCandidate,
): ScoredCandidate {
  const normalizedInput = normalizeTitle(title);
  const normalizedTitles = [
    candidate.title,
    candidate.original_title,
    ...(candidate.alternative_titles ?? []),
  ].map(normalizeTitle);
  const exactTitle = normalizedTitles.includes(normalizedInput);
  const titleScore = exactTitle
    ? 1
    : Math.max(
        tokenSimilarity(title, candidate.title),
        tokenSimilarity(title, candidate.original_title),
        ...(candidate.alternative_titles ?? []).map((alternativeTitle) =>
          tokenSimilarity(title, alternativeTitle),
        ),
      );
  const candidateYear = releaseYear(candidate.release_date);
  const yearDistance =
    year === null || candidateYear === null
      ? null
      : Math.abs(year - candidateYear);
  const yearScore =
    yearDistance === null
      ? 0.5
      : yearDistance === 0
        ? 1
        : yearDistance === 1
          ? 0.72
          : yearDistance === 2
            ? 0.35
            : 0;
  const confidence = titleScore * 0.8 + yearScore * 0.2;

  return {
    tmdbId: candidate.id,
    title: candidate.title,
    originalTitle: candidate.original_title,
    year: candidateYear,
    confidence,
    source: candidate,
    exactTitle,
    exactYear: yearDistance === 0,
  };
}

export function chooseTmdbMatch(
  title: string,
  year: number | null,
  candidates: TmdbSearchCandidate[],
): TmdbMatchDecision {
  const scored = candidates
    .map((candidate) => scoreCandidate(title, year, candidate))
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        (b.source.popularity ?? 0) - (a.source.popularity ?? 0),
    );
  const summaries = scored.slice(0, 3).map(({ source: _source, ...item }) => {
    const { exactTitle: _exactTitle, exactYear: _exactYear, ...summary } = item;
    return summary;
  });
  const best = scored[0];
  if (!best || best.confidence < 0.68) {
    return {
      status: 'unmatched',
      match: null,
      confidence: best?.confidence ?? null,
      candidates: summaries,
    };
  }

  const runnerUp = scored[1];
  const margin = runnerUp ? best.confidence - runnerUp.confidence : 1;
  const yearIsSafe = year === null || best.exactYear;
  const uniqueEnough = margin >= 0.08;
  const safeMatch =
    best.exactTitle &&
    yearIsSafe &&
    best.confidence >= (year === null ? 0.9 : 0.96) &&
    uniqueEnough;

  if (!safeMatch) {
    return {
      status: 'ambiguous',
      match: null,
      confidence: best.confidence,
      candidates: summaries,
    };
  }

  return {
    status: 'matched',
    match: best.source,
    confidence: best.confidence,
    candidates: summaries,
  };
}
