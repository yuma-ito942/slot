import { LOOT_MILLI, isLootItem, isVaultTier, vaultMilli } from "./paytable";
import {
  BOARD_SIZE,
  ENTRY,
  MAX_ORDINARY_VISITS,
  VAULT_CELL,
  type Cell,
  type GameOutcome,
  type RaidEvent,
  type RaidStatus,
  type RoomKind,
} from "./types";
import { cellKey, inBounds, orthogonal, sameCell } from "./path";

function isCell(value: unknown): value is Cell {
  return Array.isArray(value) && value.length === 2 && value.every((part) => Number.isInteger(part));
}

export function validateOutcome(book: GameOutcome): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`#${book.id}: ${message}`);
  if (!Number.isInteger(book.id) || book.id <= 0) fail("id must be a positive integer");
  if (!Number.isInteger(book.weight) || book.weight <= 0) fail("weight must be a positive integer");
  if (book.mode !== "BASE") fail("mode must be BASE");
  if (!Number.isInteger(book.payoutMilli) || book.payoutMilli < 0) fail("payout must be a non-negative integer");
  if (book.events.length === 0) fail("events are empty");

  const start = book.events[0];
  if (!start || start.type !== "raidStart") fail("first event must be raidStart");
  if (start && start.type === "raidStart") {
    if (start.boardSize !== BOARD_SIZE) fail("board is not 5×5");
    if (!sameCell(start.entry, ENTRY)) fail("entry is not (2,0)");
    if (!sameCell(start.vault, VAULT_CELL)) fail("vault is not (2,2)");
    if (start.ghostFactor !== 1 && start.ghostFactor !== 2 && start.ghostFactor !== 3) {
      fail("ghost factor must be 1, 2, or 3");
    }
  }
  const ghost = start && start.type === "raidStart" ? start.ghostFactor : 1;

  let sum = 0;
  let alarmIndex = -1;
  let vaultVisits = 0;
  let vaultAwards = 0;
  let lootAwards = 0;
  let ordinaryVisits = 0;
  let previous: Cell | null = null;
  const seen = new Set<string>();
  let monetaryBeforeGhost = false;

  book.events.forEach((event, index) => {
    if (alarmIndex >= 0 && index > alarmIndex && event.type !== "finalWin" && event.type !== "raidEnd") {
      fail(`event ${event.type} follows the alarm`);
    }
    if (event.type === "awardLoot" || event.type === "vaultBreach") {
      if (index === 0) monetaryBeforeGhost = true;
    }
    switch (event.type) {
      case "raidStart":
        if (index !== 0) fail("raidStart is not first");
        break;
      case "visit":
        noteVisit(event, index);
        break;
      case "awardLoot":
        lootAwards += 1;
        if (!isLootItem(event.item)) fail(`unknown loot ${event.item}`);
        else if (event.baseMilli !== LOOT_MILLI[event.item]) fail(`${event.item} has the wrong base value`);
        if (event.creditedMilli !== event.baseMilli * ghost) fail("loot credit is not base × ghost");
        sum += event.creditedMilli;
        break;
      case "hack":
        if (event.result !== "unlocked") fail("hack result is not a scripted unlock");
        break;
      case "sidePassage":
      case "alarm":
        if (event.type === "alarm") alarmIndex = index;
        break;
      case "vaultBreach":
        vaultAwards += 1;
        if (!isVaultTier(event.tier) || event.baseMilli !== vaultMilli(event.tier)) {
          fail("vault tier does not match its value");
        }
        if (event.creditedMilli !== event.baseMilli * ghost) fail("vault credit is not base × ghost");
        sum += event.creditedMilli;
        break;
      case "setWin":
        if (event.milli !== sum) fail(`setWin ${event.milli} disagrees with running total ${sum}`);
        break;
      case "finalWin":
        if (event.milli !== sum) fail("finalWin disagrees with the sum of credits");
        break;
      case "raidEnd":
        if (event.finalMilli !== sum) fail("raidEnd disagrees with the sum of credits");
        if (event.status !== expectedStatus(alarmIndex >= 0, vaultAwards > 0)) {
          fail(`status ${event.status} does not match the event sequence`);
        }
        if (index !== book.events.length - 1) fail("raidEnd is not last");
        break;
      default:
        fail("unknown event");
    }
  });

  if (monetaryBeforeGhost) fail("a payout appears before ghost protocol is declared");
  if (lootAwards > MAX_ORDINARY_VISITS) fail("more than 8 ordinary loot awards");
  if (ordinaryVisits > MAX_ORDINARY_VISITS) fail("more than 8 ordinary room visits");
  if (vaultAwards > 1 || vaultVisits > 1) fail("vault occurs more than once");
  if (vaultAwards !== vaultVisits) fail("vault visit and vault award are out of agreement");
  if (book.payoutMilli !== sum) fail("published payout disagrees with events");
  const end = book.events[book.events.length - 1];
  if (!end || end.type !== "raidEnd") fail("book does not end with raidEnd");
  if (!book.events.some((event) => event.type === "finalWin")) fail("missing finalWin");

  return errors;

  function noteVisit(event: Extract<RaidEvent, { type: "visit" }>, index: number): void {
    if (!isCell(event.cell) || !inBounds(event.cell)) {
      fail(`visit ${index} is off the board`);
      return;
    }
    const key = cellKey(event.cell);
    if (seen.has(key)) fail(`cell ${key} is revisited`);
    seen.add(key);
    if (previous && !orthogonal(previous, event.cell)) fail(`visit ${index} is not an orthogonal step`);
    previous = event.cell;
    if (event.room === "vault") {
      vaultVisits += 1;
      if (!sameCell(event.cell, VAULT_CELL)) fail("vault room is not at (2,2)");
    } else if (sameCell(event.cell, VAULT_CELL)) {
      fail("central cell is not the vault");
    }
    if (event.room !== "entry" && event.room !== "vault") ordinaryVisits += 1;
    if (index === 1) {
      if (event.room !== "entry" || !sameCell(event.cell, ENTRY)) fail("the first visit must be the entry");
    }
    const next = book.events[index + 1];
    checkRoomPayload(event.room, next, fail);
  }
}

function checkRoomPayload(
  room: RoomKind,
  next: RaidEvent | undefined,
  fail: (message: string) => void,
): void {
  if (room === "loot" && next?.type !== "awardLoot") fail("loot room does not award loot");
  if (room === "hack" && next?.type !== "hack") fail("hack room does not unlock");
  if (room === "side" && next?.type !== "sidePassage") fail("side room does not open a passage");
  if (room === "alarm" && next?.type !== "alarm") fail("alarm room does not raise an alarm");
  if (room === "vault" && next?.type !== "vaultBreach") fail("vault room does not breach");
  if ((room === "entry" || room === "empty") && next && isPayload(next)) {
    fail(`${room} room emits a payload`);
  }
}

function isPayload(event: RaidEvent): boolean {
  return event.type === "awardLoot" || event.type === "hack" || event.type === "sidePassage" || event.type === "alarm" || event.type === "vaultBreach";
}

function expectedStatus(alarm: boolean, vault: boolean): RaidStatus {
  if (alarm) return "INTERCEPTED";
  if (vault) return "VAULT SECURED";
  return "EXTRACTED";
}

export function assertValid(book: GameOutcome): void {
  const errors = validateOutcome(book);
  if (errors.length > 0) throw new Error(errors.join("\n"));
}
