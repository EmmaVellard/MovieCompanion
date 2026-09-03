'use client';

import {
  BarChart3,
  Clock3,
  Globe2,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { TasteProfile, TasteStat } from '@/lib/types';

export function TasteView({
  profile,
  loading,
  onImport,
}: {
  profile: TasteProfile;
  loading: boolean;
  onImport: () => void;
}) {
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

  const strongestKeys = new Set(
    profile.strongestDecades.map((stat) => stat.key),
  );
  const distinctWeakest = profile.weakestDecades.filter(
    (stat) => !strongestKeys.has(stat.key),
  );

  return (
    <section className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Taste profile · v1
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
            The shape of your taste
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Transparent patterns from your ratings. Small samples are pulled
            toward your overall average instead of being treated as strong
            preferences.
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

      <div className="mt-8 grid gap-4 sm:grid-cols-[0.78fr_1.22fr]">
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">
                Strongest eras
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                Decades you rate well
              </h2>
            </div>
            <BarChart3 className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-6 space-y-5">
            {profile.strongestDecades.map((stat) => (
              <TasteRow key={stat.key} stat={stat} />
            ))}
          </div>
          {profile.strongestDecades.length === 0 && (
            <p className="mt-6 text-sm leading-6 text-muted-foreground">
              No decade has three rated films yet, so the app is withholding a
              preference claim.
            </p>
          )}
        </article>
      </div>

      {distinctWeakest.length > 0 && (
        <article className="mt-4 rounded-[2rem] border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            Lower-rated eras
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {distinctWeakest.map((stat) => (
              <TasteRow key={stat.key} stat={stat} compact />
            ))}
          </div>
        </article>
      )}

      <article className="mt-4 rounded-[2rem] border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">
          Next layer
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
          Signals waiting on movie metadata
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Movie Companion will not guess these from titles. TMDB enrichment is
          needed before they can influence recommendations or appear as taste
          claims.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <PendingSignal
            icon={Sparkles}
            title="Genres"
            detail="Highest and lowest-rated genres"
          />
          <PendingSignal
            icon={UserRound}
            title="Directors"
            detail="Shown only with enough films"
          />
          <PendingSignal
            icon={Globe2}
            title="Countries & languages"
            detail="Real regional patterns"
          />
          <PendingSignal
            icon={Clock3}
            title="Runtime"
            detail="Preference and tonight limits"
          />
          <PendingSignal
            icon={Sparkles}
            title="Keywords"
            detail="Mood and theme matching"
          />
          <PendingSignal
            icon={Sparkles}
            title="Posters"
            detail="Film imagery in every result"
          />
        </div>
      </article>
    </section>
  );
}

function TasteRow({
  stat,
  compact = false,
}: {
  stat: TasteStat;
  compact?: boolean;
}) {
  const difference = stat.differenceFromOverall;
  const width = Math.max(14, Math.min(100, (stat.regularizedRating / 5) * 100));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{stat.label}</p>
        <p className="text-sm font-semibold text-primary">
          {stat.averageRating.toFixed(2)}
        </p>
      </div>
      {!compact && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--gradient-accent-start),var(--gradient-accent-end))]"
            style={{ width: `${width}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {difference >= 0 ? '+' : ''}
        {difference.toFixed(1)} vs your average · {stat.sampleSize} rated
      </p>
    </div>
  );
}

function PendingSignal({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Sparkles;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4">
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}
