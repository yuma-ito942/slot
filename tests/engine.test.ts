import { describe, expect, it } from "vitest";
import { assemble } from "../src/core/assemble";
import { FIXTURES } from "../src/core/fixtures";
import { bookById, buildLibrary, getLibrary, pickWeighted, TARGET_RTP } from "../src/core/library";
import { grossMicro, API_MICRO } from "../src/core/money";
import { initialMachine, reduceMachine, stakeMicro } from "../src/core/machine";
import { explainUnroutable, findRoute } from "../src/core/path";
import { DESIGNED_MAX_MILLI } from "../src/core/paytable";
import { presentAll, reducePresentation, initialPresentation } from "../src/core/present";
import { toLookupCsv } from "../src/core/publish";
import { auditBooks } from "../src/core/stats";
import { validateOutcome } from "../src/core/validate";
import { readLaunchParams } from "../src/launch/params";
import { normalizeEvents, outcomeFromVerifiedState } from "../src/rgs/parse";
import type { GameOutcome, Step } from "../src/core/types";

describe("route geometry", () => {
  it("rejects a vault on the wrong color step", () => {
    const vault: Step = { room: "vault", tier: 10 };
    expect(explainUnroutable([vault])).toMatch(/odd index/);
    expect(findRoute([vault], 1)).toBeNull();
    expect(findRoute([{ room: "empty" }, vault], 4)?.[1]).toEqual([2, 2]);
  });
});

describe("published book", () => {
  const books = buildLibrary();
  const audit = auditBooks(books);

  it("matches the designed ceiling and the return target", () => {
    expect(DESIGNED_MAX_MILLI).toBe(420_000);
    expect(audit.maxMilli).toBe(420_000);
    expect(Math.abs(audit.rtp - TARGET_RTP)).toBeLessThan(0.0005);
    expect(audit.hitRate).toBeGreaterThanOrEqual(1 / 20);
    expect(audit.hitRate).toBeLessThan(0.45);
    expect(audit.maxFrequency).toBeGreaterThan(1 / 10_000_000);
    expect(audit.standardDeviation).toBeGreaterThan(1);
  });

  it("gives every book a legal route, a unique id, and a matching presentation", () => {
    const ids = new Set<number>();
    for (const book of books) {
      expect(validateOutcome(book)).toEqual([]);
      expect(ids.has(book.id)).toBe(false);
      ids.add(book.id);
      const shown = presentAll(book.events);
      const end = book.events[book.events.length - 1];
      expect(end?.type).toBe("raidEnd");
      if (end?.type === "raidEnd") expect(shown.status).toBe(end.status);
      expect(shown.winMilli).toBe(book.payoutMilli);
    }
  });

  it("keeps the forced replay fixtures truthful", () => {
    const loss = must(FIXTURES.loss);
    const normal = must(FIXTURES.normal);
    const high = must(FIXTURES.high);
    const max = must(FIXTURES.max);
    const vault = must(FIXTURES.vault);
    const ghost = must(FIXTURES.ghost);
    const circuit = must(FIXTURES.circuit);
    const intercept = must(FIXTURES.intercept);
    expect(loss.payoutMilli).toBe(0);
    expect(presentAll(loss.events).status).toBe("INTERCEPTED");
    expect(normal.payoutMilli).toBe(350);
    expect(presentAll(normal.events).status).toBe("EXTRACTED");
    expect(high.payoutMilli).toBe(50_000);
    expect(presentAll(high.events).vaultOpen).toBe(true);
    expect(max.payoutMilli).toBe(420_000);
    expect(max.weight).toBeGreaterThan(0);
    expect(vault.events.some((event) => event.type === "vaultBreach")).toBe(true);
    expect(ghost.events[0]).toMatchObject({ type: "raidStart", ghostFactor: 2 });
    expect(circuit.events.some((event) => event.type === "hack")).toBe(true);
    expect(circuit.events.some((event) => event.type === "sidePassage")).toBe(true);
    expect(presentAll(intercept.events).status).toBe("INTERCEPTED");
    expect(intercept.payoutMilli).toBeGreaterThan(0);
  });

  it("writes a lookup table whose multipliers match the books", () => {
    const csv = toLookupCsv(books);
    expect(csv.startsWith("simulation_id,weight,payout_multiplier\n")).toBe(true);
    expect(csv).toContain(`${FIXTURES.max},1,420.00`);
  });

  it("picks by weight without crossing the boundary", () => {
    const sample: GameOutcome[] = [
      { ...books[0]!, weight: 2 },
      { ...books[1]!, weight: 5 },
    ];
    expect(pickWeighted(sample, 0).id).toBe(sample[0]!.id);
    expect(pickWeighted(sample, 2).id).toBe(sample[1]!.id);
    expect(() => pickWeighted(sample, 7)).toThrow();
  });
});

