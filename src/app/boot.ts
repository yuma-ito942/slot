import "../styles.css";
import { Mixer } from "../audio/mixer";
import { finalBeat, playEvents } from "./director";
import { RaidView } from "./view";
import { presentAll } from "../core/present";
import type { MathAudit } from "../core/stats";
import { initialMachine, reduceMachine, stakeMicro, type MachineState } from "../core/machine";
import type { GameOutcome } from "../core/types";
import { readLaunchParams, type LaunchParams } from "../launch/params";
import type { ReplayPackage } from "../rgs/remote";
import { WalletRejected, type WalletClient } from "../rgs/types";

export interface LaunchHooks {
  createClient(params: LaunchParams): Promise<WalletClient>;
  loadReplay(params: LaunchParams): Promise<ReplayPackage>;
  loadAudit(): Promise<MathAudit | null>;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The request could not be completed";
}

function readMuted(): boolean {
  try {
    return localStorage.getItem("breach-protocol-mute") === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem("breach-protocol-mute", muted ? "1" : "0");
  } catch {
    /* Preference stays in memory. */
  }
}

export function mountGame(root: HTMLElement, hooks: LaunchHooks): void {
  const params = readLaunchParams(window.location.search);
  const audio = new Mixer();
  let machine: MachineState = initialMachine();
  let outcome: GameOutcome | null = null;
  let client: WalletClient | null = null;
  let fast = false;
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let sound = !readMuted();
  let costMultiplier = 1;
  let modeName = params.mode ?? "BASE";
  let lockedStake: number | null = params.replay ? params.amountMicro : null;
  let playToken = 0;
  let abort: AbortController | null = null;

  const view = new RaidView(root, {
    onPrimary: () => void onPrimary(),
    onSlam: () => abort?.abort(),
    onBet: (delta) => {
      machine = reduceMachine(machine, { type: "SELECT_BET", index: machine.betIndex + delta });
      render();
    },
    onSound: () => {
      sound = !sound;
      audio.setMuted(!sound);
      audio.resume();
      writeMuted(!sound);
      render();
    },
    onFast: () => {
      fast = !fast;
      render();
    },
    onMotion: () => {
      reduced = !reduced;
      render();
    },
    onRetry: () => {
      machine = reduceMachine(machine, { type: "RETRY" });
      render();
      if (machine.phase === "REPLAY_LOADING") void bootReplay();
      else void bootSession();
    },
  });

  audio.setMuted(!sound);

  function render(): void {
    const selected = stakeMicro(machine);
    view.setMoney(lockedStake ?? selected, machine.currency || params.currency, machine.social);
    view.setLanguage(params.lang);
    view.setPreferences(sound, fast, reduced);
    view.sync(machine, costMultiplier, modeName);
  }

  async function bootReplay(): Promise<void> {
    try {
      const pack = await hooks.loadReplay(params);
      outcome = pack.outcome;
      costMultiplier = pack.costMultiplier;
      modeName = params.mode ?? outcome.mode;
      lockedStake = params.amountMicro;
      if (!params.rgsUrl) view.setAudit(await hooks.loadAudit());
      machine = reduceMachine(machine, { type: "REPLAY_LOADED", outcomeId: pack.outcome.id });
      render();
    } catch (error) {
      machine = reduceMachine(machine, { type: "REPLAY_FAIL", message: messageOf(error) });
      render();
    }
  }

  async function bootSession(): Promise<void> {
    try {
      client ??= await hooks.createClient(params);
      const auth = await client.authenticate();
      if (client.kind === "demo" && auth.displayRtp) view.setAudit(await hooks.loadAudit());
      outcome = auth.resume;
      if (auth.resume && auth.resumeStakeMicro !== null) lockedStake = auth.resumeStakeMicro;
      machine = reduceMachine(machine, {
        type: "AUTH_OK",
        balanceMicro: auth.balanceMicro,
        currency: auth.currency,
        betLevelsMicro: auth.betLevelsMicro,
        defaultBetMicro: auth.defaultBetMicro,
        social: auth.social,
        demo: client.kind === "demo",
        displayRtp: auth.displayRtp,
        slamAllowed: auth.slamAllowed,
        spacebarAllowed: auth.spacebarAllowed,
        resumeOutcomeId: auth.resume?.id ?? null,
      });
      render();
      if (auth.resume && machine.phase === "ANIMATING") await runPlayback(auth.resume);
    } catch (error) {
      machine = reduceMachine(machine, { type: "AUTH_FAIL", message: messageOf(error) });
      render();
    }
  }

  async function onPrimary(): Promise<void> {
    audio.resume();
    if (machine.phase === "REPLAY_READY" || machine.phase === "REPLAY_DONE") {
      if (!outcome) return;
      machine = reduceMachine(machine, { type: "START_REPLAY" });
      render();
      await runPlayback(outcome);
      return;
    }
    if (machine.phase !== "READY" && machine.phase !== "RESULT") return;
    const stake = stakeMicro(machine);
    machine = reduceMachine(machine, { type: "PLAY" });
    render();
    if (machine.phase !== "BET_PENDING" || !client || stake === null) return;
    lockedStake = stake;
    render();
    try {
      const result = await client.play(stake);
      outcome = result.outcome;
      machine = reduceMachine(machine, {
        type: "PLAY_OK",
        outcomeId: result.outcome.id,
        balanceMicro: result.balanceMicro,
        active: result.active,
      });
      render();
      await runPlayback(result.outcome);
    } catch (error) {
      if (machine.phase !== "BET_PENDING") return;
      if (error instanceof WalletRejected) {
        machine = reduceMachine(machine, { type: "PLAY_REJECTED", message: error.message });
      } else {
        machine = reduceMachine(machine, { type: "PLAY_UNKNOWN", message: messageOf(error) });
      }
      render();
    }
  }

  async function runPlayback(book: GameOutcome): Promise<void> {
    const token = ++playToken;
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    view.resetRound();
    audio.resume();
    await playEvents(book.events, {
      fast,
      reduced,
      signal: controller.signal,
      onFrame: (state, beat) => {
        view.show(state, beat);
        audio.play(beat.sound);
      },
    });
    if (token !== playToken) return;
    if (controller.signal.aborted) {
      const finalState = presentAll(book.events);
      view.show(finalState, finalBeat(finalState));
    }
    machine = reduceMachine(machine, { type: "ANIM_DONE" });
    render();
    if (machine.phase !== "SETTLING" || !client) return;
    try {
      const ended = await client.endRound();
      if (token !== playToken) return;
      machine = reduceMachine(machine, { type: "END_ROUND_OK", balanceMicro: ended.balanceMicro });
    } catch (error) {
      if (token !== playToken) return;
      machine = reduceMachine(machine, { type: "END_ROUND_FAIL", message: messageOf(error) });
    }
    render();
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const typing = target?.closest("input, textarea, select, dialog, a, button");
    if (event.code === "Space") {
      if (!machine.spacebarAllowed || typing) return;
      event.preventDefault();
      void onPrimary();
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !typing && !machine.replay) {
      event.preventDefault();
      machine = reduceMachine(machine, {
        type: "SELECT_BET",
        index: machine.betIndex + (event.key === "ArrowUp" ? 1 : -1),
      });
      render();
    }
  });

  machine = reduceMachine(machine, { type: "START", replay: params.replay });
  render();
  if (params.replay) void bootReplay();
  else void bootSession();
}
