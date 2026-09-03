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
- explainable Safe, Risky, and Wildcard surprise strategies;
- confidence-shrunk, sample-aware decade signals derived from real ratings;
- a PWA manifest, install icons, standalone display settings, and a small offline app-shell cache.

It intentionally does not include TMDB enrichment, authentication, cloud sync, or AI yet. Until metadata enrichment is added, mood, runtime, company, genre, and energy controls are saved as tonight's context but do not make unsupported claims or enforce missing metadata. The current ranking uses rating-derived decade affinity, release-year proximity to highly rated movies, evidence confidence, watchlist age, and deterministic tie-breaking.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
cd /Users/emma/Documents/Code/MovieCompanion
npm install
npm run dev
```

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

## Privacy and persistence

CSV contents are parsed in the browser and stored in IndexedDB. Nothing is uploaded by this milestone. Browser storage is origin-specific: localhost data, a future production deployment, and any second deployment domain each have separate libraries. Clearing site data removes the local library, so a backup/export feature should be added before this becomes the only convenient copy of any derived data.

## GitHub and deployment

This is a standard Next.js 16 repository with no ChatGPT Sites or Cloudflare-specific runtime dependency. It can be pushed to any GitHub repository and imported directly into Vercel.

GitHub Actions runs linting, TypeScript checks, and a production build on every push and pull request.

After creating an empty GitHub repository, connect and push it with:

```bash
git remote add origin https://github.com/YOUR-USERNAME/MovieCompanion.git
git push -u origin main
```

For Vercel, choose **Add New Project**, import the GitHub repository, and keep the detected Next.js defaults. Browser data is origin-specific, so the Vercel deployment will have its own local IndexedDB library and will require one Letterboxd import.

See [docs/architecture.md](docs/architecture.md) for the proposed MVP boundaries and roadmap.
