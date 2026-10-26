import { grossMicro } from "../core/money";
import type { GameOutcome } from "../core/types";
import type { LaunchParams } from "../launch/params";
import { outcomeFromVerifiedState } from "./parse";
import { WalletRejected, WalletUnknown, type AuthSnapshot, type PlaySnapshot, type WalletClient } from "./types";

interface RoundBody {
  readonly betID?: number;
  readonly amount?: number;
  readonly payout?: number;
  readonly payoutMultiplier?: number;
  readonly active?: boolean;
  readonly state?: unknown;
}

function hostUrl(host: string, path: string): string {
  return `https://${host}${path}`;
}

async function failureMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `Request failed (${response.status})`;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string; code?: string };
    return body.message || body.error || body.code || `Request failed (${response.status})`;
  } catch {
    return text.slice(0, 180);
  }
}

async function postJson(host: string, path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(hostUrl(host, path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new WalletUnknown("The session could not be reached. Retry to recover the round.");
  }
  if (response.ok) return response.json();
  const message = await failureMessage(response);
  if (response.status >= 400 && response.status < 500) throw new WalletRejected(message);
  throw new WalletUnknown(message);
}

function verifiedRound(round: RoundBody, fallbackId: number): GameOutcome {
  if (typeof round.payoutMultiplier !== "number" || round.state === undefined) {
    throw new WalletUnknown("The round did not include a verifiable event sequence.");
  }
  try {
    const outcome = outcomeFromVerifiedState(round.betID ?? fallbackId, round.payoutMultiplier, round.state);
    if (typeof round.amount === "number" && typeof round.payout === "number") {
      const expected = grossMicro(round.amount, outcome.payoutMilli);
      if (expected !== round.payout) {
        throw new Error("Wallet payout does not match the event total");
      }
    }
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Round failed verification";
    throw new WalletUnknown(message);
  }
}

export function createRemoteClient(params: LaunchParams): WalletClient {
  const host = params.rgsUrl;
  const sessionID = params.sessionID;
  if (!host || !sessionID) throw new WalletRejected("Missing rgs_url or sessionID");

  return {
    kind: "remote",
    async authenticate(): Promise<AuthSnapshot> {
      const body = (await postJson(host, "/wallet/authenticate", { sessionID })) as {
        balance?: { amount?: number; currency?: string };
        config?: {
          betLevels?: number[];
          defaultBetLevel?: number;
          jurisdiction?: {
            socialCasino?: boolean;
            displayRTP?: boolean;
            disabledSlamstop?: boolean;
            disabledSpacebar?: boolean;
          };
        };
        round?: RoundBody | null;
      };
      const levels = body.config?.betLevels?.filter((level) => Number.isInteger(level) && level > 0) ?? [];
      if (!body.balance || typeof body.balance.amount !== "number" || levels.length === 0) {
        throw new WalletRejected("Authentication did not return a balance and stake list");
      }
      const jurisdiction = body.config?.jurisdiction;
      let resume: GameOutcome | null = null;
      if (body.round?.active) resume = verifiedRound(body.round, 1);
      return {
        balanceMicro: body.balance.amount,
        currency: body.balance.currency || params.currency,
        betLevelsMicro: levels,
        defaultBetMicro: body.config?.defaultBetLevel ?? levels[0] ?? 0,
        social: Boolean(jurisdiction?.socialCasino),
        displayRtp: jurisdiction?.displayRTP !== false,
        slamAllowed: jurisdiction?.disabledSlamstop !== true,
        spacebarAllowed: jurisdiction?.disabledSpacebar !== true,
        resume,
        resumeStakeMicro: typeof body.round?.amount === "number" ? body.round.amount : null,
      };
    },
    async play(amountMicro: number): Promise<PlaySnapshot> {
      const body = (await postJson(host, "/wallet/play", {
        sessionID,
        amount: amountMicro,
        mode: "BASE",
      })) as { balance?: { amount?: number }; round?: RoundBody };
      if (!body.round || typeof body.balance?.amount !== "number") {
        throw new WalletUnknown("Play did not return a round");
      }
      return {
        outcome: verifiedRound(body.round, 1),
        balanceMicro: body.balance.amount,
        active: body.round.active !== false,
      };
    },
    async endRound() {
      const body = (await postJson(host, "/wallet/end-round", { sessionID })) as {
        balance?: { amount?: number };
      };
      if (typeof body.balance?.amount !== "number") throw new WalletUnknown("End round did not return a balance");
      return { balanceMicro: body.balance.amount };
    },
  };
}

export interface ReplayPackage {
  readonly outcome: GameOutcome;
  readonly costMultiplier: number;
  readonly payoutMultiplier: number;
}

export async function fetchRemoteReplay(params: LaunchParams): Promise<ReplayPackage> {
  if (!params.rgsUrl || !params.game || !params.version || !params.mode || !params.event) {
    throw new Error("Replay is missing game, version, mode, event, or rgs_url");
  }
  const path = `/bet/replay/${encodeURIComponent(params.game)}/${encodeURIComponent(params.version)}/${encodeURIComponent(params.mode)}/${encodeURIComponent(params.event)}`;
  let response: Response;
  try {
    response = await fetch(hostUrl(params.rgsUrl, path), { cache: "no-store" });
  } catch {
    throw new Error("Replay data is unavailable");
  }
  if (!response.ok) throw new Error("Replay data is unavailable");
  const body = (await response.json()) as {
    payoutMultiplier?: number;
    costMultiplier?: number;
    state?: unknown;
  };
  if (typeof body.payoutMultiplier !== "number") throw new Error("Replay did not include a payout");
  const eventId = Number(params.event);
  const outcome = outcomeFromVerifiedState(Number.isInteger(eventId) ? eventId : 1, body.payoutMultiplier, body.state);
  return {
    outcome,
    costMultiplier: typeof body.costMultiplier === "number" ? body.costMultiplier : 1,
    payoutMultiplier: body.payoutMultiplier,
  };
}
