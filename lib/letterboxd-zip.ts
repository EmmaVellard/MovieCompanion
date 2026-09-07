import { unzipSync } from 'fflate';

const supportedCsvNames = new Set([
  'ratings.csv',
  'watched.csv',
  'watchlist.csv',
]);
const maximumArchiveBytes = 50 * 1024 * 1024;
const maximumExtractedBytes = 100 * 1024 * 1024;

export interface ExtractedLetterboxdCsv {
  name: string;
  bytes: Uint8Array;
}

function baseName(path: string) {
  return path.split('/').at(-1)?.toLowerCase() ?? '';
}

export function extractLetterboxdCsvBytes(
  archiveBytes: Uint8Array,
): ExtractedLetterboxdCsv[] {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(archiveBytes);
  } catch {
    throw new Error(
      'This ZIP could not be opened. Choose the original Letterboxd export ZIP or its CSV files.',
    );
  }

  const extracted = Object.entries(archive)
    .filter(([path]) => supportedCsvNames.has(baseName(path)))
    .map(([path, bytes]) => ({ name: baseName(path), bytes }));
  const extractedBytes = extracted.reduce(
    (total, file) => total + file.bytes.byteLength,
    0,
  );

  if (extractedBytes > maximumExtractedBytes) {
    throw new Error('This Letterboxd export is too large to import safely.');
  }
  if (extracted.length === 0) {
    throw new Error(
      'No supported Letterboxd files were found in this ZIP. Expected ratings.csv, watched.csv, or watchlist.csv.',
    );
  }

  return extracted;
}

export async function extractLetterboxdCsvFiles(file: File): Promise<File[]> {
  if (file.size > maximumArchiveBytes) {
    throw new Error('This ZIP is too large to import safely (50 MB maximum).');
  }

  const extracted = extractLetterboxdCsvBytes(
    new Uint8Array(await file.arrayBuffer()),
  );
  return extracted.map(
    ({ name, bytes }) =>
      new File([new Uint8Array(bytes)], name, { type: 'text/csv' }),
  );
}
