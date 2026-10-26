import type { LootItem, VaultTier } from "./types";

/** Candidate v1 values, in milli-bets. UI copy must stay in lockstep with this table. */
export const LOOT_MILLI: Record<LootItem, number> = {
  "Data Chip": 100,
  "Intel Pack": 250,
  "Encrypted Drive": 500,
  "Prototype Module": 1000,
  "Quantum Artifact": 2000,
  "Black Case": 5000,
};

export const LOOT_ORDER: readonly LootItem[] = [
  "Data Chip",
  "Intel Pack",
  "Encrypted Drive",
  "Prototype Module",
  "Quantum Artifact",
  "Black Case",
];

export const VAULT_TIERS: readonly VaultTier[] = [10, 25, 50, 100];

export function vaultMilli(tier: VaultTier): number {
  return tier * 1000;
}

export const DESIGNED_MAX_MILLI = (8 * LOOT_MILLI["Black Case"] + vaultMilli(100)) * 3;

export function isLootItem(value: string): value is LootItem {
  return Object.prototype.hasOwnProperty.call(LOOT_MILLI, value);
}

export function isVaultTier(value: number): value is VaultTier {
  return value === 10 || value === 25 || value === 50 || value === 100;
}
