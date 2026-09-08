# Recommendation improvement study

## Executive recommendation

Keep the current deterministic engine. The next meaningful improvement is not
an LLM or a collaborative-filtering service; it is a better three-film slate,
better evaluation, and a small amount of local feedback.

Recommended order:

1. diversify the three results after scoring — **implemented**;
2. store local recommendation outcomes such as “picked” and “not tonight”;
3. replace leave-one-out evaluation with a time-ordered backtest —
   **implemented**;
4. tune the existing feature weights only when the backtest proves an
   improvement — **implemented conservatively**;
5. make Wildcard distance multidimensional — **implemented**;
6. add embeddings later as one interpretable similarity signal.

## What the current engine already does well

- It ranks only unwatched movies from the imported Letterboxd watchlist.
- Runtime is a strict filter when selected.
- Personal taste and tonight context are scored separately.
- Genre, director, country, language, decade, runtime, keywords, cast,
  interactions, and similar highly rated films are visible components.
- Small samples are shrunk toward the overall rating and some sparse features
  have minimum sample thresholds.
- Safe, Risky, and Wildcard use different formulas.
- An offline leave-one-out evaluator already measures rating error,
  correlation, liked-versus-disliked ordering, top-quartile precision, and
  pairwise ranking accuracy.

This is a strong baseline for a single-user, local-first app. Collaborative
filtering is a poor fit right now because it would require other users' data and
would weaken the privacy model.

## Current limitations

### The displayed percentage is not a probability — addressed in the UI

The number is a linear presentation transform of the weighted score. “94” does
not mean a 94% chance that the user will like or choose the movie. The UI now
describes it as a **fit score out of 100**. It should only become a probability
if future outcome data supports calibration.

### The top three can be redundant — addressed

The initial engine ranked movies independently and returned the first three.
The current engine now reranks only within a strict relevance tier, penalizing
strongly supported similarity to selections already in the slate. A
diversity-specific explanation is shown whenever this promotes an alternative.

### Offline rating prediction is not the same as tonight usefulness

A high Letterboxd rating says whether a watched movie was liked. It does not say
whether a recommendation was appealing in a particular mood, whether it was
available, or why it was rejected that night. The app currently has no local
outcome data for that distinction.

### Temporal leakage in leave-one-out evaluation — addressed

Holding out one rating while training on every other rating allows ratings from
the future to inform a prediction about the past. The evaluator now reports a
primary rolling, time-ordered test that trains only on earlier activity dates;
leave-one-out remains a secondary diagnostic. Research on recommender
evaluation identifies temporal leakage as a source of misleading offline
results ([Ji et al., 2020](https://arxiv.org/abs/2010.11060)).

### Correlated signals can be counted more than once — reduced

Genre, genre combination, keyword, similarity, and interaction features
overlap. Genre combinations and interaction patterns now contribute only their
confidence-shrunk lift beyond the broader parent categories. Secondary signals
also have deliberately small weights because the temporal ablation did not show
that they independently improve ranking yet.

### Wildcard distance was too narrow — addressed

Wildcard now measures distance across genre, country, language, decade,
runtime, and themes, while requiring a confidence-backed positive bridge and a
minimum predicted-quality floor. Popularity remains unavailable in the stored
metadata schema.

## Proposed Recommendation Engine v2

### 1. Diversity-aware three-film slate — implemented

Keep the current base scores, then select results greedily:

1. choose the highest-scoring movie;
2. for each remaining slot, subtract a small similarity penalty to movies
   already selected;
3. keep a quality floor so diversity never promotes a weak candidate;
4. explain the distinction, for example “the shorter, lighter alternative.”

This is a small, deterministic reranking layer inspired by maximal marginal
relevance and recommendation-list diversification. Both balance relevance with
novelty rather than treating each result independently
([Goldstein and Carbonell, 1998](https://aclanthology.org/X98-1025/);
[Ziegler et al., 2005](https://doi.org/10.1145/1060745.1060754)).

### 2. Local recommendation feedback

Add a compact IndexedDB event record, versioned with the scoring model:

- recommendations shown;
- context selected;
- movie picked;
- optional “not tonight” dismissal;
- timestamp and the computed signal breakdown.

This is recommendation feedback, not a second movie diary. Letterboxd remains
the source of truth for watched movies and ratings. The first use of these events
should be evaluation, not automatic weight changes.

### 3. Time-ordered evaluation — implemented

Sort rated movies by their available Letterboxd date and repeatedly train only
on earlier ratings. Evaluate later ratings with:

- pairwise ranking accuracy;
- precision among highly rated films;
- mean absolute rating error;
- score calibration;
- slate diversity and novelty;
- feature-ablation comparisons.

No single metric represents the whole recommendation task; classic evaluation
work explicitly distinguishes prediction accuracy from other qualities and the
user task itself
([Herlocker et al., 2004](https://doi.org/10.1145/963770.963772)).

### 4. Conservative personal weight learning

After sufficient enriched ratings are available, fit a small regularized linear
model to predict the user's rating residual from their overall average. Use the
same named, explainable feature groups already visible in the UI. Constraints:

- rolling validation only;
- ridge regularization;
- non-negative or tightly bounded weights where appropriate;
- fall back to hand-set weights when data is sparse;
- adopt learned weights only when they outperform the baseline across several
  metrics, not one split.

This remains interpretable: an explanation can still say exactly which signals
contributed and how much.

### 5. Better Safe, Risky, and Wildcard policies — implemented baseline

- **Safe:** high predicted fit, high evidence confidence, low disagreement
  between strong components.
- **Risky:** positive expected fit with high uncertainty or conflicting
  components, not simply a lower-confidence Safe result.
- **Wildcard:** high multidimensional distance from usual habits, a minimum
  quality floor, and at least one high-confidence bridge to known taste.

The goal is controlled exploration. Contextual-bandit methods formalize this
tradeoff, but the app should not adopt one until it has enough logged outcomes
to learn from; the method depends on sequential feedback
([Li et al., 2010](https://arxiv.org/abs/1003.0146)).

### 6. Taste calibration across the slate

Across repeated sessions, recommendations should reflect more than the user's
single strongest interest. Track whether smaller but established interests are
being crowded out. Calibration research shows why optimizing ranking accuracy
alone can suppress secondary interests and proposes reranking as a remedy
([Steck, 2018](https://doi.org/10.1145/3240323.3240372)).

For Movie Companion, calibration should be a soft long-term target, not a quota
inside every set of three.

### 7. Embeddings only as an additional signal

Later, create an embedding from overview and keywords and compare candidates to
highly rated movies. Keep it as one bounded similarity component beside the
existing metadata components. Explanations must cite the computed bridge and
never let an LLM invent a preference.

## What not to build yet

- No hosted ML pipeline.
- No collaborative filtering or collection of other people's ratings.
- No LLM deciding the ranked list.
- No automatic online learning from a handful of clicks.
- No claim that the match percentage is a calibrated probability.

## Small implementation milestones

1. **Complete:** deterministic diversity reranking with a relevance floor and
   non-redundant-slate tests.
2. Add local, exportable recommendation-event records and a clear-data path.
3. **Complete:** rolling temporal evaluation alongside leave-one-out.
4. **Complete:** conservative baseline-first weights informed by the temporal
   ablation; richer signals remain bounded corrections.
5. **Complete:** multidimensional Wildcard distance with a positive bridge,
   quality floor, and explicit novelty reason.
6. Revisit embeddings only after these changes have measurable results.
