import { PAYOUT_MILLI } from "../core/money";
import { MODE, type Cell, type GameOutcome, type GhostFactor, type RaidEvent, type RaidStatus, type VaultTier } from "../core/types";
import { isLootItem, isVaultTier } from "../core/paytable";
import { assertValid } from "../core/validate";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function milliField(source: Record<string, unknown>, milliKey: string, decimalKey: string): number {
  const milli = source[milliKey];
  if (typeof milli === "number" && Number.isInteger(milli)) return milli;
  const decimal = source[decimalKey];
  if (typeof decimal === "number" && Number.isFinite(decimal)) return Math.round(decimal * PAYOUT_MILLI);
  throw new Error(`Missing ${milliKey}`);
}

function cellField(value: unknown): Cell {
  if (Array.isArray(value) && value.length === 2 && value.every((part) => Number.isInteger(part))) {
    return [value[0], value[1]] as Cell;
  }
  const rowCol = record(value);
  if (rowCol && Number.isInteger(rowCol.row) && Number.isInteger(rowCol.col)) {
    return [rowCol.row as number, rowCol.col as number];
  }
  throw new Error("Visit is missing a coordinate");
}

function ghostField(value: unknown): GhostFactor {
  if (value === 1 || value === 2 || value === 3) return value;
  throw new Error("Ghost factor is missing");
}

function statusField(value: unknown): RaidStatus {
  if (value === "EXTRACTED" || value === "INTERCEPTED" || value === "VAULT SECURED") return value;
  throw new Error("Round status is missing");
}

export function normalizeEvents(state: unknown): RaidEvent[] {
  const wrapped = record(state);
  const list = Array.isArray(state) ? state : wrapped && Array.isArray(wrapped.events) ? wrapped.events : null;
  if (!list) throw new Error("Round state has no event list");
  return list.map((entry) => normalizeEvent(entry));
}

function normalizeEvent(entry: unknown): RaidEvent {
  const source = record(entry);
  if (!source || typeof source.type !== "string") throw new Error("Event is malformed");
  switch (source.type) {
    case "raidStart":
      return {
        type: "raidStart",
        boardSize: 5,
        entry: cellField(source.entry),
        vault: cellField(source.vault),
        ghostFactor: ghostField(source.ghostFactor),
      };
    case "visit": {
      const room = source.room;
      if (
        room !== "entry" &&
        room !== "loot" &&
        room !== "hack" &&
        room !== "side" &&
        room !== "empty" &&
        room !== "alarm" &&
        room !== "vault"
      ) {
        throw new Error("Visit room is unknown");
      }
      return { type: "visit", cell: cellField(source.cell), room };
    }
    case "awardLoot": {
      if (typeof source.item !== "string" || !isLootItem(source.item)) throw new Error("Loot item is unknown");
      return {
        type: "awardLoot",
        item: source.item,
        baseMilli: milliField(source, "baseMilli", "baseMultiplier"),
        creditedMilli: milliField(source, "creditedMilli", "creditedMultiplier"),
      };
    }
    case "hack":
      return { type: "hack", result: "unlocked" };
    case "sidePassage":
      return { type: "sidePassage" };
    case "alarm":
      return { type: "alarm" };
    case "vaultBreach": {
      const tier = source.tier;
      if (typeof tier !== "number" || !isVaultTier(tier)) throw new Error("Vault tier is unknown");
      const vaultTier: VaultTier = tier;
      return {
        type: "vaultBreach",
        tier: vaultTier,
        baseMilli: milliField(source, "baseMilli", "baseMultiplier"),
        creditedMilli: milliField(source, "creditedMilli", "creditedMultiplier"),
      };
    }
    case "setWin":
      return { type: "setWin", milli: milliField(source, "milli", "multiplier") };
    case "finalWin":
      return { type: "finalWin", milli: milliField(source, "milli", "multiplier") };
    case "raidEnd":
      return {
        type: "raidEnd",
        status: statusField(source.status),
        finalMilli: milliField(source, "finalMilli", "finalMultiplier"),
      };
    default:
      throw new Error(`Unsupported event ${source.type}`);
  }
}

export function outcomeFromVerifiedState(id: number, payoutMultiplier: number, state: unknown): GameOutcome {
  if (!Number.isFinite(payoutMultiplier)) throw new Error("Payout multiplier is missing");
  const book: GameOutcome = {
    id: Number.isInteger(id) && id > 0 ? id : 1,
    mode: MODE,
    weight: 1,
    payoutMilli: Math.round(payoutMultiplier * PAYOUT_MILLI),
    family: "remote",
    fixture: null,
    events: normalizeEvents(state),
  };
  assertValid(book);
  return book;
}
