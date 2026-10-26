export type Phase =
  | "BOOT"
  | "AUTHENTICATING"
  | "READY"
  | "BET_PENDING"
  | "ANIMATING"
  | "SETTLING"
  | "RESULT"
  | "REPLAY_LOADING"
  | "REPLAY_READY"
  | "REPLAY_ANIMATING"
  | "REPLAY_DONE"
  | "ERROR";

export interface MachineState {
  readonly phase: Phase;
  readonly balanceMicro: number | null;
  readonly currency: string;
  readonly betLevelsMicro: readonly number[];
  readonly betIndex: number;
  readonly social: boolean;
  readonly demo: boolean;
  readonly replay: boolean;
  readonly outcomeId: number | null;
  readonly activeRound: boolean;
  readonly error: string | null;
  readonly errorKind: "auth" | "play" | "settle" | "replay" | null;
  readonly displayRtp: boolean;
  readonly slamAllowed: boolean;
  readonly spacebarAllowed: boolean;
}

export type MachineAction =
  | { readonly type: "START"; readonly replay: boolean }
  | {
      readonly type: "AUTH_OK";
      readonly balanceMicro: number;
      readonly currency: string;
      readonly betLevelsMicro: readonly number[];
      readonly defaultBetMicro: number;
      readonly social: boolean;
      readonly demo: boolean;
      readonly displayRtp: boolean;
      readonly slamAllowed: boolean;
      readonly spacebarAllowed: boolean;
      readonly resumeOutcomeId: number | null;
    }
  | { readonly type: "AUTH_FAIL"; readonly message: string }
  | { readonly type: "SELECT_BET"; readonly index: number }
  | { readonly type: "PLAY" }
  | { readonly type: "PLAY_OK"; readonly outcomeId: number; readonly balanceMicro: number; readonly active: boolean }
  | { readonly type: "PLAY_REJECTED"; readonly message: string }
  | { readonly type: "PLAY_UNKNOWN"; readonly message: string }
  | { readonly type: "ANIM_DONE" }
  | { readonly type: "END_ROUND_OK"; readonly balanceMicro: number }
  | { readonly type: "END_ROUND_FAIL"; readonly message: string }
  | { readonly type: "REPLAY_LOADED"; readonly outcomeId: number }
  | { readonly type: "REPLAY_FAIL"; readonly message: string }
  | { readonly type: "START_REPLAY" }
  | { readonly type: "RETRY" };

export const initialMachine = (): MachineState => ({
  phase: "BOOT",
  balanceMicro: null,
  currency: "USD",
  betLevelsMicro: [],
  betIndex: 0,
  social: false,
  demo: false,
  replay: false,
  outcomeId: null,
  activeRound: false,
  error: null,
  errorKind: null,
  displayRtp: true,
  slamAllowed: true,
  spacebarAllowed: true,
});

function withBet(state: MachineState, index: number): MachineState {
  if (state.betLevelsMicro.length === 0) return state;
  const next = Math.min(state.betLevelsMicro.length - 1, Math.max(0, index));
  return { ...state, betIndex: next, error: null };
}

export function reduceMachine(state: MachineState, action: MachineAction): MachineState {
  switch (action.type) {
    case "START":
      if (state.phase !== "BOOT" && state.phase !== "ERROR") return state;
      return {
        ...state,
        phase: action.replay ? "REPLAY_LOADING" : "AUTHENTICATING",
        replay: action.replay,
        error: null,
        errorKind: null,
      };
    case "AUTH_OK": {
      if (state.phase !== "AUTHENTICATING") return state;
      const betIndex = Math.max(0, action.betLevelsMicro.indexOf(action.defaultBetMicro));
      const next: MachineState = {
        ...state,
        balanceMicro: action.balanceMicro,
        currency: action.currency,
        betLevelsMicro: action.betLevelsMicro,
        betIndex: betIndex === -1 ? 0 : betIndex,
        social: action.social,
        demo: action.demo,
        displayRtp: action.displayRtp,
        slamAllowed: action.slamAllowed,
        spacebarAllowed: action.spacebarAllowed,
        error: null,
        errorKind: null,
      };
      if (action.resumeOutcomeId !== null) {
        return { ...next, phase: "ANIMATING", outcomeId: action.resumeOutcomeId, activeRound: true };
      }
      return { ...next, phase: "READY" };
    }
    case "AUTH_FAIL":
      if (state.phase !== "AUTHENTICATING" && state.phase !== "REPLAY_LOADING") return state;
      return { ...state, phase: "ERROR", error: action.message, errorKind: "auth" };
    case "SELECT_BET":
      if (state.replay || (state.phase !== "READY" && state.phase !== "RESULT")) return state;
      return withBet(state, action.index);
    case "PLAY": {
      if (state.replay || (state.phase !== "READY" && state.phase !== "RESULT")) return state;
      const bet = state.betLevelsMicro[state.betIndex];
      if (bet === undefined) return { ...state, error: "No legal stake is available" };
      if (state.balanceMicro !== null && bet > state.balanceMicro) {
        return { ...state, error: "Insufficient balance for that stake" };
      }
      return { ...state, phase: "BET_PENDING", error: null };
    }
    case "PLAY_OK":
      if (state.phase !== "BET_PENDING") return state;
      return {
        ...state,
        phase: "ANIMATING",
        outcomeId: action.outcomeId,
        balanceMicro: action.balanceMicro,
        activeRound: action.active,
        error: null,
      };
    case "PLAY_REJECTED":
      if (state.phase !== "BET_PENDING") return state;
      return { ...state, phase: "READY", error: action.message, errorKind: null };
    case "PLAY_UNKNOWN":
      if (state.phase !== "BET_PENDING") return state;
      return { ...state, phase: "ERROR", error: action.message, errorKind: "play" };
    case "ANIM_DONE":
      if (state.phase === "ANIMATING" && state.activeRound) return { ...state, phase: "SETTLING" };
      if (state.phase === "ANIMATING") return { ...state, phase: "RESULT" };
      if (state.phase === "REPLAY_ANIMATING") return { ...state, phase: "REPLAY_DONE" };
      return state;
    case "END_ROUND_OK":
      if (state.phase !== "SETTLING") return state;
      return { ...state, phase: "RESULT", balanceMicro: action.balanceMicro, activeRound: false, error: null };
    case "END_ROUND_FAIL":
      if (state.phase !== "SETTLING") return state;
      return { ...state, phase: "ERROR", error: action.message, errorKind: "settle" };
    case "REPLAY_LOADED":
      if (state.phase !== "REPLAY_LOADING") return state;
      return { ...state, phase: "REPLAY_READY", outcomeId: action.outcomeId, replay: true, error: null };
    case "REPLAY_FAIL":
      if (state.phase !== "REPLAY_LOADING") return state;
      return { ...state, phase: "ERROR", error: action.message, errorKind: "replay", replay: true };
    case "START_REPLAY":
      if (state.phase !== "REPLAY_READY" && state.phase !== "REPLAY_DONE") return state;
      return { ...state, phase: "REPLAY_ANIMATING" };
    case "RETRY":
      if (state.phase !== "ERROR") return state;
      if (state.errorKind === "auth") return { ...state, phase: "AUTHENTICATING", error: null };
      if (state.errorKind === "replay") return { ...state, phase: "REPLAY_LOADING", error: null };
      if (state.errorKind === "play" || state.errorKind === "settle") {
        return { ...state, phase: "AUTHENTICATING", error: null };
      }
      return state;
    default:
      return state;
  }
}

export function stakeMicro(state: MachineState): number | null {
  return state.betLevelsMicro[state.betIndex] ?? null;
}
