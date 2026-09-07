'use client';

import { useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { importLetterboxdFiles } from '@/lib/database';
import {
  getPreparedFileValidationError,
  letterboxdFileKindLabels,
  prepareLetterboxdCsv,
} from '@/lib/letterboxd';
import { extractLetterboxdCsvFiles } from '@/lib/letterboxd-zip';
import type {
  ImportSummary,
  LetterboxdFileKind,
  PreparedImportFile,
} from '@/lib/types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (summary: ImportSummary) => Promise<void>;
}

type ImportPhase =
  | 'idle'
  | 'reading'
  | 'review'
  | 'importing'
  | 'success'
  | 'failure';

const importKinds = Object.entries(letterboxdFileKindLabels) as Array<
  [LetterboxdFileKind, string]
>;

function fileNamesLabel(fileNames: string[]) {
  if (fileNames.length === 0) return 'your export';
  if (fileNames.length === 1) return fileNames[0];
  return `${fileNames.length} Letterboxd files`;
}

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparedFiles, setPreparedFiles] = useState<PreparedImportFile[]>([]);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [currentFileNames, setCurrentFileNames] = useState<string[]>([]);
  const [successSummary, setSuccessSummary] = useState<ImportSummary | null>(
    null,
  );
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = phase === 'reading' || phase === 'importing';

  function resetImportState() {
    setPreparedFiles([]);
    setPhase('idle');
    setCurrentFileNames([]);
    setSuccessSummary(null);
    setError(null);
    setDragActive(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function persistFiles(files: PreparedImportFile[]) {
    setPhase('importing');
    setError(null);
    try {
      const summary = await importLetterboxdFiles(files);
      await onImported(summary);
      setSuccessSummary(summary);
      setPhase('success');
    } catch (caughtError) {
      const reason =
        caughtError instanceof Error
          ? caughtError.message
          : 'The import did not finish.';
      console.error('[Movie Companion import] import failed', caughtError);
      setError(reason);
      setPhase('failure');
    }
  }

  async function prepareFiles(files: File[]) {
    if (inputRef.current) inputRef.current.value = '';
    const supportedFiles = files.filter(
      (file) =>
        file.name.toLowerCase().endsWith('.csv') ||
        file.name.toLowerCase().endsWith('.zip') ||
        file.type === 'text/csv' ||
        file.type === 'application/zip',
    );

    if (supportedFiles.length === 0) {
      setCurrentFileNames(files.map((file) => file.name));
      setPreparedFiles([]);
      setError(
        'Choose the Letterboxd export ZIP or one or more CSV files from it.',
      );
      setPhase('failure');
      return;
    }

    setCurrentFileNames(supportedFiles.map((file) => file.name));
    setPreparedFiles([]);
    setSuccessSummary(null);
    setError(null);
    setPhase('reading');

    try {
      const expandedFiles = (
        await Promise.all(
          supportedFiles.map((file) =>
            file.name.toLowerCase().endsWith('.zip') ||
            file.type === 'application/zip'
              ? extractLetterboxdCsvFiles(file)
              : Promise.resolve([file]),
          ),
        )
      ).flat();
      setCurrentFileNames(expandedFiles.map((file) => file.name));
      const results = await Promise.all(
        expandedFiles.map(prepareLetterboxdCsv),
      );
      setPreparedFiles(results);

      const schemaFailure = results.find((file) => file.fatalError);
      if (schemaFailure) {
        setError(schemaFailure.fatalError);
        setPhase('failure');
        return;
      }

      if (results.some((file) => !file.kind)) {
        setPhase('review');
        return;
      }

      await persistFiles(results);
    } catch (caughtError) {
      console.error('[Movie Companion import] file read failed', caughtError);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'The file could not be read. Choose the original Letterboxd export ZIP or one of its CSV files.',
      );
      setPhase('failure');
    }
  }

  function updateKind(index: number, kind: LetterboxdFileKind) {
    const nextFiles = preparedFiles.map((file, fileIndex) =>
      fileIndex === index ? { ...file, kind } : file,
    );
    setPreparedFiles(nextFiles);

    if (nextFiles.some((file) => !file.kind)) return;
    const validationError = nextFiles
      .map(getPreparedFileValidationError)
      .find(Boolean);
    if (validationError) {
      setError(validationError);
      setPhase('review');
      return;
    }
    void persistFiles(nextFiles);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && busy) return;
    if (!nextOpen) resetImportState();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] overflow-y-auto border border-border bg-popover p-5 sm:max-w-xl sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl font-semibold tracking-[-0.03em]">
            Import from Letterboxd
          </DialogTitle>
          <DialogDescription className="leading-6">
            Add ratings.csv, watched.csv, or watchlist.csv. Movie Companion can
            open the Letterboxd export ZIP directly, recognizes the files, and
            saves them locally on this device.
          </DialogDescription>
        </DialogHeader>

        {busy && (
          <output
            aria-live="polite"
            className="block rounded-2xl border border-primary/25 bg-primary/8 p-5"
          >
            <LoaderCircle
              className="size-6 animate-spin text-primary"
              aria-hidden="true"
            />
            <p className="mt-4 font-semibold">
              Importing {fileNamesLabel(currentFileNames)}…
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {phase === 'reading'
                ? 'Opening, recognizing, and validating your Letterboxd data.'
                : 'Saving to this device and refreshing your library.'}
            </p>
          </output>
        )}

        {phase === 'success' && successSummary && (
          <output aria-live="polite" className="block space-y-3">
            <div className="rounded-2xl border border-primary/25 bg-primary/8 p-4">
              <CheckCircle2
                className="size-6 text-primary"
                aria-hidden="true"
              />
              <p className="mt-3 text-lg font-semibold">Import successful</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your local library is saved and up to date.
              </p>
            </div>
            {successSummary.files?.map((file) => (
              <div
                key={`${successSummary.id}-${file.fileName}`}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">
                    {file.fileName}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {letterboxdFileKindLabels[file.kind]}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Parsed</dt>
                    <dd className="mt-0.5 font-medium">
                      {file.parsedRows.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Imported</dt>
                    <dd className="mt-0.5 font-medium">
                      {file.importedRows.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Skipped</dt>
                    <dd className="mt-0.5 font-medium">
                      {(file.skippedRows + file.duplicateRows).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Errors</dt>
                    <dd className="mt-0.5 font-medium">
                      {file.errorCount.toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </output>
        )}

        {phase === 'failure' && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4"
          >
            <XCircle className="size-6 text-destructive" aria-hidden="true" />
            <p className="mt-3 text-lg font-semibold">Import failed</p>
            <p className="mt-2 text-sm font-medium">Reason:</p>
            <p className="mt-1 text-sm leading-6 text-destructive">{error}</p>
          </div>
        )}

        {phase === 'review' && (
          <output className="block rounded-2xl border border-border bg-card p-4">
            <p className="font-medium">One quick check</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Watched and watchlist exports use the same columns. Choose what
              the renamed file contains and the import will continue.
            </p>
          </output>
        )}

        {(phase === 'idle' || phase === 'review' || phase === 'failure') && (
          <div
            className={`rounded-2xl border border-dashed p-5 text-center transition-colors sm:p-7 ${
              dragActive
                ? 'border-primary bg-primary/8'
                : 'border-border bg-background/45'
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              void prepareFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <Upload
              className="mx-auto size-7 text-primary"
              aria-hidden="true"
            />
            <p className="mt-3 font-medium">Drop your Letterboxd export here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              or choose them from this device
            </p>
            <label className="mt-4 inline-flex h-11 cursor-pointer items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-within:ring-3 focus-within:ring-ring/50 active:bg-primary-hover">
              Choose ZIP or CSV files
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                accept=".zip,.csv,application/zip,text/csv"
                multiple
                disabled={busy}
                onChange={(event) =>
                  void prepareFiles(Array.from(event.target.files ?? []))
                }
              />
            </label>
          </div>
        )}

        {preparedFiles.length > 0 && phase !== 'success' && (
          <div className="space-y-2" aria-label="Selected files">
            {preparedFiles.map((file, index) => {
              const validationError = getPreparedFileValidationError(file);
              return (
                <div
                  key={`${file.fileName}-${index}`}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                      <FileSpreadsheet className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {file.fileName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Parsed {file.parsedRows.toLocaleString()} · Ready{' '}
                        {file.records.length.toLocaleString()} · Skipped{' '}
                        {(
                          file.skippedRows + file.duplicateRows
                        ).toLocaleString()}{' '}
                        · Errors {file.errorCount.toLocaleString()}
                      </p>
                      {validationError && file.kind && (
                        <p className="mt-2 text-xs leading-5 text-destructive">
                          {validationError}
                        </p>
                      )}
                    </div>
                    {!file.fatalError && (
                      <select
                        aria-label={`Data type for ${file.fileName}`}
                        value={file.kind ?? ''}
                        onChange={(event) =>
                          updateKind(
                            index,
                            event.target.value as LetterboxdFileKind,
                          )
                        }
                        className="h-9 max-w-32 rounded-lg border border-input bg-background px-2 text-xs font-medium outline-none focus:ring-3 focus:ring-ring/40"
                      >
                        <option value="" disabled>
                          Choose type
                        </option>
                        {importKinds.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Check
            className="mt-0.5 size-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          Files are read and stored locally. They are not uploaded to Movie
          Companion or any analytics service.
        </div>

        {phase === 'success' && (
          <DialogFooter className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6">
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              onClick={resetImportState}
            >
              Import another file
            </Button>
            <Button
              className="h-10 rounded-xl"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
