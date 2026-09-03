'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clock3,
  Compass,
  Dice5,
  Eye,
  RefreshCw,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react';

import { MovieArt } from '@/components/movie-art';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { recommendMovies, surpriseMe } from '@/lib/recommendations';
import { cn } from '@/lib/utils';
import type {
  EnergyLevel,
  MovieLibrary,
  MovieRecommendation,
  RecommendationContext,
  RecommendationMood,
  RuntimeLimit,
  TasteProfile,
  WatchingWith,
} from '@/lib/types';

const moodOptions: Array<{ value: RecommendationMood; label: string }> = [
  { value: 'intense', label: 'Intense' },
  { value: 'fun', label: 'Fun' },
  { value: 'comforting', label: 'Comforting' },
  { value: 'emotional', label: 'Emotional' },
  { value: 'weird', label: 'Weird' },
  { value: 'visually-beautiful', label: 'Visually beautiful' },
  { value: 'suspenseful', label: 'Suspenseful' },
  { value: 'thought-provoking', label: 'Thought-provoking' },
];

const runtimeOptions: Array<{ value: RuntimeLimit; label: string }> = [
  { value: 90, label: '< 90 min' },
  { value: 120, label: '< 2h' },
  { value: 150, label: '< 2h30' },
  { value: null, label: 'No limit' },
];

const companyOptions: Array<{ value: WatchingWith; label: string }> = [
  { value: 'alone', label: 'Alone' },
  { value: 'friends', label: 'Friends' },
  { value: 'date', label: 'Date' },
];

const energyOptions: Array<{ value: EnergyLevel; label: string }> = [
  { value: 'easy', label: 'Easy watch' },
  { value: 'normal', label: 'Normal' },
  { value: 'full-attention', label: 'Full attention' },
];

const surpriseModes = [
  {
    value: 'safe' as const,
    label: 'Safe Pick',
    description: 'Highest confidence in the taste signals we know.',
    icon: Star,
  },
  {
    value: 'risky' as const,
    label: 'Risky Pick',
    description: 'A positive signal with more uncertainty around it.',
    icon: Dice5,
  },
  {
    value: 'wildcard' as const,
    label: 'Wildcard',
    description:
      'Outside your usual era, with one real bridge back to your taste.',
    icon: Compass,
  },
];

const defaultContext: RecommendationContext = {
  moods: [],
  runtimeLimit: null,
  watchingWith: 'alone',
  energy: 'normal',
};

