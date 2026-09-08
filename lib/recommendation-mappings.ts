import type {
  EnergyLevel,
  MovieMetadata,
  RecommendationMood,
  RuntimeLimit,
  WatchingWith,
} from '@/lib/types';

interface MoodDefinition {
  genres: string[];
  terms: string[];
  antiGenres?: string[];
  antiTerms?: string[];
}

export interface ContextSignal {
  score: number;
  matches: string[];
  available: boolean;
}

export const MOOD_MAPPINGS: Record<RecommendationMood, MoodDefinition> = {
  intense: {
    genres: ['thriller', 'crime', 'horror', 'war', 'action'],
    terms: [
      'suspense',
      'psychological',
      'survival',
      'serial killer',
      'hostage',
      'revenge',
      'conspiracy',
      'obsession',
      'tension',
    ],
  },
  fun: {
    genres: ['comedy', 'adventure', 'action', 'music'],
    terms: [
      'buddy',
      'heist',
      'road trip',
      'feel-good',
      'party',
      'musical',
      'caper',
      'satire',
    ],
    antiGenres: ['war'],
    antiTerms: ['torture', 'terminal illness', 'suicide', 'holocaust'],
  },
  comforting: {
    genres: ['family', 'comedy', 'romance', 'animation'],
    terms: [
      'feel-good',
      'friendship',
      'coming of age',
      'found family',
      'holiday',
      'slice of life',
      'food',
      'small town',
    ],
    antiGenres: ['horror', 'war'],
    antiTerms: ['serial killer', 'torture', 'bleak', 'abuse', 'apocalypse'],
  },
  emotional: {
    genres: ['drama', 'romance', 'family'],
    terms: [
      'grief',
      'family',
      'love',
      'loss',
      'parenthood',
      'reunion',
      'friendship',
      'coming of age',
    ],
  },
  weird: {
    genres: ['fantasy', 'science fiction', 'mystery'],
    terms: [
      'surrealism',
      'absurdism',
      'dream',
      'experimental',
      'alternate reality',
      'hallucination',
      'metafiction',
    ],
  },
  'visually-beautiful': {
    genres: [],
    terms: [
      'cinematography',
      'visually stunning',
      'visual poetry',
      'painterly',
      'landscape',
      'natural beauty',
      'art',
      'fashion',
    ],
  },
  suspenseful: {
    genres: ['thriller', 'mystery', 'crime', 'horror'],
    terms: [
      'suspense',
      'investigation',
      'serial killer',
      'murder mystery',
      'conspiracy',
      'cat and mouse',
      'missing person',
    ],
  },
  'thought-provoking': {
    genres: ['science fiction', 'drama', 'mystery', 'documentary'],
    terms: [
      'philosophy',
      'identity',
      'society',
      'ethics',
      'psychological',
      'existential',
      'politics',
      'morality',
      'human nature',
    ],
  },
};

const ENERGY_MAPPINGS = {
  easy: {
    genres: ['comedy', 'adventure', 'family', 'animation', 'music'],
    demandingTerms: [
      'nonlinear',
      'slow burn',
      'philosophy',
      'existential',
      'psychological',
      'experimental',
    ],
  },
  'full-attention': {
    genres: ['mystery', 'thriller', 'drama', 'science fiction', 'documentary'],
    terms: [
      'nonlinear',
      'slow burn',
      'philosophy',
      'existential',
      'psychological',
      'investigation',
      'politics',
    ],
  },
} as const;

const COMPANY_MAPPINGS = {
  friends: ['comedy', 'horror', 'action', 'adventure'],
  date: ['romance', 'comedy'],
} as const;

const COMPANY_TERMS = {
  friends: ['buddy', 'party', 'heist', 'competition', 'road trip'],
  date: ['love', 'relationship', 'romance', 'wedding', 'cinematography'],
} as const;

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function metadataText(metadata: MovieMetadata) {
  return `${metadata.keywords.join(' ')} ${metadata.overview}`.toLowerCase();
}

function genreMatches(metadata: MovieMetadata, genres: readonly string[]) {
  const actual = new Set(metadata.genres.map((genre) => genre.toLowerCase()));
  return genres.filter((genre) => actual.has(genre));
}

function termMatches(metadata: MovieMetadata, terms: readonly string[]) {
  const text = metadataText(metadata);
  return terms.filter((term) => text.includes(term));
}

function usable(metadata: MovieMetadata | null) {
  return metadata?.status === 'matched' ? metadata : null;
}

