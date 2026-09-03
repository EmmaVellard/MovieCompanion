'use client';

import { useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  runOfflineEvaluation,
  type OfflineEvaluationResult,
} from '@/lib/evaluation';
import type {
  MovieLibrary,
  TasteDimension,
  TastePattern,
  TasteProfile,
  TasteStat,
} from '@/lib/types';

const dimensionLabels: Record<TasteDimension, string> = {
  genre: 'Genre',
  'genre-combination': 'Genre blend',
  director: 'Director',
  country: 'Country',
  language: 'Language',
  keyword: 'Theme',
  runtime: 'Runtime',
  cast: 'Cast',
  decade: 'Era',
  interaction: 'Unexpected combination',
};

export function TasteView({
  profile,
  library,
  loading,
  onImport,
}: {
  profile: TasteProfile;
  library: MovieLibrary;
  loading: boolean;
  onImport: () => void;
}) {
  const [evaluation, setEvaluation] = useState<OfflineEvaluationResult | null>(
    null,
  );
  const [evaluating, setEvaluating] = useState(false);

  if (loading) {
    return (
      <div className="mx-auto h-[560px] max-w-4xl animate-pulse rounded-[2rem] bg-card" />
    );
  }

  if (profile.overallAverage === null) {
    return (
      <section className="mx-auto max-w-xl pt-8 text-center sm:pt-16">
        <span className="mx-auto grid size-13 place-items-center rounded-2xl bg-primary-muted text-primary">
          <BarChart3 className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">
          Your taste starts with ratings
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Import ratings.csv so Movie Companion can learn from what you actually
          liked—not just what you watched.
        </p>
        <Button className="mt-6 h-12 rounded-xl px-5" onClick={onImport}>
          <Upload aria-hidden="true" />
          Import ratings.csv
        </Button>
      </section>
    );
  }

  const coverage = profile.metadataCoverage;
  const coveragePercent =
    coverage.totalRatedMovies === 0
      ? 0
      : Math.round(
          (coverage.matchedRatedMovies / coverage.totalRatedMovies) * 100,
        );

  function evaluate() {
    setEvaluating(true);
    window.setTimeout(() => {
      const result = runOfflineEvaluation(library);
      setEvaluation(result);
      setEvaluating(false);
      if (process.env.NODE_ENV !== 'production') {
        console.table(result.metrics);
      }
    }, 20);
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Taste profile · v2
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
            Your movie DNA
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Patterns supported by your ratings and confirmed movie metadata.
            Small samples are pulled toward your average before they can shape a
            recommendation.
          </p>
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={onImport}
        >
          <Upload aria-hidden="true" />
          Update ratings
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
        <article className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-primary-muted/38 p-6">
          <div className="absolute -right-16 -top-16 size-44 rounded-full bg-primary/18 blur-3xl" />
          <Sparkles
            className="relative size-5 text-primary"
            aria-hidden="true"
          />
          <p className="relative mt-12 text-6xl font-semibold tracking-[-0.07em]">
            {profile.overallAverage.toFixed(2)}
          </p>
          <p className="relative mt-1 text-sm text-muted-foreground">
            Average rating
          </p>
          <p className="relative mt-6 text-xs leading-5 text-muted-foreground">
            Based on {profile.ratedMovieCount.toLocaleString()} rated{' '}
            {profile.ratedMovieCount === 1 ? 'film' : 'films'}.
          </p>
        </article>

        <article className="rounded-[2rem] border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">
                Data confidence
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                {coveragePercent}% metadata coverage
              </h2>
            </div>
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--gradient-accent-start),var(--gradient-accent-end))]"
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {coverage.matchedRatedMovies.toLocaleString()} of{' '}
            {coverage.totalRatedMovies.toLocaleString()} rated films have a
            confirmed TMDB match. Missing fields stay neutral; they are never
            guessed from the title.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {[
              ['Genres', coverage.genres],
              ['Directors', coverage.directors],
              ['Countries', coverage.countries],
              ['Languages', coverage.languages],
              ['Themes', coverage.keywords],
              ['Runtime', coverage.runtime],
              ['Cast', coverage.cast],
            ].map(([label, available]) => (
              <span
                key={String(label)}
                className="rounded-full border border-border bg-background/45 px-2.5 py-1"
              >
                {available ? '✓' : '○'} {label}
              </span>
            ))}
          </div>
        </article>
      </div>

      <PatternSection
        eyebrow="Strongest signals"
        title="What consistently works for you"
        patterns={profile.strongestPatterns}
        empty="No pattern has enough repeated evidence yet. More rated films with confirmed metadata will make this section useful."
      />

      <PatternSection
        eyebrow="Unexpected signals"
        title="The combinations, not the stereotypes"
        patterns={profile.unexpectedPatterns}
        empty="No interaction is both strong and distinct from its broader categories yet. The app is withholding weak claims."
      />

      <PatternSection
        eyebrow="Lower-rated patterns"
        title="Less reliable fits in your history"
        patterns={profile.weakestPatterns}
        empty="There is not enough repeated evidence for a lower-rated pattern yet."
      />

      <details className="mt-4 rounded-[2rem] border border-border bg-card p-6">
        <summary className="cursor-pointer list-none text-sm font-semibold">
          Explore taste dimensions
          <span className="ml-2 font-normal text-muted-foreground">
            Genres, filmmakers, places, themes, and runtime
          </span>
        </summary>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <DimensionList
            title="Genres"
            stats={topSupported(profile.genres, 3)}
          />
          <DimensionList
            title="Directors"
            stats={topSupported(profile.directors, 2)}
          />
          <DimensionList
            title="Countries & languages"
            stats={topSupported(
              [...profile.countries, ...profile.languages],
              3,
            )}
          />
          <DimensionList
            title="Themes"
            stats={topSupported(profile.keywords, 3)}
          />
          <DimensionList
            title="Runtime"
            stats={topSupported(profile.runtimeBands, 5)}
          />
          <DimensionList
            title="Genre blends"
            stats={topSupported(profile.genreCombinations, 3)}
          />
        </div>
      </details>

      <article className="mt-4 rounded-[2rem] border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">
              How confidence works
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
              Evidence before certainty
            </h2>
          </div>
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          A feature average is blended with your overall average using a
          dimension-specific prior. Genres need at least three ratings to be
          displayed, directors need two, runtime bands need five, and cast needs
          four. Themes and interactions use stronger shrinkage because they are
          numerous and easier to overread.
        </p>
      </article>

      {process.env.NODE_ENV !== 'production' && (
        <EvaluationPanel
          result={evaluation}
          evaluating={evaluating}
          onRun={evaluate}
          canRun={profile.ratedMovieCount >= 3}
        />
      )}
    </section>
  );
}

