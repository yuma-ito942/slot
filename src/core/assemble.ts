import { LOOT_MILLI, vaultMilli } from "./paytable";
import { ENTRY, MODE, VAULT_CELL, type GameOutcome, type RaidEvent, type RaidStatus, type RoundSpec } from "./types";
import type { Cell } from "./types";

function statusFor(alarm: boolean, vault: boolean): RaidStatus {
  if (alarm) return "INTERCEPTED";
  if (vault) return "VAULT SECURED";
  return "EXTRACTED";
}

export function assemble(spec: RoundSpec, route: readonly Cell[], weight = 0): GameOutcome {
  if (route.length !== spec.steps.length) {
    throw new Error(`Round ${spec.id} route does not match its steps`);
  }
  const events: RaidEvent[] = [
    {
      type: "raidStart",
      boardSize: 5,
      entry: ENTRY,
      vault: VAULT_CELL,
      ghostFactor: spec.ghost,
    },
    { type: "visit", cell: ENTRY, room: "entry" },
  ];
  let sum = 0;
  let alarm = false;
  let vault = false;

  for (let index = 0; index < spec.steps.length; index += 1) {
    const step = spec.steps[index];
    const cell = route[index];
    if (!step || !cell) throw new Error(`Round ${spec.id} is missing step ${index}`);
    events.push({ type: "visit", cell, room: step.room });
    if (step.room === "loot") {
      const baseMilli = LOOT_MILLI[step.item];
      const creditedMilli = baseMilli * spec.ghost;
      sum += creditedMilli;
      events.push({ type: "awardLoot", item: step.item, baseMilli, creditedMilli });
      events.push({ type: "setWin", milli: sum });
    } else if (step.room === "hack") {
      events.push({ type: "hack", result: "unlocked" });
    } else if (step.room === "side") {
      events.push({ type: "sidePassage" });
    } else if (step.room === "alarm") {
      alarm = true;
      events.push({ type: "alarm" });
      break;
    } else if (step.room === "vault") {
      vault = true;
      const baseMilli = vaultMilli(step.tier);
      const creditedMilli = baseMilli * spec.ghost;
      sum += creditedMilli;
      events.push({ type: "vaultBreach", tier: step.tier, baseMilli, creditedMilli });
      events.push({ type: "setWin", milli: sum });
    }
  }

  events.push({ type: "finalWin", milli: sum });
  events.push({ type: "raidEnd", status: statusFor(alarm, vault), finalMilli: sum });

  return {
    id: spec.id,
    mode: MODE,
    weight,
    payoutMilli: sum,
    family: spec.family,
    fixture: spec.fixture,
    events,
  };
}
