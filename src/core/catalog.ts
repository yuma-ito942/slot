import { FIXTURES } from "./fixtures";
import type { LootItem, RoundSpec, Step, VaultTier } from "./types";

const loot = (item: LootItem): Step => ({ room: "loot", item });
const chip = loot("Data Chip");
const intel = loot("Intel Pack");
const drive = loot("Encrypted Drive");
const proto = loot("Prototype Module");
const quantum = loot("Quantum Artifact");
const black = loot("Black Case");
const hack: Step = { room: "hack" };
const side: Step = { room: "side" };
const empty: Step = { room: "empty" };
const alarm: Step = { room: "alarm" };
const vault = (tier: VaultTier): Step => ({ room: "vault", tier });

const pay = (
  id: number,
  weight: number,
  ghost: 1 | 2 | 3,
  steps: readonly Step[],
  family: string,
  fixture: RoundSpec["fixture"] = null,
): RoundSpec => ({ id, weight, ghost, steps, family, fixture });

const loss = (id: number, share: number, steps: readonly Step[], family: string, fixture: RoundSpec["fixture"] = null): RoundSpec => ({
  id,
  share,
  ghost: 1,
  steps,
  family,
  fixture,
});

/**
 * Paying weights are the candidate v1 distribution.
 * Zero-win weight is solved later so the exact weighted RTP lands on the 96.30% target.
 * Vault steps sit on odd indexes: entry and vault share a grid color.
 */
export const ROUND_SPECS: readonly RoundSpec[] = [
  loss(FIXTURES.loss, 4200, [empty, empty, alarm], "clean-failure", "loss"),
  loss(1010, 2800, [empty, hack, empty, alarm], "hack-failure"),
  loss(1011, 2000, [hack, side, empty, alarm], "circuit-failure"),
  loss(1012, 1559, [empty, empty, empty, empty], "dry-extraction"),

  pay(1101, 300, 1, [chip], "small"),
  pay(1102, 400, 1, [intel], "small"),
  pay(FIXTURES.normal, 250, 1, [chip, intel], "small-recovery", "normal"),
  pay(FIXTURES.intercept, 150, 1, [chip, intel, alarm], "partial-intercept", "intercept"),
  pay(1103, 400, 1, [drive], "small"),
  pay(1107, 300, 1, [intel, intel], "small"),
  pay(1104, 600, 1, [proto], "small"),
  pay(1105, 170, 1, [drive, proto], "medium-low"),
  pay(FIXTURES.circuit, 80, 1, [hack, side, drive, proto], "circuit", "circuit"),
  pay(1106, 70, 1, [quantum], "medium-low"),
  pay(1108, 40, 1, [proto, proto], "medium-low"),
  pay(FIXTURES.ghost, 40, 2, [proto], "ghost", "ghost"),

  pay(1201, 200, 1, [quantum, proto], "medium"),
  pay(1206, 70, 1, [proto, proto, proto], "medium"),
  pay(1207, 80, 3, [proto], "ghost"),
  pay(1202, 200, 1, [quantum, quantum], "medium"),
  pay(1203, 140, 1, [black], "medium"),
  pay(1208, 80, 2, [quantum, drive], "ghost"),
  pay(1204, 80, 1, [black, proto], "medium"),
  pay(1205, 50, 3, [quantum, drive], "ghost"),
  pay(FIXTURES.vault, 100, 1, [empty, hack, empty, vault(10)], "vault", "vault"),

  pay(1301, 50, 3, [black], "high"),
  pay(1302, 40, 2, [empty, vault(10)], "vault-ghost"),
  pay(1303, 36, 1, [empty, empty, empty, vault(25)], "vault"),
  pay(1304, 24, 3, [empty, vault(10)], "vault-ghost"),
  pay(FIXTURES.high, 28, 1, [hack, empty, side, vault(50)], "high", "high"),
  pay(1306, 8, 3, [empty, vault(25)], "vault-ghost"),
  pay(1307, 8, 1, [empty, empty, empty, vault(100)], "vault"),
  pay(1308, 2, 3, [empty, vault(50)], "vault-ghost"),
  pay(1309, 2, 2, [empty, vault(100)], "vault-ghost"),
  pay(1310, 1, 3, [empty, vault(100)], "vault-ghost"),
  pay(
    FIXTURES.max,
    1,
    3,
    [black, black, black, black, black, black, black, vault(100), black],
    "max",
    "max",
  ),
];
