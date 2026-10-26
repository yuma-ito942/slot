/** One grid coordinate. Row then column, both in 0..4. */
export type Cell = readonly [number, number];

export const BOARD_SIZE = 5;
export const ENTRY: Cell = [2, 0];
export const VAULT_CELL: Cell = [2, 2];
export const MAX_ORDINARY_VISITS = 8;
export const MODE = "BASE" as const;

export type GhostFactor = 1 | 2 | 3;
export type VaultTier = 10 | 25 | 50 | 100;

export type LootItem =
  | "Data Chip"
  | "Intel Pack"
  | "Encrypted Drive"
  | "Prototype Module"
  | "Quantum Artifact"
  | "Black Case";

export type RoomKind = "entry" | "loot" | "hack" | "side" | "empty" | "alarm" | "vault";

export type RaidStatus = "EXTRACTED" | "INTERCEPTED" | "VAULT SECURED";

export type FixtureName =
  | "loss"
  | "normal"
  | "high"
  | "max"
  | "vault"
  | "ghost"
  | "circuit"
  | "intercept";

export type Step =
  | { readonly room: "loot"; readonly item: LootItem }
  | { readonly room: "hack" }
  | { readonly room: "side" }
  | { readonly room: "empty" }
  | { readonly room: "alarm" }
  | { readonly room: "vault"; readonly tier: VaultTier };

export type RaidEvent =
  | {
      readonly type: "raidStart";
      readonly boardSize: 5;
      readonly entry: Cell;
      readonly vault: Cell;
      readonly ghostFactor: GhostFactor;
    }
  | { readonly type: "visit"; readonly cell: Cell; readonly room: RoomKind }
  | {
      readonly type: "awardLoot";
      readonly item: LootItem;
      readonly baseMilli: number;
      readonly creditedMilli: number;
    }
  | { readonly type: "hack"; readonly result: "unlocked" }
  | { readonly type: "sidePassage" }
  | { readonly type: "alarm" }
  | {
      readonly type: "vaultBreach";
      readonly tier: VaultTier;
      readonly baseMilli: number;
      readonly creditedMilli: number;
    }
  | { readonly type: "setWin"; readonly milli: number }
  | { readonly type: "finalWin"; readonly milli: number }
  | { readonly type: "raidEnd"; readonly status: RaidStatus; readonly finalMilli: number };

/** Immutable, server-authored round. The client may only play this back. */
export interface GameOutcome {
  readonly id: number;
  readonly mode: typeof MODE;
  readonly weight: number;
  readonly payoutMilli: number;
  readonly family: string;
  readonly fixture: FixtureName | null;
  readonly events: readonly RaidEvent[];
}

export interface RoundSpec {
  readonly id: number;
  readonly ghost: GhostFactor;
  readonly steps: readonly Step[];
  readonly family: string;
  readonly fixture: FixtureName | null;
  /** Selection weight for a paying round. Loss rounds leave this unset. */
  readonly weight?: number;
  /** Relative share of the solved zero-win mass. */
  readonly share?: number;
}
