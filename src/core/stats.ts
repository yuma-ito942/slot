import type { GameOutcome } from "./types";
import { multiplierOf } from "./money";

export interface MathAudit {
  readonly totalWeight: number;
  readonly rtp: number;
  readonly hitRate: number;
  readonly maxMilli: number;
  readonly maxFrequency: number;
  readonly standardDeviation: number;
  readonly bands: readonly { readonly label: string; readonly weight: number }[];
}

export function auditBooks(books: readonly GameOutcome[]): MathAudit {
  const totalWeight = books.reduce((sum, book) => sum + book.weight, 0);
  if (totalWeight <= 0) throw new Error("Book weight is empty");
  const weightedMilli = books.reduce((sum, book) => sum + book.weight * book.payoutMilli, 0);
  const mean = weightedMilli / totalWeight / 1000;
  const variance =
    books.reduce((sum, book) => {
      const delta = multiplierOf(book.payoutMilli) - mean;
      return sum + book.weight * delta * delta;
    }, 0) / totalWeight;
  const maxMilli = books.reduce((max, book) => Math.max(max, book.payoutMilli), 0);
  const maxWeight = books.filter((book) => book.payoutMilli === maxMilli).reduce((sum, book) => sum + book.weight, 0);
  const hitWeight = books.filter((book) => book.payoutMilli > 0).reduce((sum, book) => sum + book.weight, 0);
  const bands = [
    ["No win", (milli: number) => milli === 0],
    ["Under 1×", (milli: number) => milli > 0 && milli < 1000],
    ["1× to 5×", (milli: number) => milli >= 1000 && milli < 5000],
    ["5× to 20×", (milli: number) => milli >= 5000 && milli < 20_000],
    ["20× to 100×", (milli: number) => milli >= 20_000 && milli < 100_000],
    ["100× and above", (milli: number) => milli >= 100_000],
  ] as const;
  return {
    totalWeight,
    rtp: mean,
    hitRate: hitWeight / totalWeight,
    maxMilli,
    maxFrequency: maxWeight / totalWeight,
    standardDeviation: Math.sqrt(variance),
    bands: bands.map(([label, test]) => ({
      label,
      weight: books.filter((book) => test(book.payoutMilli)).reduce((sum, book) => sum + book.weight, 0),
    })),
  };
}

/** Largest-remainder split so the published loss weights sum to exactly `total`. */
export function allocateShares(total: number, shares: readonly number[]): number[] {
  const shareSum = shares.reduce((sum, share) => sum + share, 0);
  if (!Number.isInteger(total) || total < 0 || shareSum <= 0) throw new Error("Cannot allocate weights");
  const raw = shares.map((share) => (total * share) / shareSum);
  const whole = raw.map((value) => Math.floor(value));
  let remaining = total - whole.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const item of order) {
    if (remaining <= 0) break;
    const slot = whole[item.index];
    if (slot === undefined) continue;
    whole[item.index] = slot + 1;
    remaining -= 1;
  }
  return whole;
}
