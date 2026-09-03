# Movie Companion architecture

## Product boundary

Movie Companion answers one question: “What should I watch tonight?” It reads Letterboxd exports, enriches films with external metadata, learns interpretable taste signals, and ranks only films currently in the imported watchlist.

It does not own reviews, social activity, movie logging, ratings, or a second watchlist.

## MVP architecture

Keep the app as one responsive web application with four visible areas:

- **Tonight**: the low-friction recommendation and Surprise Me flow;
- **Watchlist**: a read-only, searchable view of the imported watchlist;
- **Taste**: interpretable, sample-aware signals derived from imported ratings;
- **Data**: imports, privacy boundaries, cache status, and local backup controls.

Watched data remains secondary and appears as a source count in Data rather than becoming a top-level destination.

The MVP needs no account or general-purpose backend. IndexedDB stores imported source snapshots, resolved movie identities, TMDB metadata, and derived caches. A single server route is justified in Phase 2 solely to protect the TMDB credential.

## Data model

The import layer stores source snapshots instead of treating a merged movie row as authoritative:

```ts
type SourceMovieRecord = {
  key: `${'ratings' | 'watched' | 'watchlist'}:${string}`;
  movieKey: string;
  kind: 'ratings' | 'watched' | 'watchlist';
  title: string;
  year: number | null;
  letterboxdUri: string | null;
  rating: number | null;
  date: string | null;
  importedAt: string;
  sourceFileName: string;
};
```

This lets each newly imported file replace only its own Letterboxd snapshot. `WatchedMovie` and `WatchlistMovie` are derived views, which avoids losing a rating when `watched.csv` is imported after `ratings.csv`.

IndexedDB schema version 2 adds a metadata record keyed by the same stable
`movieKey`, so existing imports upgrade in place:

```ts
type MovieMetadata = {
  movieKey: string;
  status: 'matched' | 'unmatched' | 'ambiguous' | 'error';
  tmdbId: number | null;
  confidence: number | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  director: string | null;
  cast: string[];
  productionCountries: string[];
  originalLanguage: string | null;
  keywords: string[];
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  attemptedAt: string;
  provider: 'tmdb';
};
```

`TasteProfile` should be derived and versioned rather than treated as user-authored data:

```ts
type TasteSignal = {
  dimension:
    | 'genre'
    | 'genrePair'
    | 'director'
    | 'actor'
    | 'country'
    | 'language'
    | 'decade'
    | 'runtimeBand'
    | 'keyword'
    | 'popularityBand';
  value: string;
  sampleSize: number;
  rawAverage: number;
  deltaFromOverall: number;
  shrunkDelta: number;
  confidence: number;
};

type TasteProfile = {
  version: number;
  sourceFingerprint: string;
  overallAverage: number;
  ratedMovieCount: number;
  signals: TasteSignal[];
  computedAt: string;
};
```

The shrunk delta is the useful value for recommendation scoring. A category with one five-star film should stay close to the overall mean until more evidence arrives.

## Metadata boundary

The app has one same-origin route that reads `TMDB_READ_ACCESS_TOKEN` from
server-only configuration. The browser sends a movie title and year; the route
calls TMDB and returns only the required response fields. Ratings, watched
dates, and the full taste profile never leave the device.

Matching should be explicit:

1. search by normalized title and year;
2. score release-year distance and original/translated title equality;
3. auto-accept only a high-confidence unique result;
4. store close or conflicting results as ambiguous rather than accepting them;
5. cache both matches and metadata in IndexedDB with `attemptedAt` timestamps.

Use TMDB's details request with appended credits and keywords to reduce requests. Respect `429` responses with backoff and make enrichment resumable.

## Taste and recommendation v2

The current deterministic engine excludes watched movies, ranks only the
current watchlist, and separates personal taste from tonight context. A shared
feature extractor normalizes genres, genre pairs, directors, countries,
languages, filtered keywords, runtime bands, cast, decade, year, and runtime.
Every preference average is regularized toward the user's overall average with
a dimension-specific prior. Display and scoring thresholds prevent isolated
directors, actors, keywords, or combinations from becoming strong signals.

Personal Taste v2 composes modular feature scorers. Correlated features share
bounded weight families: genres/combinations/keywords, director/cast,
country/language, and decade/runtime. Interaction and rich-similarity signals
have deliberately small weights until evaluation shows that they generalize.
Tonight context still uses centralized mappings over confirmed genres,
keywords, overview text, and runtime. A runtime limit is a hard filter; missing
runtime is explicitly excluded. Final scoring weights taste at 56%, context at
41%, and watchlist age at 3%, with variation capped at 0.8 percentage points so
it can only reorder near ties.

The engine:

1. excludes every movie outside the current imported watchlist;
2. applies hard constraints such as maximum runtime;
3. computes transparent taste contributions using confidence-shrunk signals;
4. adds structured context contributions for mood, energy, and company;
5. adds similarity to the best matching highly rated film;
6. caps each feature family so one dimension cannot dominate;
7. selects three strong results and suppresses immediate repeats;
8. exposes concise real contributions as the explanation and a full breakdown
   in development.

Safe, Risky, and Wildcard should use different objectives:

- **Safe** maximizes predicted fit and confidence.
- **Risky** balances predicted fit with uncertainty and under-sampled regions.
- **Wildcard** requires meaningful distance from normal viewing while preserving at least one strong positive taste signal.

## Offline evaluation

The development-only evaluator runs leave-one-out validation entirely in the
browser. For each rated film it rebuilds the profile without that film, predicts
the held-out rating, and reports mean absolute error, Pearson correlation,
liked-versus-disliked ranking accuracy, top-quartile precision, and pairwise
ranking accuracy. A cumulative ablation table compares genres/decades with
directors, origin, keywords, genre combinations, runtime, cast, interactions,
and richer similarity. The evaluator is on demand so it does not slow normal
app startup or recommendations.

## Small milestones

1. **Foundation — complete**: responsive shell, CSV import, validation, IndexedDB, Watchlist view, and PWA basics.
2. **Interactive personal picker — complete**: Tonight controls, deterministic watchlist-only ranking, three explainable results, repeat suppression, sample-aware decade Taste view, and distinct Safe/Risky/Wildcard objectives.
3. **Import hardening**: real export fixtures supplied by the user, ZIP convenience import, local JSON backup/restore, and migration tests.
4. **TMDB matching — complete baseline**: protected route, resumable enrichment, cache, progress, conservative ambiguity handling, and poster rendering.
5. **Metadata-backed Taste and Tonight — in progress**: genre taste, runtime, moods, energy, and company now affect scoring. Country, language, director, and deeper interaction statistics remain later work.
6. **Only then**: embeddings, natural-language parsing, interaction effects, and optional cross-device sync.

## Risks and assumptions

- Letterboxd export schemas may drift. Header aliases, filename-independent rating detection, explicit type correction, and retained import warnings reduce fragility. Real exports are still needed as fixtures.
- Title/year matching is ambiguous for remakes, alternate titles, and festival release years. Never silently accept a weak TMDB match.
- IndexedDB is private and convenient, but origin-scoped and not a backup. A domain change creates a separate local library; browser data can also be cleared or evicted.
- PWA installation requires HTTPS in production. Home-screen installation avoids iOS code signing and seven-day re-signing, but does not provide automatic cross-device data sync.
- Local-first does not mean no data leaves the device. During enrichment, TMDB receives movie titles and years; the product states this plainly.
- Small samples and correlated features can produce misleading taste claims. Use shrinkage, minimum evidence labels, caps by feature family, and leave-one-out evaluation before showing confident language.
