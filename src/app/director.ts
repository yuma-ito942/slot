import { presentAll, reducePresentation, type Beat, type Presentation } from "../core/present";
import type { RaidEvent } from "../core/types";

export interface PlaybackOptions {
  readonly fast: boolean;
  readonly reduced: boolean;
  readonly signal: AbortSignal;
  readonly onFrame: (state: Presentation, beat: Beat) => void;
}

const HOLD_MS: Record<Beat["hold"], number> = {
  move: 780,
  loot: 1100,
  hack: 1200,
  alarm: 1300,
  vault: 2800,
  end: 900,
  short: 280,
};

function holdFor(beat: Beat, options: PlaybackOptions): number {
  if (options.signal.aborted) return 0;
  const base = HOLD_MS[beat.hold];
  if (options.reduced) return beat.hold === "loot" || beat.hold === "vault" || beat.hold === "end" ? 140 : 40;
  if (options.fast) return Math.max(90, Math.round(base * 0.42));
  return base;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    const onAbort = () => finish();
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function playEvents(events: readonly RaidEvent[], options: PlaybackOptions): Promise<Presentation> {
  let state = presentAll([]);
  for (const event of events) {
    if (options.signal.aborted) break;
    const next = reducePresentation(state, event);
    state = next.state;
    options.onFrame(state, next.beat);
    await wait(holdFor(next.beat, options), options.signal);
  }
  return state;
}

export function finalBeat(state: Presentation): Beat {
  return { sound: "end", detail: state.status ?? "Round complete", hold: "end" };
}