export function TonightView({
  library,
  profile,
  loading,
  onImport,
}: {
  library: MovieLibrary;
  profile: TasteProfile;
  loading: boolean;
  onImport: () => void;
}) {
  const [context, setContext] = useState(defaultContext);
  const [recommendations, setRecommendations] = useState<MovieRecommendation[]>(
    [],
  );
  const [recommendationHistory, setRecommendationHistory] = useState<string[]>(
    [],
  );
  const [recommendationMessage, setRecommendationMessage] = useState<
    string | null
  >(null);
  const [runIndex, setRunIndex] = useState(0);
  const [detail, setDetail] = useState<MovieRecommendation | null>(null);
  const [picked, setPicked] = useState<MovieRecommendation | null>(null);
  const [surprise, setSurprise] = useState<MovieRecommendation | null>(null);
  const [surpriseMessage, setSurpriseMessage] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const watchedIds = useMemo(
    () => new Set(library.watched.map((movie) => movie.id)),
    [library.watched],
  );
  const eligibleCount = library.watchlist.filter(
    (movie) => !watchedIds.has(movie.id),
  ).length;

  function toggleMood(mood: RecommendationMood) {
    setContext((current) => ({
      ...current,
      moods: current.moods.includes(mood)
        ? current.moods.filter((item) => item !== mood)
        : [...current.moods, mood],
    }));
  }

  function revealResults() {
    window.setTimeout(
      () =>
        resultsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      40,
    );
  }

  function findMovies(avoidCurrent = false) {
    const excludedIds = avoidCurrent ? recommendationHistory : [];
    const nextRunIndex = runIndex + 1;
    const result = recommendMovies({
      library,
      profile,
      context,
      excludedIds,
      runIndex: nextRunIndex,
    });
    setRunIndex(nextRunIndex);
    setRecommendations(result.recommendations);
    setRecommendationMessage(result.diagnostics.message);
    setRecommendationHistory((current) => [
      ...current,
      ...result.recommendations.map(
        (recommendation) => recommendation.movie.id,
      ),
    ]);
    setSurprise(null);
    setSurpriseMessage(null);
    revealResults();
  }

  function runSurprise(mode: 'safe' | 'risky' | 'wildcard') {
    const nextRunIndex = runIndex + 1;
    const result = surpriseMe({
      library,
      profile,
      mode,
      excludedIds: recommendationHistory,
      runIndex: nextRunIndex,
    });
    setRunIndex(nextRunIndex);
    setSurprise(result);
    setSurpriseMessage(
      result
        ? null
        : 'The current year-only model could not find a responsible Wildcard. Metadata enrichment will create better bridges.',
    );
    if (result) {
      setRecommendationHistory((current) => [...current, result.movie.id]);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto h-[620px] max-w-5xl animate-pulse rounded-[2rem] bg-card" />
    );
  }

  if (eligibleCount === 0) {
    return (
      <EmptyTonight
        title="No watchlist imported yet"
        description="Import watchlist.csv to get recommendations from movies you already want to see."
        action="Import watchlist.csv"
        onImport={onImport}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <section className="text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-muted/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          Tonight
        </div>
        <h1 className="text-[clamp(2.8rem,8vw,5.6rem)] leading-[0.92] font-semibold tracking-[-0.07em] text-balance">
          What should I watch?
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          A short path from “maybe” to three strong choices from your Letterboxd
          watchlist.
        </p>
      </section>

      <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-border bg-card/90 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.34)] sm:p-7">
        <div className="pointer-events-none absolute inset-x-20 -top-28 h-52 rounded-full bg-primary/16 blur-3xl" />
        <div className="relative space-y-7">
          <FilterGroup label="Mood" icon={Sparkles} hint="Choose any that fit">
            {moodOptions.map((option) => (
              <ChoiceChip
                key={option.value}
                selected={context.moods.includes(option.value)}
                onClick={() => toggleMood(option.value)}
              >
                {option.label}
              </ChoiceChip>
            ))}
          </FilterGroup>

          <div className="grid gap-7 border-t border-border pt-7 md:grid-cols-3">
            <FilterGroup label="Runtime" icon={Clock3}>
              {runtimeOptions.map((option) => (
                <ChoiceChip
                  key={option.label}
                  selected={context.runtimeLimit === option.value}
                  onClick={() =>
                    setContext((current) => ({
                      ...current,
                      runtimeLimit: option.value,
                    }))
                  }
                >
                  {option.label}
                </ChoiceChip>
              ))}
            </FilterGroup>

            <FilterGroup label="Watching with" icon={Users}>
              {companyOptions.map((option) => (
                <ChoiceChip
                  key={option.value}
                  selected={context.watchingWith === option.value}
                  onClick={() =>
                    setContext((current) => ({
                      ...current,
                      watchingWith: option.value,
                    }))
                  }
                >
                  {option.label}
                </ChoiceChip>
              ))}
            </FilterGroup>

            <FilterGroup label="Energy" icon={Zap}>
              {energyOptions.map((option) => (
                <ChoiceChip
                  key={option.value}
                  selected={context.energy === option.value}
                  onClick={() =>
                    setContext((current) => ({
                      ...current,
                      energy: option.value,
                    }))
                  }
                >
                  {option.label}
                </ChoiceChip>
              ))}
            </FilterGroup>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">
              Taste and tonight fit are scored separately. Runtime limits are
              strict; movies with missing runtime are excluded until metadata is
              available.
            </p>
            <Button
              size="lg"
              className="h-13 w-full rounded-2xl px-6 text-base sm:w-auto sm:min-w-52"
              disabled={eligibleCount < 3}
              onClick={() => findMovies(false)}
            >
              <Sparkles aria-hidden="true" />
              Find my movie
            </Button>
          </div>
          {eligibleCount < 3 && (
            <p role="alert" className="text-sm text-destructive">
              At least three unwatched watchlist films are needed to return
              three distinct recommendations.
            </p>
          )}
          {recommendationMessage && (
            <output className="block rounded-xl border border-primary/20 bg-primary-muted/25 p-3 text-sm leading-6 text-muted-foreground">
              {recommendationMessage}
            </output>
          )}
        </div>
      </section>

      {profile.ratedMovieCount === 0 && (
        <button
          type="button"
          onClick={onImport}
          className="mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-muted/35 px-4 py-3 text-left text-sm transition-colors hover:bg-primary-muted/55 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55"
        >
          <span>
            Import ratings.csv so Movie Companion can learn your taste.
          </span>
          <ArrowUpRight
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
        </button>
      )}

      {recommendations.length > 0 && (
        <section
          ref={resultsRef}
          className="scroll-mt-24 pt-14"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Your three
              </p>
              <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
                Strong choices for tonight
              </h2>
            </div>
            <Button
              variant="outline"
              className="h-11 rounded-xl px-4"
              onClick={() => findMovies(true)}
            >
              <RefreshCw aria-hidden="true" />
              Try another three
            </Button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {recommendations.map((recommendation, index) => (
              <RecommendationCard
                key={`${runIndex}-${recommendation.movie.id}`}
                recommendation={recommendation}
                rank={index + 1}
                onDetails={() => setDetail(recommendation)}
                onPick={() => setPicked(recommendation)}
                onTryAgain={() => findMovies(true)}
              />
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Match scores are relative rankings from the current transparent
            model—not predicted probabilities.
          </p>
        </section>
      )}

      <section className="pt-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Feeling indecisive?
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            Surprise me
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Three different strategies—not three labels on the same random
            picker.
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {surpriseModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => runSurprise(mode.value)}
                className="group min-h-32 rounded-2xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary-muted/22 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55 active:translate-y-0"
              >
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="mt-5 block font-semibold">{mode.label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {mode.description}
                </span>
              </button>
            );
          })}
        </div>

        {surprise && (
          <div className="mt-5 max-w-sm" aria-live="polite">
            <RecommendationCard
              recommendation={surprise}
              onDetails={() => setDetail(surprise)}
              onPick={() => setPicked(surprise)}
              onTryAgain={() =>
                runSurprise(surprise.mode as 'safe' | 'risky' | 'wildcard')
              }
            />
          </div>
        )}
        {surpriseMessage && (
          <output className="mt-4 block rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {surpriseMessage}
          </output>
        )}
      </section>

      <RecommendationDialog
        recommendation={detail}
        onClose={() => setDetail(null)}
        onPick={(recommendation) => {
          setDetail(null);
          setPicked(recommendation);
        }}
      />
      <PickedDialog recommendation={picked} onClose={() => setPicked(null)} />
    </div>
  );
}

