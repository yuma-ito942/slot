import { assemble } from "./assemble";
import { ROUND_SPECS } from "./catalog";
import { findRouteAttempts } from "./path";
import { allocateShares, auditBooks } from "./stats";
import type { GameOutcome, RoundSpec } from "./types";
import { assertValid } from "./validate";

export const TARGET_RTP = 0.963;

function built(spec: RoundSpec, weight: number): GameOutcome {
  const route = findRouteAttempts(spec.steps, spec.id);
  return assemble(spec, route, weight);
}

function solveLossWeight(paying: readonly GameOutcome[], targetRtp: number): number {
  const weight = paying.reduce((sum, book) => sum + book.weight, 0);
  const weightedMilli = paying.reduce((sum, book) => sum + book.weight * book.payoutMilli, 0);
  const exact = weightedMilli / (targetRtp * 1000) - weight;
  let best = Math.max(1, Math.round(exact));
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let candidate = best - 3; candidate <= best + 3; candidate += 1) {
    if (candidate <= 0) continue;
    const rtp = weightedMilli / ((weight + candidate) * 1000);
    const distance = Math.abs(rtp - targetRtp);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function buildLibrary(targetRtp = TARGET_RTP): GameOutcome[] {
  const payingSpecs = ROUND_SPECS.filter((spec) => spec.weight !== undefined);
  const lossSpecs = ROUND_SPECS.filter((spec) => spec.share !== undefined);
  const paying = payingSpecs.map((spec) => built(spec, spec.weight ?? 0));
  const lossWeight = solveLossWeight(paying, targetRtp);
  const shares = allocateShares(
    lossWeight,
    lossSpecs.map((spec) => spec.share ?? 0),
  );
  const losses = lossSpecs.map((spec, index) => built(spec, shares[index] ?? 0));
  const books = [...losses, ...paying].sort((a, b) => a.id - b.id);
  const ids = new Set<number>();
  for (const book of books) {
    if (ids.has(book.id)) throw new Error(`Duplicate round id ${book.id}`);
    ids.add(book.id);
    assertValid(book);
  }
  return books;
}

let cached: GameOutcome[] | null = null;

export function getLibrary(): GameOutcome[] {
  cached ??= buildLibrary();
  return cached;
}

export function getAudit() {
  return auditBooks(getLibrary());
}

export function bookById(id: number): GameOutcome | undefined {
  return getLibrary().find((book) => book.id === id);
}

export function pickWeighted(books: readonly GameOutcome[], roll: number): GameOutcome {
  const total = books.reduce((sum, book) => sum + book.weight, 0);
  if (!Number.isInteger(roll) || roll < 0 || roll >= total) throw new Error("Weight roll is out of range");
  let cursor = 0;
  for (const book of books) {
    cursor += book.weight;
    if (roll < cursor) return book;
  }
  throw new Error("Weight roll missed every book");
}