export function scoreMood(
  metadataValue: MovieMetadata | null,
  mood: RecommendationMood,
): ContextSignal {
  const metadata = usable(metadataValue);
  if (!metadata) return { score: 0.25, matches: [], available: false };
  const definition = MOOD_MAPPINGS[mood];
  const matchedGenres = genreMatches(metadata, definition.genres);
  const matchedTerms = termMatches(metadata, definition.terms);
  const antiGenres = genreMatches(metadata, definition.antiGenres ?? []);
  const antiTerms = termMatches(metadata, definition.antiTerms ?? []);
  const hasExplicitSignal = matchedGenres.length + matchedTerms.length > 0;
  const score = clamp(
    0.32 +
      Math.min(0.4, matchedGenres.length * 0.24) +
      Math.min(0.34, matchedTerms.length * 0.18) -
      Math.min(0.42, antiGenres.length * 0.2 + antiTerms.length * 0.16),
  );
  return {
    score,
    matches: [...matchedGenres, ...matchedTerms].slice(0, 3),
    available:
      mood === 'visually-beautiful'
        ? hasExplicitSignal
        : metadata.genres.length > 0,
  };
}

export function scoreEnergy(
  metadataValue: MovieMetadata | null,
  energy: EnergyLevel,
): ContextSignal {
  if (energy === 'normal')
    return { score: 0.5, matches: ['normal'], available: true };
  const metadata = usable(metadataValue);
  if (!metadata) return { score: 0.3, matches: [], available: false };

  if (energy === 'easy') {
    const matchedGenres = genreMatches(metadata, ENERGY_MAPPINGS.easy.genres);
    const demanding = termMatches(
      metadata,
      ENERGY_MAPPINGS.easy.demandingTerms,
    );
    const runtimeBoost =
      metadata.runtimeMinutes === null
        ? 0
        : metadata.runtimeMinutes <= 100
          ? 0.25
          : metadata.runtimeMinutes <= 120
            ? 0.12
            : metadata.runtimeMinutes >= 150
              ? -0.16
              : 0;
    return {
      score: clamp(
        0.36 +
          Math.min(0.38, matchedGenres.length * 0.22) +
          runtimeBoost -
          Math.min(0.4, demanding.length * 0.18),
      ),
      matches: [
        ...matchedGenres,
        ...(runtimeBoost > 0 ? ['shorter runtime'] : []),
      ].slice(0, 3),
      available: metadata.genres.length > 0 || metadata.runtimeMinutes !== null,
    };
  }

  const matchedGenres = genreMatches(
    metadata,
    ENERGY_MAPPINGS['full-attention'].genres,
  );
  const matchedTerms = termMatches(
    metadata,
    ENERGY_MAPPINGS['full-attention'].terms,
  );
  return {
    score: clamp(
      0.36 +
        Math.min(0.34, matchedGenres.length * 0.17) +
        Math.min(0.38, matchedTerms.length * 0.19) +
        (metadata.runtimeMinutes !== null && metadata.runtimeMinutes >= 135
          ? 0.06
          : 0),
    ),
    matches: [...matchedGenres, ...matchedTerms].slice(0, 3),
    available: metadata.genres.length > 0,
  };
}

export function scoreCompany(
  metadataValue: MovieMetadata | null,
  company: WatchingWith,
): ContextSignal {
  if (company === 'alone') {
    return { score: 0.5, matches: ['neutral'], available: true };
  }
  const metadata = usable(metadataValue);
  if (!metadata) return { score: 0.35, matches: [], available: false };
  const matchedGenres = genreMatches(metadata, COMPANY_MAPPINGS[company]);
  const matchedTerms = termMatches(metadata, COMPANY_TERMS[company]);
  return {
    score: clamp(
      0.36 +
        Math.min(0.44, matchedGenres.length * 0.24) +
        Math.min(0.28, matchedTerms.length * 0.14),
    ),
    matches: [...matchedGenres, ...matchedTerms].slice(0, 3),
    available: metadata.genres.length > 0,
  };
}

export function scoreRuntime(
  metadataValue: MovieMetadata | null,
  limit: RuntimeLimit,
): ContextSignal {
  if (limit === null)
    return { score: 0.5, matches: ['no limit'], available: true };
  const metadata = usable(metadataValue);
  if (!metadata || metadata.runtimeMinutes === null) {
    return { score: 0, matches: [], available: false };
  }
  if (metadata.runtimeMinutes > limit) {
    return { score: 0, matches: [], available: true };
  }
  return {
    score: clamp(0.82 + ((limit - metadata.runtimeMinutes) / limit) * 0.18),
    matches: [`${metadata.runtimeMinutes} min`],
    available: true,
  };
}
