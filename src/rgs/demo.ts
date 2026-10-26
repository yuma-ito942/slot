/**
 * LOCAL DEMO ONLY.
 * This wallet exists so the raid can be played without a Stake session.
 * The engine build must not import it. It never replaces a real session.
 */
import { API_MICRO, grossMicro, secureRandomBelow } from "../core/money";
import { bookById, getLibrary, pickWeighted } from "../core/library";
import type { GameOutcome } from "../core/types";
import type { LaunchParams } from "../launch/params";
import type { ReplayPackage } from "./remote";
import { WalletRejected, type AuthSnapshot, type PlaySnapshot, type WalletClient } from "./types";

const STORAGE_KEY = "breach-protocol-demo-v1";
const STARTING_BALANCE = 1_000 * API_MICRO;

export const DEMO_BET_LEVELS: readonly number[] = [
  100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000,
];

interface DemoSave {
  balanceMicro: number;
  pending: { outcomeId: number; amountMicro: number } | null;
}

function readSave(): DemoSave {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { balanceMicro: STARTING_BALANCE, pending: null };
    const parsed = JSON.parse(raw) as DemoSave;
    if (typeof parsed.balanceMicro !== "number" || !Number.isInteger(parsed.balanceMicro)) {
      return { balanceMicro: STARTING_BALANCE, pending: null };
    }
    return {
      balanceMicro: parsed.balanceMicro,
      pending:
        parsed.pending && Number.isInteger(parsed.pending.outcomeId) && Number.isInteger(parsed.pending.amountMicro)
          ? parsed.pending
          : null,
    };
  } catch {
    return { balanceMicro: STARTING_BALANCE, pending: null };
  }
}

function writeSave(save: DemoSave): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* The practice round still plays for this page view. */
  }
}

export function createDemoClient(params: LaunchParams): WalletClient {
  let save = readSave();
  return {
    kind: "demo",
    async authenticate(): Promise<AuthSnapshot> {
      save = readSave();
      let resume: GameOutcome | null = null;
      if (save.pending) {
        resume = bookById(save.pending.outcomeId) ?? null;
        if (!resume) {
          save = { balanceMicro: STARTING_BALANCE, pending: null };
          writeSave(save);
        }
      }
      return {
        balanceMicro: save.balanceMicro,
        currency: params.currency,
        betLevelsMicro: DEMO_BET_LEVELS,
        defaultBetMicro: 1_000_000,
        social: params.social,
        displayRtp: true,
        slamAllowed: true,
        spacebarAllowed: true,
        resume,
        resumeStakeMicro: save.pending?.amountMicro ?? null,
      };
    },
    async play(amountMicro: number): Promise<PlaySnapshot> {
      if (!DEMO_BET_LEVELS.includes(amountMicro)) throw new WalletRejected("That stake is not available");
      if (save.pending) throw new WalletRejected("Finish the current practice round first");
      if (amountMicro > save.balanceMicro) throw new WalletRejected("Insufficient balance for that stake");
      const library = getLibrary();
      const outcome = pickWeighted(library, secureRandomBelow(library.reduce((sum, book) => sum + book.weight, 0)));
      save = {
        balanceMicro: save.balanceMicro - amountMicro,
        pending: outcome.payoutMilli > 0 ? { outcomeId: outcome.id, amountMicro } : null,
      };
      writeSave(save);
      return { outcome, balanceMicro: save.balanceMicro, active: outcome.payoutMilli > 0 };
    },
    async endRound() {
      if (!save.pending) return { balanceMicro: save.balanceMicro };
      const book = bookById(save.pending.outcomeId);
      if (!book) throw new WalletRejected("The practice round is no longer in the book");
      const win = grossMicro(save.pending.amountMicro, book.payoutMilli);
      save = { balanceMicro: save.balanceMicro + win, pending: null };
      writeSave(save);
      return { balanceMicro: save.balanceMicro };
    },
  };
}

export function loadLocalReplay(params: LaunchParams): ReplayPackage {
  const id = Number(params.event);
  const outcome = Number.isInteger(id) ? bookById(id) : undefined;
  if (!outcome) throw new Error("Replay data is unavailable");
  return { outcome, costMultiplier: 1, payoutMultiplier: outcome.payoutMilli / 1000 };
}
