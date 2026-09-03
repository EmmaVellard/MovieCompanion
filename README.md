# Movie Companion

Movie Companion is a private, local-first movie picker that complements Letterboxd. Letterboxd remains the source of truth for watched films, ratings, and the watchlist.

## Current milestone

The current local-first build includes:

- a responsive, mobile-first dark interface;
- import for extracted Letterboxd `ratings.csv`, `watched.csv`, and `watchlist.csv` files;
- tolerant column aliases and a manual data-type choice when a filename is ambiguous;
- row-level validation, deduplication, and import summaries;
- IndexedDB persistence scoped to this browser and site origin;
- searchable and sortable Watchlist, Taste, and Data views;
- a deterministic Tonight picker that ranks only unwatched watchlist films and returns exactly three when at least three are available;
- separate, inspectable taste and tonight-context scores, with strict runtime filtering;
- explainable Safe, Risky, and Wildcard surprise strategies;
- confidence-shrunk, sample-aware decade and genre signals derived from real ratings;
- resumable TMDB enrichment for posters, runtimes, genres, keywords, credits, language, country, and release metadata;
- conservative title-and-year matching with explicit unmatched and ambiguous states;
- a PWA manifest, install icons, standalone display settings, and a small offline app-shell cache.

It intentionally does not include authentication, cloud sync, or AI. Recommendations combine a personal taste score with a separate tonight-context score. Mood, energy, and company use only confirmed TMDB genres, keywords, overview text, and runtime; runtime limits exclude films whose runtime is too long or still unknown.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
cd /Users/emma/Documents/Code/MovieCompanion
npm install
cp .env.example .env.local
npm run dev
```

Before starting the app, create a free TMDB API credential and put the API Read Access Token in `.env.local`:

```bash
TMDB_READ_ACCESS_TOKEN=your_token_here
```

The token is read only by the Next.js server route and is never included in browser JavaScript. If the token changes while the app is running, restart `npm run dev`.

Open [http://localhost:3000](http://localhost:3000) in a browser. Stop the local server with `Control-C`.

For a production check:

```bash
npm run lint
npm run typecheck
npm run build
```

## Import Letterboxd data

1. Request an export from Letterboxd's Data settings.
2. Extract the downloaded ZIP.
3. In Movie Companion, open **Data**, choose **Import files**, and select any combination of the ratings, watched, and watchlist CSV files.
4. Review the detected data type and import.

Reimporting a data type replaces that type's prior local snapshot. Importing a watchlist file does not change anything in Letterboxd.

## Enrich movie metadata

After importing Letterboxd files, open **Data** and choose **Enrich missing metadata**. Each result is written to IndexedDB immediately, so closing the tab or losing the network does not discard completed matches. Run the same action again to resume errors or newly imported films. Low-confidence and duplicate-title matches are kept as **Unmatched** or **Ambiguous** rather than accepting a potentially incorrect poster; use **Retry unresolved matches** after correcting source data or improving matching rules.

The server route sends only the movie title and year to TMDB. Ratings, watched dates, and the rest of each CSV stay in the browser. This product uses the TMDB API but is not endorsed or certified by TMDB.

## Privacy and persistence

CSV contents are parsed in the browser and stored in IndexedDB. Metadata enrichment sends movie titles and years through the app's protected server route to TMDB; it does not send ratings or viewing history. Browser storage is origin-specific: localhost data, a future production deployment, and any second deployment domain each have separate libraries. Clearing site data removes the local library, so a backup/export feature should be added before this becomes the only convenient copy of any derived data.

## GitHub and deployment

This is a standard Next.js 16 repository with no ChatGPT Sites or Cloudflare-specific runtime dependency. It can be pushed to any GitHub repository and imported directly into Vercel.

GitHub Actions runs linting, TypeScript checks, and a production build on every push and pull request.

After creating an empty GitHub repository, connect and push it with:

```bash
git remote add origin https://github.com/YOUR-USERNAME/MovieCompanion.git
git push -u origin main
```

For Vercel, choose **Add New Project**, import the GitHub repository, and keep the detected Next.js defaults. Browser data is origin-specific, so the Vercel deployment will have its own local IndexedDB library and will require one Letterboxd import.

Add `TMDB_READ_ACCESS_TOKEN` to the Vercel project's Environment Variables before deploying. Do not use a `NEXT_PUBLIC_` prefix: the credential must remain server-only.

## Verify changes

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

See [docs/architecture.md](docs/architecture.md) for the proposed MVP boundaries and roadmap.
