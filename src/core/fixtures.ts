import type { FixtureName } from "./types";

/** Forced event ids required for loss, ordinary win, high win, max win, and vault playback. */
export const FIXTURES: Record<FixtureName, number> = {
  loss: 1001,
  normal: 1002,
  high: 1003,
  max: 1004,
  vault: 1005,
  ghost: 1006,
  circuit: 1007,
  intercept: 1008,
};
