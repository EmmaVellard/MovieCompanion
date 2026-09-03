export type LetterboxdFileKind = 'ratings' | 'watched' | 'watchlist';

export interface ImportedMovieRow {
  movieKey: string;
  title: string;
  year: number | null;
  letterboxdUri: string | null;
  rating: number | null;
  date: string | null;
}

export interface PreparedImportFile {
  fileName: string;
  detectedKind: LetterboxdFileKind | null;
  kind: LetterboxdFileKind | null;
  columns: string[];
  records: ImportedMovieRow[];
  parsedRows: number;
  skippedRows: number;
  duplicateRows: number;
  errorCount: number;
  warnings: string[];
  fatalError: string | null;
}

export interface SourceMovieRecord extends ImportedMovieRow {
  key: string;
  kind: LetterboxdFileKind;
  importedAt: string;
  sourceFileName: string;
}

export interface WatchedMovie {
  id: string;
  title: string;
  year: number | null;
  letterboxdUri: string | null;
  rating: number | null;
  watchedDate: string | null;
  sources: Array<'ratings' | 'watched'>;
}

export interface WatchlistMovie {
  id: string;
  title: string;
  year: number | null;
  letterboxdUri: string | null;
  addedDate: string | null;
}

export interface MovieLibrary {
  watched: WatchedMovie[];
  watchlist: WatchlistMovie[];
}

export interface ImportSummary {
  id: string;
  importedAt: string;
  fileNames: string[];
  recordsByKind: Partial<Record<LetterboxdFileKind, number>>;
  skippedRows: number;
  warningCount: number;
  files?: ImportFileSummary[];
}

export interface ImportFileSummary {
  fileName: string;
  kind: LetterboxdFileKind;
  parsedRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
  errorCount: number;
}

export interface LetterboxdSourceSummary {
  count: number;
  importedAt: string;
  sourceFileName: string;
}

export interface LetterboxdDataStatus {
  sources: Record<LetterboxdFileKind, LetterboxdSourceSummary | null>;
  latestImportedAt: string | null;
}

export interface TasteStat {
  key: string;
  label: string;
  averageRating: number;
  regularizedRating: number;
  differenceFromOverall: number;
  sampleSize: number;
  confidence: number;
}

export interface TasteProfile {
  ratedMovieCount: number;
  overallAverage: number | null;
  decades: TasteStat[];
  strongestDecades: TasteStat[];
  weakestDecades: TasteStat[];
  averageRatedYear: number | null;
  highRatedMovies: Array<{
    id: string;
    title: string;
    year: number | null;
    rating: number;
  }>;
  metadataCoverage: {
    genres: boolean;
    directors: boolean;
    countries: boolean;
    languages: boolean;
    runtime: boolean;
    posters: boolean;
  };
}

export type RecommendationMood =
  | 'intense'
  | 'fun'
  | 'comforting'
  | 'emotional'
  | 'weird'
  | 'visually-beautiful'
  | 'suspenseful'
  | 'thought-provoking';

export type RuntimeLimit = 90 | 120 | 150 | null;
export type WatchingWith = 'alone' | 'friends' | 'date';
export type EnergyLevel = 'easy' | 'normal' | 'full-attention';
export type RecommendationMode = 'tonight' | 'safe' | 'risky' | 'wildcard';

export interface RecommendationContext {
  moods: RecommendationMood[];
  runtimeLimit: RuntimeLimit;
  watchingWith: WatchingWith;
  energy: EnergyLevel;
}

export interface RecommendationSignals {
  decade: string | null;
  decadeSampleSize: number;
  decadeDifference: number;
  decadeConfidence: number;
  similarRatedMovie: {
    title: string;
    year: number | null;
    rating: number;
  } | null;
  yearSimilarity: number;
  watchlistAge: number;
  habitDistance: number;
}

export interface MovieRecommendation {
  movie: WatchlistMovie;
  mode: RecommendationMode;
  matchScore: number;
  reasons: string[];
  signals: RecommendationSignals;
  limitedMetadata: boolean;
}
