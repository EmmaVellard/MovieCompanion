import type {
  ImportFileSummary,
  ImportSummary,
  MovieCompanionBackup,
  MovieMetadata,
  MovieMetadataCandidate,
  SourceMovieRecord,
  TmdbImageConfiguration,
} from '@/lib/types';

const BACKUP_FORMAT = 'movie-companion-backup';
export const MOVIE_COMPANION_BACKUP_VERSION = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === 'number' && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isSourceMovieRecord(value: unknown): value is SourceMovieRecord {
  if (!isObject(value)) return false;
  return (
    isString(value.key) &&
    isString(value.movieKey) &&
    isString(value.title) &&
    ['ratings', 'watched', 'watchlist'].includes(String(value.kind)) &&
    isNullableNumber(value.year) &&
    isNullableString(value.letterboxdUri) &&
    isNullableNumber(value.rating) &&
    isNullableString(value.date) &&
    isString(value.importedAt) &&
    isString(value.sourceFileName)
  );
}

function isImportSummary(value: unknown): value is ImportSummary {
  if (!isObject(value) || !isObject(value.recordsByKind)) return false;
  const recordCountsAreValid = Object.entries(value.recordsByKind).every(
    ([kind, count]) =>
      ['ratings', 'watched', 'watchlist'].includes(kind) &&
      typeof count === 'number' &&
      Number.isFinite(count),
  );
  return (
    isString(value.id) &&
    isString(value.importedAt) &&
    isStringArray(value.fileNames) &&
    recordCountsAreValid &&
    typeof value.skippedRows === 'number' &&
    typeof value.warningCount === 'number' &&
    (value.files === undefined ||
      (Array.isArray(value.files) && value.files.every(isImportFileSummary)))
  );
}

function isImportFileSummary(value: unknown): value is ImportFileSummary {
  if (!isObject(value)) return false;
  return (
    isString(value.fileName) &&
    ['ratings', 'watched', 'watchlist'].includes(String(value.kind)) &&
    ['parsedRows', 'importedRows', 'skippedRows', 'duplicateRows', 'errorCount']
      .map((key) => value[key])
      .every((count) => typeof count === 'number' && Number.isFinite(count))
  );
}

function isMetadataCandidate(value: unknown): value is MovieMetadataCandidate {
  if (!isObject(value)) return false;
  return (
    typeof value.tmdbId === 'number' &&
    Number.isFinite(value.tmdbId) &&
    isString(value.title) &&
    isString(value.originalTitle) &&
    isNullableNumber(value.year) &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    (value.posterPath === undefined || isNullableString(value.posterPath))
  );
}

function isMovieMetadata(value: unknown): value is MovieMetadata {
  if (!isObject(value)) return false;
  return (
    isString(value.movieKey) &&
    value.provider === 'tmdb' &&
    ['matched', 'unmatched', 'ambiguous', 'error'].includes(
      String(value.status),
    ) &&
    isNullableNumber(value.tmdbId) &&
    isNullableString(value.matchedTitle) &&
    isNullableNumber(value.matchedYear) &&
    isNullableNumber(value.confidence) &&
    isNullableString(value.posterPath) &&
    isNullableString(value.backdropPath) &&
    isNullableNumber(value.runtimeMinutes) &&
    isStringArray(value.genres) &&
    isString(value.overview) &&
    isNullableString(value.originalLanguage) &&
    isNullableString(value.releaseDate) &&
    isStringArray(value.productionCountries) &&
    isStringArray(value.keywords) &&
    isNullableString(value.director) &&
    isStringArray(value.cast) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isMetadataCandidate) &&
    (value.matchMethod === undefined ||
      value.matchMethod === 'automatic' ||
      value.matchMethod === 'manual') &&
    isString(value.attemptedAt) &&
    isNullableString(value.error)
  );
}

function isTmdbConfiguration(
  value: unknown,
): value is TmdbImageConfiguration | null {
  if (value === null) return true;
  if (!isObject(value)) return false;
  return (
    value.id === 'tmdb' &&
    isString(value.secureBaseUrl) &&
    isString(value.posterSize) &&
    isString(value.backdropSize) &&
    isString(value.fetchedAt)
  );
}

export function parseMovieCompanionBackup(
  value: unknown,
): MovieCompanionBackup {
  if (!isObject(value) || value.format !== BACKUP_FORMAT) {
    throw new Error('This is not a Movie Companion backup file.');
  }
  if (value.version !== MOVIE_COMPANION_BACKUP_VERSION) {
    throw new Error(
      `This backup version is not supported. Expected version ${MOVIE_COMPANION_BACKUP_VERSION}.`,
    );
  }
  if (!isString(value.exportedAt) || !isObject(value.data)) {
    throw new Error('The backup is missing its export information.');
  }

  const sourceMovies = value.data.sourceMovies;
  const imports = value.data.imports;
  const movieMetadata = value.data.movieMetadata;
  const tmdbConfiguration = value.data.tmdbConfiguration;
  if (
    !Array.isArray(sourceMovies) ||
    !sourceMovies.every(isSourceMovieRecord)
  ) {
    throw new Error('The backup contains invalid Letterboxd movie records.');
  }
  if (!Array.isArray(imports) || !imports.every(isImportSummary)) {
    throw new Error('The backup contains an invalid import history.');
  }
  if (!Array.isArray(movieMetadata) || !movieMetadata.every(isMovieMetadata)) {
    throw new Error('The backup contains invalid movie metadata.');
  }
  if (!isTmdbConfiguration(tmdbConfiguration)) {
    throw new Error('The backup contains invalid poster configuration.');
  }

  return {
    format: BACKUP_FORMAT,
    version: MOVIE_COMPANION_BACKUP_VERSION,
    exportedAt: value.exportedAt,
    data: {
      sourceMovies,
      imports,
      movieMetadata,
      tmdbConfiguration,
    },
  };
}
