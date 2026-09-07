import { openDB, type DBSchema } from 'idb';

import {
  MOVIE_COMPANION_BACKUP_VERSION,
  parseMovieCompanionBackup,
} from '@/lib/backup';
import { getPreparedFileValidationError } from '@/lib/letterboxd';
import type {
  BackupRestoreSummary,
  ImportSummary,
  LetterboxdDataStatus,
  LetterboxdFileKind,
  MetadataMovieInput,
  MovieCompanionBackup,
  MovieMetadata,
  MovieMetadataStatusSummary,
  MovieLibrary,
  PreparedImportFile,
  SourceMovieRecord,
  TmdbCredentialSettings,
  TmdbImageConfiguration,
  UnresolvedMovieMatch,
  WatchedMovie,
  WatchlistMovie,
} from '@/lib/types';

interface MovieCompanionDatabase extends DBSchema {
  sourceMovies: {
    key: string;
    value: SourceMovieRecord;
    indexes: { kind: LetterboxdFileKind };
  };
  imports: {
    key: string;
    value: ImportSummary;
    indexes: { importedAt: string };
  };
  movieMetadata: {
    key: string;
    value: MovieMetadata;
    indexes: { status: MovieMetadata['status'] };
  };
  tmdbConfiguration: {
    key: string;
    value: TmdbImageConfiguration;
  };
  appSettings: {
    key: string;
    value: TmdbCredentialSettings;
  };
}

let database: ReturnType<typeof openDB<MovieCompanionDatabase>> | null = null;

