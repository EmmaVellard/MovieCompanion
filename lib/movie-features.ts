import type { MovieFeatures, MovieMetadata, RuntimeBand } from '@/lib/types';

const UNINFORMATIVE_KEYWORDS = new Set([
  'aftercreditsstinger',
  'based on novel or book',
  'based on true story',
  'duringcreditsstinger',
  'independent film',
  'male protagonist',
  'no dialogue',
  'remake',
  'sequel',
  'woman director',
]);

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  cn: 'Cantonese',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fa: 'Persian',
  fr: 'French',
  hi: 'Hindi',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  sv: 'Swedish',
  zh: 'Mandarin',
};

function clean(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function unique(values: string[]) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function filterKeywords(keywords: string[]) {
  return unique(keywords).filter((keyword) => {
    const normalized = keyword.toLowerCase();
    return (
      normalized.length >= 3 &&
      normalized.length <= 48 &&
      !UNINFORMATIVE_KEYWORDS.has(normalized)
    );
  });
}

export function runtimeBandFor(
  runtimeMinutes: number | null,
): RuntimeBand | null {
  if (runtimeMinutes === null || runtimeMinutes <= 0) return null;
  if (runtimeMinutes < 90) return 'under-90';
  if (runtimeMinutes <= 120) return '90-120';
  if (runtimeMinutes <= 150) return '120-150';
  return 'over-150';
}

export function runtimeBandLabel(band: string) {
  const labels: Record<RuntimeBand, string> = {
    'under-90': 'Under 90 minutes',
    '90-120': '90–120 minutes',
    '120-150': '120–150 minutes',
    'over-150': 'Over 150 minutes',
  };
  return labels[band as RuntimeBand] ?? band;
}

export function languageLabel(language: string) {
  return LANGUAGE_NAMES[language.toLowerCase()] ?? language.toUpperCase();
}

export function decadeForYear(year: number | null) {
  return year === null ? null : String(Math.floor(year / 10) * 10);
}

export function genreCombinations(genres: string[]) {
  const normalized = unique(genres).sort((a, b) => a.localeCompare(b));
  const combinations: string[] = [];
  for (let first = 0; first < normalized.length; first += 1) {
    for (let second = first + 1; second < normalized.length; second += 1) {
      combinations.push(`${normalized[first]} + ${normalized[second]}`);
    }
  }
  return combinations;
}

export function extractMovieFeatures(
  metadata: MovieMetadata | null,
  year: number | null,
): MovieFeatures {
  const matched = metadata?.status === 'matched' ? metadata : null;
  const genres = unique(matched?.genres ?? []);
  const runtimeMinutes = matched?.runtimeMinutes ?? null;
  return {
    genres,
    genreCombinations: genreCombinations(genres),
    director: matched?.director ? clean(matched.director) : null,
    countries: unique(matched?.productionCountries ?? []),
    language: matched?.originalLanguage
      ? matched.originalLanguage.toLowerCase()
      : null,
    keywords: filterKeywords(matched?.keywords ?? []),
    runtimeBand: runtimeBandFor(runtimeMinutes),
    cast: unique(matched?.cast ?? []).slice(0, 8),
    decade: decadeForYear(year ?? matched?.matchedYear ?? null),
    year: year ?? matched?.matchedYear ?? null,
    runtimeMinutes,
  };
}
