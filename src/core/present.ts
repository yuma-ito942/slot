import type { Cell, GhostFactor, RaidEvent, RaidStatus } from "./types";
import { ENTRY } from "./types";
import { cellKey } from "./path";

export interface RevealedRoom {
  readonly kind: RaidEvent extends never ? never : string;
  readonly room: Extract<RaidEvent, { type: "visit" }>["room"];
  readonly item?: string;
  readonly tier?: number;
}

export interface Presentation {
  readonly ghostFactor: GhostFactor | null;
  readonly operative: Cell;
  readonly trail: readonly Cell[];
  readonly rooms: Readonly<Record<string, RevealedRoom>>;
  readonly winMilli: number;
  readonly status: RaidStatus | null;
  readonly alarm: boolean;
  readonly vaultOpen: boolean;
  readonly note: string;
  readonly lastItem: string | null;
}

export interface Beat {
  readonly sound: "start" | "step" | "loot" | "hack" | "side" | "alarm" | "vault" | "end" | "tick" | "none";
  readonly detail: string;
  readonly hold: "move" | "loot" | "hack" | "alarm" | "vault" | "end" | "short";
}

export function initialPresentation(): Presentation {
  return {
    ghostFactor: null,
    operative: ENTRY,
    trail: [],
    rooms: {},
    winMilli: 0,
    status: null,
    alarm: false,
    vaultOpen: false,
    note: "Awaiting insertion",
    lastItem: null,
  };
}

function extendTrail(trail: readonly Cell[], cell: Cell): readonly Cell[] {
  const last = trail[trail.length - 1];
  if (last && last[0] === cell[0] && last[1] === cell[1]) return trail;
  return [...trail, cell];
}

export function reducePresentation(state: Presentation, event: RaidEvent): { state: Presentation; beat: Beat } {
  switch (event.type) {
    case "raidStart":
      return {
        state: {
          ...state,
          ghostFactor: event.ghostFactor,
          note: event.ghostFactor > 1 ? `Ghost run ×${event.ghostFactor} engaged` : "Standard insertion",
        },
        beat: { sound: "start", detail: "Raid start", hold: "short" },
      };
    case "visit": {
      const room: RevealedRoom =
        event.room === "loot"
          ? { kind: "room", room: event.room }
          : { kind: "room", room: event.room };
      return {
        state: {
          ...state,
          operative: event.cell,
          trail: extendTrail(state.trail, event.cell),
          rooms: { ...state.rooms, [cellKey(event.cell)]: room },
          note:
            event.room === "entry"
              ? "Intake lock"
              : event.room === "empty"
                ? "Clear room"
                : event.room === "vault"
                  ? "Vault threshold"
                  : state.note,
        },
        beat: { sound: "step", detail: `Enter ${event.room}`, hold: "move" },
      };
    }
    case "awardLoot":
      return {
        state: {
          ...state,
          lastItem: event.item,
          rooms: markLoot(state, event.item),
          note: event.item,
        },
        beat: { sound: "loot", detail: event.item, hold: "loot" },
      };
    case "hack":
      return {
        state: { ...state, note: "Passage unlocked" },
        beat: { sound: "hack", detail: "Hack unlocked", hold: "hack" },
      };
    case "sidePassage":
      return {
        state: { ...state, note: "Side passage" },
        beat: { sound: "side", detail: "Side passage", hold: "move" },
      };
    case "alarm":
      return {
        state: { ...state, alarm: true, note: "Security alarm" },
        beat: { sound: "alarm", detail: "Alarm", hold: "alarm" },
      };
    case "vaultBreach":
      return {
        state: {
          ...state,
          vaultOpen: true,
          lastItem: `Vault ${event.tier}×`,
          note: `Vault ${event.tier}×`,
          rooms: markVault(state, event.tier),
        },
        beat: { sound: "vault", detail: `Vault ${event.tier}×`, hold: "vault" },
      };
    case "setWin":
    case "finalWin":
      return {
        state: { ...state, winMilli: event.milli },
        beat: { sound: "tick", detail: "Win sync", hold: "short" },
      };
    case "raidEnd":
      return {
        state: { ...state, status: event.status, winMilli: event.finalMilli, note: event.status },
        beat: { sound: "end", detail: event.status, hold: "end" },
      };
    default:
      return { state, beat: { sound: "none", detail: "", hold: "short" } };
  }
}

function currentKey(state: Presentation): string | null {
  const cell = state.operative;
  return cellKey(cell);
}

function markLoot(state: Presentation, item: string): Presentation["rooms"] {
  const key = currentKey(state);
  if (!key) return state.rooms;
  const existing = state.rooms[key];
  if (!existing) return state.rooms;
  return { ...state.rooms, [key]: { ...existing, item } };
}

function markVault(state: Presentation, tier: number): Presentation["rooms"] {
  const key = currentKey(state);
  if (!key) return state.rooms;
  const existing = state.rooms[key];
  if (!existing) return state.rooms;
  return { ...state.rooms, [key]: { ...existing, tier } };
}

export function presentAll(events: readonly RaidEvent[]): Presentation {
  return events.reduce((state, event) => reducePresentation(state, event).state, initialPresentation());
}
