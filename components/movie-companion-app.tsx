'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Database,
  Film,
  MoonStar,
  Sparkles,
} from 'lucide-react';

import { DataView } from '@/components/data-view';
import { ImportDialog } from '@/components/import-dialog';
import { TasteView } from '@/components/taste-view';
import { TonightView } from '@/components/tonight-view';
import { WatchlistView } from '@/components/watchlist-view';
import {
  clearLocalMovieData,
  getLetterboxdDataStatus,
  getLatestImport,
  getMovieMetadataStatus,
  getMovieLibrary,
} from '@/lib/database';
import { buildTasteProfile } from '@/lib/taste-profile';
import {
  enrichMovieMetadata,
  MetadataEnrichmentError,
} from '@/lib/tmdb-client';
import type {
  ImportSummary,
  LetterboxdDataStatus,
  MetadataEnrichmentProgress,
  MovieMetadataStatusSummary,
  MovieLibrary,
} from '@/lib/types';

type View = 'tonight' | 'watchlist' | 'taste' | 'data';

const emptyLibrary: MovieLibrary = {
  watched: [],
  watchlist: [],
  tmdbImageConfiguration: null,
};
const emptyDataStatus: LetterboxdDataStatus = {
  sources: { ratings: null, watched: null, watchlist: null },
  latestImportedAt: null,
};
const emptyMetadataStatus: MovieMetadataStatusSummary = {
  total: 0,
  enriched: 0,
  unmatched: 0,
  ambiguous: 0,
  errors: 0,
  missing: 0,
};

const navigation: Array<{ id: View; label: string; icon: typeof MoonStar }> = [
  { id: 'tonight', label: 'Tonight', icon: MoonStar },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
  { id: 'taste', label: 'Taste', icon: Sparkles },
  { id: 'data', label: 'Data', icon: Database },
];

