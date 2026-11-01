/** Provisional colour exploration. Anchors and swatches are design proposals, not measurements. */
import source from "../../data/colour-atlas-31.json";

export type Axis = "temperature" | "value" | "chroma";
export type TrialId = "T1" | "T2" | "T3" | "V1" | "V2" | "C1" | "C2" | "C3";
export type TrialAnswer = "A" | "B" | "both" | "neither" | "unsure";
export type ColourResponse = {
  trialId: TrialId;
  photoId: string;
  revision: number;
  answer: TrialAnswer;
  /** This choice was explicitly made on its displayed drape after the placement fix. */
  confirmedOnDrape?: boolean;
  /** The user's own words, retained verbatim. */
  comment?: string;
  /** Persist the displayed mapping, swatches and image transform with each comparison. */
  presentation?: { left: "A" | "B"; right: "A" | "B"; aHex: string; bHex: string; transform: string };
};
export type UserStatement = { id: string; text: string; kind: "reflection" | "self-report" | "preference" };
export type ColourObservation = { id: string; text: string; source: "photo-ai" | "user"; evidenceIds: string[] };
export type ColourHypothesis = { id: string; text: string; evidenceIds: string[] };
export type Template = (typeof source.types)[number];
export type AxisStatus = "unknown" | "broad" | "conflicting" | "provisional";
export type AxisEvidence = { status: AxisStatus; range: [number, number] | null; trialVotes: TrialVote[] };
export type TrialVote = { trialId: TrialId; status: "positive" | "negative" | "broad" | "conflicting" | "no-direction"; responses: ColourResponse[] };
export type EvidenceSummary = Record<Axis, AxisEvidence>;

export const atlas = source.types;
export const atlasMetadata = { version: source.version, sourceRevision: source.source_revision, status: source.status, sources: source.sources };
export const secondaryQuestions = source.secondary_questions;
export const preferencePrompt = source.preference;
const axisNames = { T: "temperature", V: "value", C: "chroma" } as const;
const families: Record<TrialId, string> = { T1: "red", T2: "green", T3: "yellow", V1: "rose", V2: "blue", C1: "teal", C2: "rose", C3: "blue" };
export const drapeTrials = source.drape_trials.map((trial) => ({
  ...trial,
  id: trial.id as TrialId,
  axis: axisNames[trial.axis as keyof typeof axisNames],
  hueFamily: families[trial.id as TrialId],
  positiveAnswer: trial.polarity[0] as "A" | "B",
}));

/** The original placement algorithm, also used to identify potentially ambiguous legacy answers. */
export function drapeLeft(trialId: string, photoId: string): "A" | "B" {
  const seed = [...(trialId + photoId)].reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 0);
  return seed % 2 === 0 ? "A" : "B";
}
export function needsDrapeConfirmation(response: ColourResponse): boolean {
  return !response.confirmedOnDrape && (response.answer === "A" || response.answer === "B") &&
    (response.presentation?.left ?? drapeLeft(response.trialId, response.photoId)) === "B";
}

/** Latest answer per trial/photo; a re-drape is contextual evidence, not another independent vote. */
export function summariseEvidence(responses: readonly ColourResponse[]): EvidenceSummary {
  const latest = new Map<string, ColourResponse>();
  for (const response of responses) {
    if (!drapeTrials.some((trial) => trial.id === response.trialId)) continue;
    const key = JSON.stringify([response.trialId, response.photoId]);
    const previous = latest.get(key);
    if (!previous || response.revision >= previous.revision) latest.set(key, response);
  }
  const summary = {} as EvidenceSummary;
  for (const axis of ["temperature", "value", "chroma"] as const) {
    const trialVotes: TrialVote[] = drapeTrials.filter((trial) => trial.axis === axis).map((trial) => {
      const answers = [...latest.values()].filter((response) => response.trialId === trial.id && !needsDrapeConfirmation(response));
      const directions = new Set(answers.filter((r) => r.answer === "A" || r.answer === "B").map((r) => r.answer === trial.positiveAnswer ? "positive" : "negative"));
      const status: TrialVote["status"] = answers.some((r) => r.answer === "both") ? "broad" : directions.size > 1 ? "conflicting" : directions.has("positive") ? "positive" : directions.has("negative") ? "negative" : "no-direction";
      return { trialId: trial.id, status, responses: answers };
    });
    const signs = new Set(trialVotes.filter((v) => v.status === "positive" || v.status === "negative").map((v) => v.status));
    const broad = trialVotes.some((v) => v.status === "broad");
    const conflict = trialVotes.some((v) => v.status === "conflicting") || signs.size > 1;
    const directional = trialVotes.filter((v) => v.status === "positive" || v.status === "negative");
    const independentFamilies = new Set(directional.map((v) => families[v.trialId]));
    const status: AxisStatus = conflict ? "conflicting" : broad ? "broad" : directional.length >= 2 && independentFamilies.size >= 2 ? "provisional" : "unknown";
    const range: [number, number] | null = status !== "provisional" ? null : signs.has("positive") ? [0.1, 1] : [-1, -0.1];
    summary[axis] = { status, range, trialVotes };
  }
  return summary;
}

const axes: Axis[] = ["temperature", "value", "chroma"];
export function getCandidates(summary: EvidenceSummary): { candidates: Template[]; broaderExploration: boolean } {
  const candidates = atlas.filter((template) => axes.every((axis, i) => {
    const range = summary[axis].range;
    return range === null || (template.anchor_coords[i] >= range[0] && template.anchor_coords[i] <= range[1]);
  }));
  return { candidates, broaderExploration: candidates.length === 0 };
}