describe("money", () => {
  it("converts a stake and a multiplier into integer micro-units", () => {
    expect(grossMicro(API_MICRO, 350)).toBe(350_000);
    expect(grossMicro(100_000, 420_000)).toBe(42_000_000);
    expect(() => grossMicro(1, 100)).toThrow(/quantizable/);
  });
});

describe("state machine", () => {
  it("refuses a wager from an illegal phase and from a short balance", () => {
    let state = initialMachine();
    state = reduceMachine(state, { type: "PLAY" });
    expect(state.phase).toBe("BOOT");
    state = reduceMachine(state, { type: "START", replay: false });
    state = reduceMachine(state, {
      type: "AUTH_OK",
      balanceMicro: 50,
      currency: "USD",
      betLevelsMicro: [100, 200],
      defaultBetMicro: 100,
      social: false,
      demo: true,
      displayRtp: true,
      slamAllowed: true,
      spacebarAllowed: true,
      resumeOutcomeId: null,
    });
    expect(state.phase).toBe("READY");
    expect(stakeMicro(state)).toBe(100);
    state = reduceMachine(state, { type: "PLAY" });
    expect(state.phase).toBe("READY");
    expect(state.error).toMatch(/Insufficient/);
  });

  it("keeps replay from accepting a bet", () => {
    let state = reduceMachine(initialMachine(), { type: "START", replay: true });
    state = reduceMachine(state, { type: "REPLAY_LOADED", outcomeId: 1004 });
    state = reduceMachine(state, { type: "PLAY" });
    expect(state.phase).toBe("REPLAY_READY");
    state = reduceMachine(state, { type: "START_REPLAY" });
    expect(state.phase).toBe("REPLAY_ANIMATING");
    state = reduceMachine(state, { type: "ANIM_DONE" });
    expect(state.phase).toBe("REPLAY_DONE");
  });
});

describe("presentation", () => {
  it("is idempotent on the win checkpoint and matches a full replay", () => {
    const book = must(FIXTURES.normal);
    let state = initialPresentation();
    for (const event of book.events) state = reducePresentation(state, event).state;
    const checkpoint = book.events.find((event) => event.type === "setWin");
    expect(checkpoint?.type).toBe("setWin");
    if (checkpoint?.type === "setWin") {
      const twice = reducePresentation(state, checkpoint).state;
      expect(twice.winMilli).toBe(checkpoint.milli);
    }
    expect(presentAll(book.events)).toEqual(state);
  });
});

describe("launch and remote events", () => {
  it("reads the Stake replay query", () => {
    const params = readLaunchParams("?replay=true&game=abc&version=1&mode=BASE&event=1004&rgs_url=https://rgs.example.com/ignored&amount=1000000&currency=usd&lang=fr&social=true");
    expect(params.replay).toBe(true);
    expect(params.rgsUrl).toBe("rgs.example.com");
    expect(params.amountMicro).toBe(1_000_000);
    expect(params.currency).toBe("USD");
    expect(params.lang).toBe("fr");
    expect(params.social).toBe(true);
    expect(params.event).toBe("1004");
  });

  it("accepts decimal multipliers and still verifies the total", () => {
    const book = must(FIXTURES.ghost);
    const loose = book.events.map((event) => {
      if (event.type === "awardLoot") {
        return {
          type: "awardLoot",
          item: event.item,
          baseMultiplier: event.baseMilli / 1000,
          creditedMultiplier: event.creditedMilli / 1000,
        };
      }
      if (event.type === "setWin" || event.type === "finalWin") {
        return { type: event.type, multiplier: event.milli / 1000 };
      }
      if (event.type === "raidEnd") return { type: "raidEnd", status: event.status, finalMultiplier: event.finalMilli / 1000 };
      return event;
    });
    const restored = outcomeFromVerifiedState(book.id, book.payoutMilli / 1000, { events: loose });
    expect(restored.payoutMilli).toBe(book.payoutMilli);
    expect(normalizeEvents(loose)[0]?.type).toBe("raidStart");
  });
});

function must(id: number): GameOutcome {
  const book = bookById(id) ?? getLibrary().find((entry) => entry.id === id);
  if (!book) throw new Error(`missing ${id}`);
  return book;
}

describe("assembler", () => {
  it("stops paying when the alarm is the scripted end", () => {
    const book = assemble(
      {
        id: 7,
        ghost: 2,
        steps: [{ room: "loot", item: "Data Chip" }, { room: "alarm" }],
        family: "test",
        fixture: null,
        weight: 1,
      },
      [
        [1, 0],
        [1, 1],
      ],
      1,
    );
    expect(book.payoutMilli).toBe(200);
    expect(book.events.at(-1)).toMatchObject({ type: "raidEnd", status: "INTERCEPTED", finalMilli: 200 });
    expect(validateOutcome(book)).toEqual([]);
  });
});