function PatternSection({
  eyebrow,
  title,
  patterns,
  empty,
}: {
  eyebrow: string;
  title: string;
  patterns: TastePattern[];
  empty: string;
}) {
  return (
    <article className="mt-4 rounded-[2rem] border border-border bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
        {title}
      </h2>
      {patterns.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {patterns.map(({ stat }) => (
            <PatternCard key={`${stat.dimension}:${stat.key}`} stat={stat} />
          ))}
        </div>
      ) : (
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          {empty}
        </p>
      )}
    </article>
  );
}

function PatternCard({ stat }: { stat: TasteStat }) {
  const difference = stat.regularizedDifference;
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {dimensionLabels[stat.dimension]}
      </p>
      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="font-medium capitalize">{stat.label}</p>
        <p className="shrink-0 text-sm font-semibold text-primary">
          {difference >= 0 ? '+' : ''}
          {difference.toFixed(1)}
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Regularized vs your average · {stat.sampleSize} rated ·{' '}
        {Math.round(stat.confidence * 100)}% confidence
      </p>
    </div>
  );
}

function topSupported(stats: TasteStat[], minimumSamples: number) {
  return [...stats]
    .filter((stat) => stat.sampleSize >= minimumSamples)
    .sort(
      (a, b) =>
        b.regularizedDifference * b.confidence -
        a.regularizedDifference * a.confidence,
    )
    .slice(0, 3);
}

function DimensionList({ title, stats }: { title: string; stats: TasteStat[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
        {title}
      </p>
      {stats.length > 0 ? (
        <div className="mt-3 space-y-3">
          {stats.map((stat) => (
            <div
              key={`${stat.dimension}:${stat.key}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="capitalize">{stat.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {stat.regularizedDifference >= 0 ? '+' : ''}
                {stat.regularizedDifference.toFixed(1)} · {stat.sampleSize}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Not enough evidence yet.
        </p>
      )}
    </div>
  );
}

function EvaluationPanel({
  result,
  evaluating,
  onRun,
  canRun,
}: {
  result: OfflineEvaluationResult | null;
  evaluating: boolean;
  onRun: () => void;
  canRun: boolean;
}) {
  return (
    <details className="mt-4 rounded-[2rem] border border-dashed border-border bg-card p-6">
      <summary className="cursor-pointer list-none">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="size-4 text-primary" aria-hidden="true" />
          Development: offline model evaluation
        </span>
      </summary>
      <p className="mt-4 max-w-2xl text-xs leading-5 text-muted-foreground">
        Leave-one-out validation rebuilds the profile without each film before
        predicting it. This can take a moment, runs only on this device, and
        sends no additional data anywhere.
      </p>
      <Button
        variant="outline"
        className="mt-4 h-10 rounded-xl"
        disabled={!canRun || evaluating}
        onClick={onRun}
      >
        {evaluating ? 'Evaluating…' : 'Run local evaluation'}
      </Button>
      {result && (
        <div className="mt-5 overflow-x-auto">
          <p className="mb-3 text-xs text-muted-foreground">
            {result.ratedMovies} rated · {result.matchedMovies} with confirmed
            metadata
          </p>
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">MAE ↓</th>
                <th className="py-2 pr-4 font-medium">Correlation ↑</th>
                <th className="py-2 pr-4 font-medium">Liked over disliked ↑</th>
                <th className="py-2 pr-4 font-medium">Top-quarter liked ↑</th>
                <th className="py-2 font-medium">Pairwise rank ↑</th>
              </tr>
            </thead>
            <tbody>
              {result.metrics.map((metric) => (
                <tr key={metric.variant} className="border-b border-border/70">
                  <td className="py-2.5 pr-4 font-medium">{metric.variant}</td>
                  <td className="py-2.5 pr-4">
                    {metric.meanAbsoluteError?.toFixed(2) ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4">
                    {metric.pearsonCorrelation?.toFixed(2) ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4">
                    {percent(metric.likedVsDislikedAccuracy)}
                  </td>
                  <td className="py-2.5 pr-4">
                    {percent(metric.topQuartilePrecision)}
                  </td>
                  <td className="py-2.5">
                    {percent(metric.pairwiseRankingAccuracy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function percent(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}