function EmptyTonight({
  title,
  description,
  action,
  onImport,
}: {
  title: string;
  description: string;
  action: string;
  onImport: () => void;
}) {
  return (
    <section className="mx-auto max-w-xl pt-8 text-center sm:pt-16">
      <span className="mx-auto grid size-13 place-items-center rounded-2xl bg-primary-muted text-primary">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <Button className="mt-6 h-12 rounded-xl px-5" onClick={onImport}>
        {action}
      </Button>
    </section>
  );
}

function FilterGroup({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon: typeof Sparkles;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden="true" />
        {label}
        {hint && (
          <span className="normal-case tracking-normal text-muted-foreground/70">
            · {hint}
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55 active:scale-[0.98]',
        selected
          ? 'border-primary/55 bg-primary-muted text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary),transparent_50%)]'
          : 'border-border bg-background/55 text-muted-foreground hover:border-primary/35 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function RecommendationCard({
  recommendation,
  rank,
  onDetails,
  onPick,
  onTryAgain,
}: {
  recommendation: MovieRecommendation;
  rank?: number;
  onDetails: () => void;
  onPick: () => void;
  onTryAgain: () => void;
}) {
  const modeLabel =
    recommendation.mode === 'safe'
      ? 'Safe Pick'
      : recommendation.mode === 'risky'
        ? 'Risky Pick'
        : recommendation.mode === 'wildcard'
          ? 'Wildcard'
          : rank
            ? `Pick ${rank}`
            : 'Your pick';

  return (
    <article className="group overflow-hidden rounded-[1.6rem] border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_24px_70px_rgba(0,0,0,0.38)]">
      <button
        type="button"
        onClick={onDetails}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/55"
      >
        <MovieArt
          title={recommendation.movie.title}
          posterUrl={recommendation.movie.posterUrl}
        />
      </button>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {modeLabel}
          </p>
          <p className="text-sm font-semibold text-primary">
            {recommendation.matchScore}% match
          </p>
        </div>
        <button
          type="button"
          onClick={onDetails}
          className="mt-3 text-left focus-visible:rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/55"
        >
          <h3 className="text-xl leading-tight font-semibold tracking-[-0.035em]">
            {recommendation.movie.title}
          </h3>
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          {recommendation.movie.year ?? 'Year unknown'}
          {recommendation.movie.metadata?.runtimeMinutes
            ? ` · ${recommendation.movie.metadata.runtimeMinutes} min`
            : ' · Runtime unknown'}
        </p>
        <ul className="mt-5 space-y-2.5">
          {recommendation.reasons.slice(0, 3).map((reason) => (
            <li
              key={reason}
              className="flex gap-2 text-xs leading-5 text-muted-foreground"
            >
              <Check
                className="mt-0.5 size-3.5 shrink-0 text-primary"
                aria-hidden="true"
              />
              {reason}
            </li>
          ))}
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={onDetails}
          >
            <Eye aria-hidden="true" />
            View details
          </Button>
          <Button className="h-11 rounded-xl" onClick={onPick}>
            Pick this
          </Button>
          <Button
            variant="ghost"
            className="col-span-2 h-10 rounded-xl text-muted-foreground"
            onClick={onTryAgain}
          >
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      </div>
    </article>
  );
}

function RecommendationDialog({
  recommendation,
  onClose,
  onPick,
}: {
  recommendation: MovieRecommendation | null;
  onClose: () => void;
  onPick: (recommendation: MovieRecommendation) => void;
}) {
  return (
    <Dialog
      open={Boolean(recommendation)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border border-border bg-popover p-5 sm:max-w-lg sm:p-6">
        {recommendation && (
          <>
            <DialogHeader className="pr-8">
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">
                {recommendation.matchScore}% match
              </p>
              <DialogTitle className="text-2xl leading-tight font-semibold tracking-[-0.04em]">
                {recommendation.movie.title}
              </DialogTitle>
              <DialogDescription>
                {recommendation.movie.year ?? 'Year unknown'} · From your
                current Letterboxd watchlist
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 sm:grid-cols-[140px_1fr]">
              <MovieArt
                title={recommendation.movie.title}
                posterUrl={recommendation.movie.posterUrl}
              />
              <div>
                <p className="text-sm font-medium">Why it surfaced</p>
                <ul className="mt-3 space-y-3">
                  {recommendation.reasons.map((reason) => (
                    <li
                      key={reason}
                      className="flex gap-2 text-sm leading-6 text-muted-foreground"
                    >
                      <Check
                        className="mt-1 size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {reason}
                    </li>
                  ))}
                </ul>
                {recommendation.movie.metadata?.status === 'matched' ? (
                  <p className="mt-4 rounded-xl border border-border bg-background/45 p-3 text-xs leading-5 text-muted-foreground">
                    {[
                      recommendation.movie.metadata.genres
                        .slice(0, 3)
                        .join(', '),
                      recommendation.movie.metadata.runtimeMinutes
                        ? `${recommendation.movie.metadata.runtimeMinutes} min`
                        : null,
                      recommendation.movie.metadata.director
                        ? `Directed by ${recommendation.movie.metadata.director}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'TMDB metadata matched.'}
                  </p>
                ) : (
                  <p className="mt-4 rounded-xl border border-border bg-background/45 p-3 text-xs leading-5 text-muted-foreground">
                    Context matching is limited because this film does not yet
                    have confirmed TMDB metadata.
                  </p>
                )}
                {process.env.NODE_ENV !== 'production' && (
                  <details className="mt-4 rounded-xl border border-border bg-background/45 p-3 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">
                      Development score breakdown
                    </summary>
                    <p className="mt-3">
                      Taste{' '}
                      {Math.round(recommendation.signals.tasteScore * 100)}
                      {' · '}Tonight{' '}
                      {Math.round(recommendation.signals.tonightScore * 100)}
                      {' · '}Final{' '}
                      {Math.round(recommendation.signals.finalScore * 100)}
                    </p>
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {recommendation.signals.tasteComponents.map(
                        (component) => (
                          <li key={component.name}>
                            {component.name}:{' '}
                            {Math.round(component.score * 100)}
                            {' · '}confidence{' '}
                            {Math.round(component.confidence * 100)}
                            {' · '}weight {Math.round(component.weight * 100)}%
                          </li>
                        ),
                      )}
                    </ul>
                    <ul className="mt-2 space-y-1.5">
                      {recommendation.signals.contributions.map(
                        (contribution, index) => (
                          <li key={`${contribution.category}-${index}`}>
                            {contribution.category}: +{contribution.points}{' '}
                            {contribution.label}
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                )}
              </div>
            </div>
            <DialogFooter className="-mx-5 -mb-5 sm:-mx-6 sm:-mb-6">
              {recommendation.movie.letterboxdUri && (
                <a
                  href={recommendation.movie.letterboxdUri}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'h-11 rounded-xl',
                  )}
                >
                  Letterboxd
                  <ArrowUpRight aria-hidden="true" />
                </a>
              )}
              <Button
                className="h-11 rounded-xl"
                onClick={() => onPick(recommendation)}
              >
                Pick this
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickedDialog({
  recommendation,
  onClose,
}: {
  recommendation: MovieRecommendation | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(recommendation)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="overflow-hidden border border-primary/25 bg-popover p-0 sm:max-w-md">
        {recommendation && (
          <>
            <div className="bg-[linear-gradient(145deg,var(--gradient-accent-start),var(--gradient-accent-end))] p-7 text-white">
              <Sparkles className="size-6" aria-hidden="true" />
              <p className="mt-10 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                Tonight&apos;s pick
              </p>
              <DialogTitle className="mt-2 text-3xl leading-tight font-semibold tracking-[-0.055em]">
                {recommendation.movie.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-white/75">
                {recommendation.movie.year ?? 'Year unknown'} ·{' '}
                {recommendation.matchScore}% match
              </DialogDescription>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-muted-foreground">
                Decision made. Movie Companion does not log anything or change
                your Letterboxd account.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {recommendation.movie.letterboxdUri && (
                  <a
                    href={recommendation.movie.letterboxdUri}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants(), 'h-11 rounded-xl px-4')}
                  >
                    Open on Letterboxd
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                )}
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={onClose}
                >
                  Back to picks
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
