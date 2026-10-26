import type { GameOutcome } from "./types";
import { multiplierOf } from "./money";

export function toLookupCsv(books: readonly GameOutcome[]): string {
  const lines = ["simulation_id,weight,payout_multiplier"];
  for (const book of books) {
    lines.push(`${book.id},${book.weight},${multiplierOf(book.payoutMilli).toFixed(2)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function toBookJson(book: GameOutcome): string {
  return JSON.stringify(
    {
      id: book.id,
      mode: book.mode,
      payoutMultiplier: multiplierOf(book.payoutMilli),
      events: book.events,
    },
    null,
    2,
  );
}
