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

export type MovieMetadataStatus =
  | 'matched'
  | 'unmatched'
  | 'ambiguous'
  | 'error';

export interface MovieMetadataCandidate {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number | null;
  confidence: number;
}

export interface MovieMetadata {
  movieKey: string;
  provider: 'tmdb';
  status: MovieMetadataStatus;
  tmdbId: number | null;
  matchedTitle: string | null;
  matchedYear: number | null;
  confidence: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  overview: string;
  originalLanguage: string | null;
  releaseDate: string | null;
  productionCountries: string[];
  keywords: string[];
  director: string | null;
  cast: string[];
  candidates: MovieMetadataCandidate[];
  attemptedAt: string;
  error: string | null;
}

export interface TmdbImageConfiguration {
  id: 'tmdb';
  secureBaseUrl: string;
  posterSize: string;
  backdropSize: string;
  fetchedAt: string;
}

export interface MovieMetadataStatusSummary {
  total: number;
  enriched: number;
  unmatched: number;
  ambiguous: number;
  errors: number;
  missing: number;
}

export interface MetadataMovieInput {
  movieKey: string;
  title: string;
  year: number | null;
  existingStatus?: MovieMetadataStatus | null;
}

export interface WatchedMovie {
  id: string;
  title: string;
  year: number | null;
  letterboxdUri: string | null;
  rating: number | null;
  watchedDate: string | null;
  sources: Array<'ratings' | 'watched'>;
  metadata: MovieMetadata | null;
  posterUrl: string | null;
}

export interface WatchlistMovie {
  id: string;
  title: string;
  year: number | null;
  letterboxdUri: string | null;
  addedDate: string | null;
  metadata: MovieMetadata | null;
  posterUrl: string | null;
}

export interface MovieLibrary {
  watched: WatchedMovie[];
  watchlist: WatchlistMovie[];
  tmdbImageConfiguration: TmdbImageConfiguration | null;
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
  genres: TasteStat[];
  strongestDecades: TasteStat[];
  weakestDecades: TasteStat[];
  averageRatedYear: number | null;
  highRatedMovies: Array<{
    id: string;
    title: string;
    year: number | null;
    rating: number;
    genres: string[];
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
  genreAffinity: number;
  metadataSimilarity: number;
  tasteScore: number;
  tonightScore: number;
  finalScore: number;
  contributions: RecommendationContribution[];
}

export interface RecommendationContribution {
  category: 'taste' | 'mood' | 'runtime' | 'energy' | 'company' | 'priority';
  label: string;
  points: number;
}

export interface MovieRecommendation {
  movie: WatchlistMovie;
  mode: RecommendationMode;
  matchScore: number;
  reasons: string[];
  signals: RecommendationSignals;
  limitedMetadata: boolean;
}

export interface RecommendationDiagnostics {
  watchlistCandidates: number;
  excludedWatched: number;
  excludedByRuntime: number;
  excludedMissingRuntime: number;
  eligibleAfterFilters: number;
  message: string | null;
}

export interface RecommendationResult {
  recommendations: MovieRecommendation[];
  diagnostics: RecommendationDiagnostics;
}

export interface MetadataEnrichmentProgress {
  running: boolean;
  processed: number;
  total: number;
  matched: number;
  unresolved: number;
  errors: number;
  currentTitle: string | null;
  message: string | null;
}