export function MovieCompanionApp() {
  const [view, setView] = useState<View>('tonight');
  const [library, setLibrary] = useState<MovieLibrary>(emptyLibrary);
  const [latestImport, setLatestImport] = useState<ImportSummary | null>(null);
  const [dataStatus, setDataStatus] =
    useState<LetterboxdDataStatus>(emptyDataStatus);
  const [metadataStatus, setMetadataStatus] =
    useState<MovieMetadataStatusSummary>(emptyMetadataStatus);
  const [enrichmentProgress, setEnrichmentProgress] =
    useState<MetadataEnrichmentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const profile = useMemo(() => buildTasteProfile(library), [library]);

  const refreshLibrary = useCallback(async () => {
    const [nextLibrary, nextImport, nextStatus, nextMetadataStatus] =
      await Promise.all([
        getMovieLibrary(),
        getLatestImport(),
        getLetterboxdDataStatus(),
        getMovieMetadataStatus(),
      ]);
    setLibrary(nextLibrary);
    setLatestImport(nextImport);
    setDataStatus(nextStatus);
    setMetadataStatus(nextMetadataStatus);
    setLoading(false);
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Movie Companion] local state refreshed', {
        watched: nextLibrary.watched.length,
        watchlist: nextLibrary.watchlist.length,
        rated: nextStatus.sources.ratings?.count ?? 0,
        metadata: nextMetadataStatus,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getMovieLibrary(),
      getLatestImport(),
      getLetterboxdDataStatus(),
      getMovieMetadataStatus(),
    ]).then(([nextLibrary, nextImport, nextStatus, nextMetadataStatus]) => {
      if (cancelled) return;
      setLibrary(nextLibrary);
      setLatestImport(nextImport);
      setDataStatus(nextStatus);
      setMetadataStatus(nextMetadataStatus);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImported(summary: ImportSummary) {
    const importedCount = Object.values(summary.recordsByKind).reduce(
      (total, count) => total + (count ?? 0),
      0,
    );
    await refreshLibrary();
    setAnnouncement(
      `${importedCount.toLocaleString()} movies imported and saved on this device.`,
    );
  }

  async function clearData() {
    if (
      !window.confirm(
        'Remove all imported Movie Companion data from this browser? Your Letterboxd account will not be changed.',
      )
    ) {
      return;
    }
    await clearLocalMovieData();
    await refreshLibrary();
    setEnrichmentProgress(null);
    setAnnouncement('Local Movie Companion data removed.');
    setView('tonight');
  }

  async function enrichMetadata(retryUnresolved = false) {
    setEnrichmentProgress({
      running: true,
      processed: 0,
      total: 0,
      matched: metadataStatus.enriched,
      unresolved: metadataStatus.unmatched + metadataStatus.ambiguous,
      errors: metadataStatus.errors,
      currentTitle: null,
      message: null,
    });
    try {
      const finalStatus = await enrichMovieMetadata({
        retryUnresolved,
        onProgress: (progress) => {
          setEnrichmentProgress(progress);
          if (progress.processed > 0 && progress.processed % 10 === 0) {
            void refreshLibrary();
          }
        },
      });
      setMetadataStatus(finalStatus);
      await refreshLibrary();
      setAnnouncement(
        `${finalStatus.enriched.toLocaleString()} of ${finalStatus.total.toLocaleString()} movies now have confirmed TMDB metadata.`,
      );
    } catch (error) {
      const message =
        error instanceof MetadataEnrichmentError
          ? error.message
          : 'Metadata enrichment stopped unexpectedly. You can safely resume it.';
      setEnrichmentProgress({
        running: false,
        processed: 0,
        total: 0,
        matched: metadataStatus.enriched,
        unresolved: metadataStatus.unmatched + metadataStatus.ambiguous,
        errors: metadataStatus.errors,
        currentTitle: null,
        message,
      });
    }
  }

  function changeView(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <button
            type="button"
            className="flex min-h-11 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55"
            onClick={() => changeView('tonight')}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-[linear-gradient(145deg,var(--gradient-accent-start),var(--gradient-accent-end))] text-white shadow-[0_8px_28px_color-mix(in_oklch,var(--primary),transparent_74%)]">
              <Film className="size-4" aria-hidden="true" />
            </span>
            <span className="font-semibold tracking-[-0.02em]">
              Movie Companion
            </span>
          </button>

          <nav
            className="hidden items-center rounded-xl border border-border bg-card/75 p-1 sm:flex"
            aria-label="Primary navigation"
          >
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => changeView(item.id)}
                  className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55 active:scale-[0.98] ${
                    active
                      ? 'bg-primary-muted text-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => changeView('watchlist')}
            className="min-h-10 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55 active:bg-secondary"
          >
            {loading
              ? 'Loading…'
              : `${library.watchlist.length.toLocaleString()} watchlist`}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-8 sm:px-8 sm:pb-16 sm:pt-12 lg:px-10">
        {view === 'tonight' && (
          <TonightView
            library={library}
            profile={profile}
            loading={loading}
            onImport={() => setImportOpen(true)}
          />
        )}
        {view === 'watchlist' && (
          <WatchlistView
            library={library}
            loading={loading}
            onImport={() => setImportOpen(true)}
          />
        )}
        {view === 'taste' && (
          <TasteView
            profile={profile}
            loading={loading}
            onImport={() => setImportOpen(true)}
          />
        )}
        {view === 'data' && (
          <DataView
            library={library}
            latestImport={latestImport}
            dataStatus={dataStatus}
            metadataStatus={metadataStatus}
            enrichmentProgress={enrichmentProgress}
            onImport={() => setImportOpen(true)}
            onEnrich={(retryUnresolved) =>
              void enrichMetadata(retryUnresolved)
            }
            onClear={() => void clearData()}
          />
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
        aria-label="Primary navigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => changeView(item.id)}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55 active:bg-secondary ${
                  active
                    ? 'bg-primary-muted text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
      {announcement && (
        <button
          type="button"
          aria-live="polite"
          onClick={() => setAnnouncement(null)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 z-50 flex w-[min(420px,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-xl border border-primary/25 bg-popover px-4 py-3 text-left text-sm shadow-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55 sm:bottom-6"
        >
          <CheckCircle2
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          {announcement}
        </button>
      )}
    </div>
  );
}
