import { openDB, type DBSchema } from 'idb';

import { getPreparedFileValidationError } from '@/lib/letterboxd';
import type {
  ImportSummary,
  LetterboxdDataStatus,
  LetterboxdFileKind,
  MovieLibrary,
  PreparedImportFile,
  SourceMovieRecord,
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
}

let database: ReturnType<typeof openDB<MovieCompanionDatabase>> | null = null;

function debugImport(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Movie Companion import] ${event}`, details);
  }
}

function getDatabase() {
  database ??= openDB<MovieCompanionDatabase>('movie-companion', 1, {
    upgrade(db) {
      const sourceMovies = db.createObjectStore('sourceMovies', {
        keyPath: 'key',
      });
      sourceMovies.createIndex('kind', 'kind');

      const imports = db.createObjectStore('imports', { keyPath: 'id' });
      imports.createIndex('importedAt', 'importedAt');
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
  const records = await db.getAll('sourceMovies');
  const watchedByMovie = new Map<string, WatchedMovie>();
  const watchlist: WatchlistMovie[] = [];

  for (const record of records) {
    if (record.kind === 'watchlist') {
      watchlist.push({
        id: record.movieKey,
        title: record.title,
        year: record.year,
        letterboxdUri: record.letterboxdUri,
        addedDate: record.date,
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
    });
  }

  return {
    watched: [...watchedByMovie.values()].sort(compareMovies),
    watchlist: watchlist.sort(compareMovies),
  };
}

export async function getLatestImport() {
  const db = await getDatabase();
  const imports = await db.getAllFromIndex('imports', 'importedAt');
  return imports.at(-1) ?? null;
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
  const transaction = db.transaction(['sourceMovies', 'imports'], 'readwrite');
  await Promise.all([
    transaction.objectStore('sourceMovies').clear(),
    transaction.objectStore('imports').clear(),
  ]);
  await transaction.done;
}
