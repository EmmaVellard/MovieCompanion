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

The next schema revision should add a shared identity layer:

```ts
type MovieIdentity = {
  id: string;
  title: string;
  year: number | null;
  letterboxdUri: string | null;
  tmdbMatch:
    | { status: 'unmatched' }
    | { status: 'ambiguous'; candidateIds: number[] }
    | { status: 'matched'; tmdbId: number; confidence: number; method: string };
};

type WatchedMovie = {
  movieId: string;
  rating: number | null;
  watchedDates: string[];
};

type WatchlistMovie = {
  movieId: string;
  addedDate: string | null;
};

type MovieMetadata = {
  tmdbId: number;
  title: string;
  originalTitle: string;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  genres: Array<{ id: number; name: string }>;
  directorIds: number[];
  castIds: number[];
  productionCountries: string[];
  originalLanguage: string | null;
  keywordIds: number[];
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  popularity: number | null;
  voteAverage: number | null;
  fetchedAt: string;
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

Phase 2 should add one same-origin route that reads `TMDB_READ_ACCESS_TOKEN` from server-only configuration. The browser sends a movie title and year; the route calls TMDB and returns only the required response fields. Ratings, watched dates, and the full taste profile never need to leave the device.

Matching should be explicit:

1. search by normalized title and year;
2. score release-year distance and original/translated title equality;
3. auto-accept only a high-confidence unique result;
4. queue close or conflicting results for a one-time user choice;
5. cache both matches and metadata in IndexedDB with `fetchedAt` timestamps.

Use TMDB's details request with appended credits and keywords to reduce requests. Respect `429` responses with backoff and make enrichment resumable.

## Recommendation v1

The current pre-metadata engine is deterministic and deliberately modest. It excludes watched movies, ranks only the current watchlist, and combines confidence-shrunk decade affinity, release-year proximity to highly rated movies, evidence confidence, watchlist age, and a stable title-derived tie-break. Match values describe relative rank within the eligible watchlist; they are not probabilities.

Context controls are interactive now, but runtime and semantic context cannot be scored honestly until metadata exists. The interface makes this limitation visible rather than inventing genres, moods, or runtimes.

After metadata enrichment, the engine should:

1. exclude every movie outside the current imported watchlist;
2. apply hard constraints such as maximum runtime;
3. compute transparent taste contributions using confidence-shrunk signals;
4. add structured context contributions for mood, energy, and company;
5. add similarity to multiple highly rated films, not one nearest neighbor;
6. cap any single feature family so genre or country cannot dominate;
7. select three strong but sufficiently different results;
8. expose the top two or three real score contributions as the explanation.

Safe, Risky, and Wildcard should use different objectives:

- **Safe** maximizes predicted fit and confidence.
- **Risky** balances predicted fit with uncertainty and under-sampled regions.
- **Wildcard** requires meaningful distance from normal viewing while preserving at least one strong positive taste signal.

## Small milestones

1. **Foundation — complete**: responsive shell, CSV import, validation, IndexedDB, Watchlist view, and PWA basics.
2. **Interactive personal picker — complete**: Tonight controls, deterministic watchlist-only ranking, three explainable results, repeat suppression, sample-aware decade Taste view, and distinct Safe/Risky/Wildcard objectives.
3. **Import hardening**: real export fixtures supplied by the user, ZIP convenience import, local JSON backup/restore, and migration tests.
4. **TMDB matching**: minimal protected route, resumable enrichment, cache, progress, and ambiguous-match review.
5. **Metadata-backed Taste and Tonight**: extend confidence-shrunk statistics and context scoring to genres, countries, languages, directors, runtime bands, moods, and company.
6. **Only then**: embeddings, natural-language parsing, interaction effects, and optional cross-device sync.

## Risks and assumptions

- Letterboxd export schemas may drift. Header aliases, filename-independent rating detection, explicit type correction, and retained import warnings reduce fragility. Real exports are still needed as fixtures.
- Title/year matching is ambiguous for remakes, alternate titles, and festival release years. Never silently accept a weak TMDB match.
- IndexedDB is private and convenient, but origin-scoped and not a backup. A domain change creates a separate local library; browser data can also be cleared or evicted.
- PWA installation requires HTTPS in production. Home-screen installation avoids iOS code signing and seven-day re-signing, but does not provide automatic cross-device data sync.
- Local-first does not mean no data leaves the device forever. TMDB search will receive titles and years in Phase 2; the product should state this plainly.
- Small samples and correlated features can produce misleading taste claims. Use shrinkage, minimum evidence labels, caps by feature family, and leave-one-out evaluation before showing confident language.
