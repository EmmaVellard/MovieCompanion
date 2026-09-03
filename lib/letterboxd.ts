import Papa from 'papaparse';

import type {
  ImportedMovieRow,
  LetterboxdFileKind,
  PreparedImportFile,
} from '@/lib/types';

type CsvRow = Record<string, string | undefined>;

const HEADER_ALIASES = {
  title: ['name', 'title', 'film', 'movietitle'],
  year: ['year', 'releaseyear', 'released'],
  uri: ['letterboxduri', 'letterboxdurl', 'uri', 'url'],
  rating: ['rating', 'yourrating', 'userrating', 'stars'],
  rating10: ['rating10'],
  date: ['date', 'watcheddate', 'addeddate', 'dateadded'],
} as const;

function debugImport(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Movie Companion import] ${event}`, details);
  }
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hasAlias(fields: string[], aliases: readonly string[]) {
  return fields.some((field) => aliases.includes(field as never));
}

function firstValue(row: CsvRow, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[alias]?.trim();
    if (value) return value;
  }
  return null;
}

function parseYear(value: string | null) {
  if (!value) return null;
  const year = Number.parseInt(value, 10);
  const highestPlausibleYear = new Date().getFullYear() + 5;
  return year >= 1870 && year <= highestPlausibleYear ? year : null;
}

function parseRating(value: string | null, maximum = 5) {
  if (!value) return null;
  const rating = Number.parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(rating) || rating <= 0 || rating > maximum) return null;
  return maximum === 10 ? rating / 2 : rating;
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : value;
}

function normalizeUri(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function createMovieKey(
  title: string,
  year: number | null,
  letterboxdUri: string | null,
) {
  if (letterboxdUri) {
    try {
      const path = new URL(letterboxdUri).pathname.replace(/\/$/, '');
      const filmIndex = path.split('/').indexOf('film');
      const slug = path.split('/')[filmIndex + 1];
      if (slug) return `letterboxd:${slug.toLowerCase()}`;
    } catch {
      // Fall back to the title and year when a URI is not parseable.
    }
  }

  return `title:${slugify(title)}:${year ?? 'unknown'}`;
}

function detectFileKind(fileName: string, fields: string[]) {
  const normalizedFileName = normalizeHeader(fileName.replace(/\.csv$/i, ''));

  // Watched and watchlist exports have the same columns, so their official
  // filename is the only reliable way to tell them apart.
  if (normalizedFileName.includes('watchlist')) return 'watchlist';
  if (normalizedFileName.includes('watched')) return 'watched';
  if (normalizedFileName.includes('rating')) return 'ratings';
  if (
    hasAlias(fields, HEADER_ALIASES.rating) ||
    hasAlias(fields, HEADER_ALIASES.rating10)
  ) {
    return 'ratings';
  }

  return null;
}

function uniqueByMovieKey(records: ImportedMovieRow[]) {
  return [
    ...new Map(records.map((record) => [record.movieKey, record])).values(),
  ];
}

function emptyResult(fileName: string, fatalError: string): PreparedImportFile {
  return {
    fileName,
    detectedKind: null,
    kind: null,
    columns: [],
    records: [],
    parsedRows: 0,
    skippedRows: 0,
    duplicateRows: 0,
    errorCount: 0,
    warnings: [],
    fatalError,
  };
}

export function getPreparedFileValidationError(file: PreparedImportFile) {
  if (file.fatalError) return file.fatalError;
  if (!file.kind) {
    return 'This file could be watched.csv or watchlist.csv. Choose its data type.';
  }
  if (
    file.kind === 'ratings' &&
    !hasAlias(file.columns, HEADER_ALIASES.rating) &&
    !hasAlias(file.columns, HEADER_ALIASES.rating10)
  ) {
    return 'Missing expected column for ratings: Rating (or Rating10).';
  }
  if (file.records.length === 0) return 'No valid movie rows were found.';
  return null;
}

export async function prepareLetterboxdCsv(
  file: File,
): Promise<PreparedImportFile> {
  debugImport('file selected', { fileName: file.name, size: file.size });
  const text = await file.text();
  if (!text.trim()) return emptyResult(file.name, 'The CSV is empty.');

  const result = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  });

  const fields = result.meta.fields ?? [];
  const detectedKind = detectFileKind(file.name, fields);
  const parsedRows = result.data.length;
  const hasTitle = hasAlias(fields, HEADER_ALIASES.title);
  const hardParserError = result.errors.find((error) =>
    ['MissingQuotes', 'UndetectableDelimiter'].includes(error.code),
  );

  let fatalError: string | null = null;
  if (hardParserError) {
    fatalError = `The CSV could not be parsed: ${hardParserError.message}`;
  } else if (!hasTitle) {
    fatalError = 'Missing expected column: Name (or Title).';
  } else if (parsedRows === 0) {
    fatalError = 'No movie rows were found beneath the header.';
  } else if (
    detectedKind === 'ratings' &&
    !hasAlias(fields, HEADER_ALIASES.rating) &&
    !hasAlias(fields, HEADER_ALIASES.rating10)
  ) {
    fatalError = 'Missing expected column for ratings: Rating (or Rating10).';
  }

  if (fatalError) {
    const failedResult: PreparedImportFile = {
      fileName: file.name,
      detectedKind,
      kind: detectedKind,
      columns: fields,
      records: [],
      parsedRows,
      skippedRows: parsedRows,
      duplicateRows: 0,
      errorCount: result.errors.length,
      warnings: result.errors.slice(0, 5).map((error) => error.message),
      fatalError,
    };
    debugImport('parse failed', {
      fileName: file.name,
      parsedRows,
      errorCount: failedResult.errorCount,
      reason: fatalError,
    });
    return failedResult;
  }

  const warnings = result.errors.slice(0, 5).map((error) => error.message);
  let skippedRows = 0;
  const records: ImportedMovieRow[] = [];
  const ratingsFile = detectedKind === 'ratings';

  for (const row of result.data) {
    const title = firstValue(row, HEADER_ALIASES.title);
    if (!title) {
      skippedRows += 1;
      continue;
    }

    const rawYear = firstValue(row, HEADER_ALIASES.year);
    const rawFiveStarRating = firstValue(row, HEADER_ALIASES.rating);
    const rawTenPointRating = firstValue(row, HEADER_ALIASES.rating10);
    const year = parseYear(rawYear);
    const rating = rawFiveStarRating
      ? parseRating(rawFiveStarRating)
      : parseRating(rawTenPointRating, 10);
    const letterboxdUri = normalizeUri(firstValue(row, HEADER_ALIASES.uri));

    if (ratingsFile && rating === null) {
      skippedRows += 1;
      continue;
    }
    if (rawYear && year === null) {
      warnings.push(
        `Ignored an invalid year for row ${records.length + skippedRows + 1}.`,
      );
    }

    records.push({
      movieKey: createMovieKey(title, year, letterboxdUri),
      title,
      year,
      letterboxdUri,
      rating,
      date: normalizeDate(firstValue(row, HEADER_ALIASES.date)),
    });
  }

  const uniqueRecords = uniqueByMovieKey(records);
  const duplicateRows = records.length - uniqueRecords.length;
  const prepared: PreparedImportFile = {
    fileName: file.name,
    detectedKind,
    kind: detectedKind,
    columns: fields,
    records: uniqueRecords,
    parsedRows,
    skippedRows,
    duplicateRows,
    errorCount: result.errors.length,
    warnings: warnings.slice(0, 12),
    fatalError:
      uniqueRecords.length === 0 ? 'No valid movie rows were found.' : null,
  };

  debugImport('parsed', {
    fileName: file.name,
    detectedKind,
    parsedRows,
    validRows: uniqueRecords.length,
    skippedRows,
    duplicateRows,
    errorCount: result.errors.length,
  });
  return prepared;
}

export const letterboxdFileKindLabels: Record<LetterboxdFileKind, string> = {
  ratings: 'Ratings',
  watched: 'Watched',
  watchlist: 'Watchlist',
};
