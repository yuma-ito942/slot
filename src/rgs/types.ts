import type { GameOutcome } from "../core/types";

export interface AuthSnapshot {
  readonly balanceMicro: number;
  readonly currency: string;
  readonly betLevelsMicro: readonly number[];
  readonly defaultBetMicro: number;
  readonly social: boolean;
  readonly displayRtp: boolean;
  readonly slamAllowed: boolean;
  readonly spacebarAllowed: boolean;
  readonly resume: GameOutcome | null;
  readonly resumeStakeMicro: number | null;
}

export interface PlaySnapshot {
  readonly outcome: GameOutcome;
  readonly balanceMicro: number;
  readonly active: boolean;
}

export interface WalletClient {
  readonly kind: "demo" | "remote";
  authenticate(): Promise<AuthSnapshot>;
  play(amountMicro: number): Promise<PlaySnapshot>;
  endRound(): Promise<{ balanceMicro: number }>;
}

export class WalletRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletRejected";
  }
}

export class WalletUnknown extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletUnknown";
  }
}