function debugImport(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Movie Companion import] ${event}`, details);
  }
}

function getDatabase() {
  database ??= openDB<MovieCompanionDatabase>('movie-companion', 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sourceMovies')) {
        const sourceMovies = db.createObjectStore('sourceMovies', {
          keyPath: 'key',
        });
        sourceMovies.createIndex('kind', 'kind');
      }
      if (!db.objectStoreNames.contains('imports')) {
        const imports = db.createObjectStore('imports', { keyPath: 'id' });
        imports.createIndex('importedAt', 'importedAt');
      }
      if (!db.objectStoreNames.contains('movieMetadata')) {
        const metadata = db.createObjectStore('movieMetadata', {
          keyPath: 'movieKey',
        });
        metadata.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('tmdbConfiguration')) {
        db.createObjectStore('tmdbConfiguration', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings', { keyPath: 'id' });
      }
    },
  });
  return database;
}

function compareMovies(
  a: { title: string; year: number | null },
  b: { title: string; year: number | null },
) {
  return a.title.localeCompare(b.title) || (a.year ?? 0) - (b.year ?? 0);
}

export async function importLetterboxdFiles(files: PreparedImportFile[]) {
  const readyFiles = files.filter(
    (file): file is PreparedImportFile & { kind: LetterboxdFileKind } =>
      Boolean(file.kind) && getPreparedFileValidationError(file) === null,
  );

  if (readyFiles.length !== files.length || readyFiles.length === 0) {
    const firstError = files.map(getPreparedFileValidationError).find(Boolean);
    throw new Error(
      firstError ?? 'No valid Letterboxd files are ready to import.',
    );
  }

  const db = await getDatabase();
  const importedAt = new Date().toISOString();
  const summary: ImportSummary = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    importedAt,
    fileNames: readyFiles.map((file) => file.fileName),
    recordsByKind: {},
    skippedRows: readyFiles.reduce(
      (total, file) => total + file.skippedRows,
      0,
    ),
    warningCount: readyFiles.reduce(
      (total, file) => total + file.warnings.length,
      0,
    ),
    files: readyFiles.map((file) => ({
      fileName: file.fileName,
      kind: file.kind,
      parsedRows: file.parsedRows,
      importedRows: file.records.length,
      skippedRows: file.skippedRows,
      duplicateRows: file.duplicateRows,
      errorCount: file.errorCount,
    })),
  };

  const transaction = db.transaction(['sourceMovies', 'imports'], 'readwrite');
  const store = transaction.objectStore('sourceMovies');
  const kinds = [...new Set(readyFiles.map((file) => file.kind))];

  for (const kind of kinds) {
    const oldKeys = await store.index('kind').getAllKeys(kind);
    await Promise.all(oldKeys.map((key) => store.delete(key)));

    const filesForKind = readyFiles.filter((file) => file.kind === kind);
    const records = new Map<string, SourceMovieRecord>();

    for (const file of filesForKind) {
      for (const row of file.records) {
        const record: SourceMovieRecord = {
          ...row,
          key: `${kind}:${row.movieKey}`,
          kind,
          importedAt,
          sourceFileName: file.fileName,
        };
        records.set(record.key, record);
      }
    }

    summary.recordsByKind[kind] = records.size;
    for (const record of records.values()) await store.put(record);
  }

  await transaction.objectStore('imports').put(summary);
  await transaction.done;
  debugImport('persisted', {
    fileNames: summary.fileNames,
    recordsByKind: summary.recordsByKind,
    skippedRows: summary.skippedRows,
  });
  return summary;
}

export async function getMovieLibrary(): Promise<MovieLibrary> {
  const db = await getDatabase();
  const [records, metadataRecords, tmdbImageConfiguration] = await Promise.all([
    db.getAll('sourceMovies'),
    db.getAll('movieMetadata'),
    db.get('tmdbConfiguration', 'tmdb'),
  ]);
  const metadataByMovie = new Map(
    metadataRecords.map((metadata) => [metadata.movieKey, metadata]),
  );
  const watchedByMovie = new Map<string, WatchedMovie>();
  const watchlist: WatchlistMovie[] = [];

  function displayMetadata(movieKey: string) {
    const metadata = metadataByMovie.get(movieKey) ?? null;
    const posterUrl =
      metadata?.status === 'matched' &&
      metadata.posterPath &&
      tmdbImageConfiguration
        ? `${tmdbImageConfiguration.secureBaseUrl}${tmdbImageConfiguration.posterSize}${metadata.posterPath}`
        : null;
    return { metadata, posterUrl };
  }

  for (const record of records) {
    const display = displayMetadata(record.movieKey);
    if (record.kind === 'watchlist') {
      watchlist.push({
        id: record.movieKey,
        title: record.title,
        year: record.year,
        letterboxdUri: record.letterboxdUri,
        addedDate: record.date,
        ...display,
      });
      continue;
    }

    const current = watchedByMovie.get(record.movieKey);
    const source = record.kind as 'ratings' | 'watched';
    watchedByMovie.set(record.movieKey, {
      id: record.movieKey,
      title: record.title || current?.title || 'Untitled',
      year: record.year ?? current?.year ?? null,
      letterboxdUri: record.letterboxdUri ?? current?.letterboxdUri ?? null,
      rating:
        record.kind === 'ratings' ? record.rating : (current?.rating ?? null),
      watchedDate:
        record.kind === 'watched'
          ? record.date
          : (current?.watchedDate ?? null),
      sources: [...new Set([...(current?.sources ?? []), source])],
      ...display,
    });
  }

  return {
    watched: [...watchedByMovie.values()].sort(compareMovies),
    watchlist: watchlist.sort(compareMovies),
    tmdbImageConfiguration: tmdbImageConfiguration ?? null,
  };
}

function uniqueMovieInputs(records: SourceMovieRecord[]) {
  const movies = new Map<string, MetadataMovieInput>();
  for (const record of records) {
    const current = movies.get(record.movieKey);
    movies.set(record.movieKey, {
      movieKey: record.movieKey,
      title: record.title || current?.title || 'Untitled',
      year: record.year ?? current?.year ?? null,
    });
  }
  return [...movies.values()].sort(compareMovies);
}

export async function getMovieMetadataStatus(): Promise<MovieMetadataStatusSummary> {
  const db = await getDatabase();
  const [records, metadataRecords] = await Promise.all([
    db.getAll('sourceMovies'),
    db.getAll('movieMetadata'),
  ]);
  const currentKeys = new Set(records.map((record) => record.movieKey));
  const metadataByMovie = new Map(
    metadataRecords
      .filter((metadata) => currentKeys.has(metadata.movieKey))
      .map((metadata) => [metadata.movieKey, metadata]),
  );
  const summary: MovieMetadataStatusSummary = {
    total: currentKeys.size,
    enriched: 0,
    unmatched: 0,
    ambiguous: 0,
    errors: 0,
    missing: 0,
  };

  for (const movieKey of currentKeys) {
    const metadata = metadataByMovie.get(movieKey);
    if (!metadata) summary.missing += 1;
    else if (metadata.status === 'matched') summary.enriched += 1;
    else if (metadata.status === 'unmatched') summary.unmatched += 1;
    else if (metadata.status === 'ambiguous') summary.ambiguous += 1;
    else summary.errors += 1;
  }
  return summary;
}

export async function getMoviesNeedingMetadata({
  retryUnresolved = false,
}: {
  retryUnresolved?: boolean;
} = {}): Promise<MetadataMovieInput[]> {
  const db = await getDatabase();
  const [records, metadataRecords] = await Promise.all([
    db.getAll('sourceMovies'),
    db.getAll('movieMetadata'),
  ]);
  const metadataByMovie = new Map(
    metadataRecords.map((metadata) => [metadata.movieKey, metadata]),
  );

  return uniqueMovieInputs(records)
    .filter((movie) => {
      const metadata = metadataByMovie.get(movie.movieKey);
      if (!metadata || metadata.status === 'error') return true;
      return retryUnresolved && metadata.status !== 'matched';
    })
    .map((movie) => ({
      ...movie,
      existingStatus: metadataByMovie.get(movie.movieKey)?.status ?? null,
    }));
}

export async function saveMovieMetadata(
  metadata: MovieMetadata,
  configuration?: TmdbImageConfiguration | null,
) {
  const db = await getDatabase();
  const stores: Array<'movieMetadata' | 'tmdbConfiguration'> = configuration
    ? ['movieMetadata', 'tmdbConfiguration']
    : ['movieMetadata'];
  const transaction = db.transaction(stores, 'readwrite');
  await transaction.objectStore('movieMetadata').put(metadata);
  if (configuration) {
    await transaction.objectStore('tmdbConfiguration').put(configuration);
  }
  await transaction.done;
}

export async function getUnresolvedMovieMatches(): Promise<
  UnresolvedMovieMatch[]
> {
  const db = await getDatabase();
  const [records, metadataRecords] = await Promise.all([
    db.getAll('sourceMovies'),
    db.getAll('movieMetadata'),
  ]);
  const moviesByKey = new Map(
    uniqueMovieInputs(records).map((movie) => [movie.movieKey, movie]),
  );

  return metadataRecords
    .filter(
      (metadata) =>
        (metadata.status === 'unmatched' || metadata.status === 'ambiguous') &&
        metadata.candidates.length > 0 &&
        moviesByKey.has(metadata.movieKey),
    )
    .map((metadata) => ({
      movie: moviesByKey.get(metadata.movieKey)!,
      metadata,
    }))
    .sort((a, b) => compareMovies(a.movie, b.movie));
}

export async function createMovieCompanionBackup(): Promise<MovieCompanionBackup> {
  const db = await getDatabase();
  const [sourceMovies, imports, movieMetadata, tmdbConfiguration] =
    await Promise.all([
      db.getAll('sourceMovies'),
      db.getAll('imports'),
      db.getAll('movieMetadata'),
      db.get('tmdbConfiguration', 'tmdb'),
    ]);

  return {
    format: 'movie-companion-backup',
    version: MOVIE_COMPANION_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      sourceMovies,
      imports,
      movieMetadata,
      tmdbConfiguration: tmdbConfiguration ?? null,
    },
  };
}

export async function restoreMovieCompanionBackup(
  value: unknown,
): Promise<BackupRestoreSummary> {
  const backup = parseMovieCompanionBackup(value);
  const db = await getDatabase();
  const transaction = db.transaction(
    ['sourceMovies', 'imports', 'movieMetadata', 'tmdbConfiguration'],
    'readwrite',
  );
  const sourceMovies = transaction.objectStore('sourceMovies');
  const imports = transaction.objectStore('imports');
  const movieMetadata = transaction.objectStore('movieMetadata');
  const tmdbConfiguration = transaction.objectStore('tmdbConfiguration');

  const requests: Array<Promise<unknown>> = [
    sourceMovies.clear(),
    imports.clear(),
    movieMetadata.clear(),
    tmdbConfiguration.clear(),
    ...backup.data.sourceMovies.map((record) => sourceMovies.put(record)),
    ...backup.data.imports.map((summary) => imports.put(summary)),
    ...backup.data.movieMetadata.map((metadata) => movieMetadata.put(metadata)),
  ];
  if (backup.data.tmdbConfiguration) {
    requests.push(tmdbConfiguration.put(backup.data.tmdbConfiguration));
  }
  await Promise.all(requests);
  await transaction.done;

  return {
    sourceMovies: backup.data.sourceMovies.length,
    metadataRecords: backup.data.movieMetadata.length,
    imports: backup.data.imports.length,
  };
}

export async function getLatestImport() {
  const db = await getDatabase();
  const imports = await db.getAllFromIndex('imports', 'importedAt');
  return imports.at(-1) ?? null;
}

export async function getTmdbReadAccessToken() {
  const db = await getDatabase();
  const settings = await db.get('appSettings', 'tmdb-credential');
  return settings?.readAccessToken ?? null;
}

export async function hasTmdbReadAccessToken() {
  return Boolean(await getTmdbReadAccessToken());
}

export async function saveTmdbReadAccessToken(readAccessToken: string) {
  const normalized = readAccessToken.trim();
  if (normalized.length < 20) {
    throw new Error('Enter a valid TMDB API Read Access Token.');
  }
  const db = await getDatabase();
  await db.put('appSettings', {
    id: 'tmdb-credential',
    readAccessToken: normalized,
    savedAt: new Date().toISOString(),
  });
}

export async function clearTmdbReadAccessToken() {
  const db = await getDatabase();
  await db.delete('appSettings', 'tmdb-credential');
}

export async function getLetterboxdDataStatus(): Promise<LetterboxdDataStatus> {
  const db = await getDatabase();
  const records = await db.getAll('sourceMovies');
  const sources: LetterboxdDataStatus['sources'] = {
    ratings: null,
    watched: null,
    watchlist: null,
  };
  let latestImportedAt: string | null = null;

  for (const record of records) {
    const current = sources[record.kind];
    if (!current) {
      sources[record.kind] = {
        count: 1,
        importedAt: record.importedAt,
        sourceFileName: record.sourceFileName,
      };
    } else {
      current.count += 1;
      if (record.importedAt > current.importedAt) {
        current.importedAt = record.importedAt;
        current.sourceFileName = record.sourceFileName;
      }
    }
    if (!latestImportedAt || record.importedAt > latestImportedAt) {
      latestImportedAt = record.importedAt;
    }
  }

  return { sources, latestImportedAt };
}

export async function clearLocalMovieData() {
  const db = await getDatabase();
  const transaction = db.transaction(
    [
      'sourceMovies',
      'imports',
      'movieMetadata',
      'tmdbConfiguration',
      'appSettings',
    ],
    'readwrite',
  );
  await Promise.all([
    transaction.objectStore('sourceMovies').clear(),
    transaction.objectStore('imports').clear(),
    transaction.objectStore('movieMetadata').clear(),
    transaction.objectStore('tmdbConfiguration').clear(),
    transaction.objectStore('appSettings').clear(),
  ]);
  await transaction.done;
}