/** Diversity sampling is deterministic and does not rank suitability. */
export function sampleCandidates(candidates: readonly Template[], summary: EvidenceSummary): Template[] {
  const remaining = [...candidates].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const selected: Template[] = [];
  const unresolved = axes.map((axis, i) => summary[axis].range === null ? i : -1).filter((i) => i >= 0);
  const dimensions = unresolved.length ? unresolved : [0, 1, 2];
  while (remaining.length && selected.length < 3) {
    let best = 0;
    if (selected.length) {
      let max = -1;
      remaining.forEach((candidate, index) => {
        const min = Math.min(...selected.map((chosen) => dimensions.reduce((sum, i) => sum + (candidate.anchor_coords[i] - chosen.anchor_coords[i]) ** 2, 0)));
        if (min > max) { max = min; best = index; }
      });
    }
    selected.push(remaining.splice(best, 1)[0]);
  }
  return selected;
}

export type PaletteSwatch = { id: string; role: string; hex: string; name?: string; category: "neutral" | "accent" };
/** Exclusions apply to individual role swatches and never change the template or factors. */
export function personalPalette(template: Template, excludedSwatches: readonly string[]): { swatches: PaletteSwatch[]; missingRoles: string[] } {
  const excluded = new Set(excludedSwatches);
  const neutral = Object.entries(template.neutrals).map(([role, hex]) => ({ id: `neutral:${role}`, role, hex, category: "neutral" as const }));
  const accent = Object.entries(template.accents).map(([role, hex]) => ({ id: `accent:${role}`, role, hex, name: template.accent_names[role as keyof typeof template.accent_names], category: "accent" as const }));
  const all = [...neutral, ...accent];
  return { swatches: all.filter((swatch) => !excluded.has(swatch.id)), missingRoles: all.filter((swatch) => excluded.has(swatch.id)).map((swatch) => swatch.id) };
}

/** A recommendation for discussion, not a measurement, confidence score or diagnosis. */
export type NextColourComparison =
  | { action: 'compare'; trialId: TrialId; axis: Axis; reason: string }
  | { action: 'confirm'; trialId: TrialId; photoId: string; reason: string }
  | { action: 'pause'; reason: string };

/**
 * Suggest one unused comparison from the existing catalogue. Repeated views of
 * one trial never count as independent questions. Caller controls pause and may
 * stop or choose another comparison; no answer is needed to complete a session.
 *
 * Examples: no responses -> T1 (temperature has not been explored); T1 alone
 * -> V1 (cover a new axis); conflicting T1/T2 -> T3 (recheck temperature in a
 * different hue family); exhausted unresolved catalogue -> pause, inconclusive.
 * These are deterministic heuristics, not calibrated colour inference.
 */
export function nextColourComparison(responses: readonly ColourResponse[], paused = false): NextColourComparison {
  if (paused) return { action: 'pause', reason: 'Your consultation is paused; your existing observations remain available.' };
  const known = new Set(drapeTrials.map((trial) => trial.id));
  const latest = new Map<string, ColourResponse>();
  for (const response of responses) {
    if (!known.has(response.trialId)) continue;
    const key = JSON.stringify([response.trialId,response.photoId]);
    const previous = latest.get(key);
    if (!previous || response.revision >= previous.revision) latest.set(key,response);
  }
  // A reversed legacy A/B choice could reflect a positional misunderstanding.
  // Ask for confirmation rather than using or silently changing the answer.
  const ambiguous = [...latest.values()].find(needsDrapeConfirmation);
  if (ambiguous) return { action:'confirm', trialId:ambiguous.trialId, photoId:ambiguous.photoId, reason:'Please confirm which colour you meant in this earlier comparison before it guides the next step.' };
  const summary = summariseEvidence([...latest.values()]);
  const touched = new Set([...latest.values()].map((response) => response.trialId));
  const unresolved = axes.filter((axis) => summary[axis].status !== 'provisional');
  if (!unresolved.length) return { action:'pause', reason:'Each factor has a provisional direction. You can stop here or explore further; these are not measurements or a diagnosis.' };
  const available = unresolved.map((axis,order) => {
    const votes = summary[axis].trialVotes;
    const usedFamilies = new Set(votes.filter((vote) => touched.has(vote.trialId)).map((vote) => families[vote.trialId]));
    const choices = drapeTrials.filter((trial) => trial.axis === axis && !touched.has(trial.id));
    const differentFamily = choices.find((trial) => !usedFamilies.has(trial.hueFamily));
    return {axis,order,votes,trial:differentFamily ?? choices[0], differentFamily:!!differentFamily};
  }).filter((entry) => entry.trial);
  available.sort((a,b) => {
    const priority = (entry: typeof a) => summary[entry.axis].status === 'conflicting' ? 0 : entry.votes.every((vote) => !touched.has(vote.trialId)) ? 1 : 2;
    return priority(a)-priority(b) || a.order-b.order;
  });
  const next = available[0];
  if (!next) return { action:'pause', reason:'The available comparisons have not resolved every factor. Your result can remain inconclusive; no neutral value is assumed.' };
  const state = summary[next.axis].status;
  const reason = state === 'conflicting'
    ? `Earlier ${next.axis} answers differ; another hue family may help explore the disagreement.`
    : next.votes.every((vote) => !touched.has(vote.trialId))
      ? `${next.axis[0].toUpperCase()+next.axis.slice(1)} has not yet been explored; this comparison starts that question.`
      : state === 'broad'
        ? `Both colours worked in an earlier ${next.axis} comparison; another hue family can explore that breadth without assuming neutrality.`
        : `The ${next.axis} evidence is still unresolved; another hue family can offer a separate comparison.`;
  return {action:'compare',trialId:next.trial.id,axis:next.axis,reason};
}
