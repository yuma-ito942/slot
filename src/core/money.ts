/** Stake wallet amounts: 1_000_000 micro = 1.00 currency unit. */
export const API_MICRO = 1_000_000;

/** Payout scale: 1000 milli = 1.00× the stake. */
export const PAYOUT_MILLI = 1000;

export function multiplierOf(milli: number): number {
  return milli / PAYOUT_MILLI;
}

export function formatMultiplier(milli: number): string {
  return `${multiplierOf(milli).toFixed(2)}×`;
}

export function grossMicro(stakeMicro: number, payoutMilli: number): number {
  if (!Number.isInteger(stakeMicro) || !Number.isInteger(payoutMilli)) {
    throw new Error("Stake and payout must be integers");
  }
  const product = stakeMicro * payoutMilli;
  if (product % PAYOUT_MILLI !== 0) {
    throw new Error("Payout is not quantizable for this stake");
  }
  return product / PAYOUT_MILLI;
}

export function formatMicro(micro: number, currency: string, social: boolean): string {
  const units = micro / API_MICRO;
  if (social) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(units);
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(units);
  } catch {
    return `${units.toFixed(2)} ${currency}`;
  }
}

export function secureRandomBelow(total: number): number {
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error("Random range must be a positive integer");
  }
  const range = 0x1_0000_0000;
  const limit = range - (range % total);
  const buffer = new Uint32Array(1);
  let roll = 0;
  do {
    crypto.getRandomValues(buffer);
    roll = buffer[0] ?? 0;
  } while (roll >= limit);
  return roll % total;
}
