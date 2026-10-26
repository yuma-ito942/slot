export interface LaunchParams {
  readonly replay: boolean;
  readonly game: string | null;
  readonly version: string | null;
  readonly mode: string | null;
  readonly event: string | null;
  readonly amountMicro: number | null;
  readonly currency: string;
  readonly lang: string;
  readonly social: boolean;
  readonly rgsUrl: string | null;
  readonly sessionID: string | null;
  readonly device: string | null;
}

/** Stake Engine passes rgs_url as a bare host. */
export function normalizeRgsHost(value: string | null): string | null {
  if (!value) return null;
  const host = value.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
  return host;
}

function flag(value: string | null): boolean {
  return value === "true" || value === "1";
}

function integerParam(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function readLaunchParams(search: string): LaunchParams {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const lang = query.get("lang")?.trim() || "en";
  return {
    replay: flag(query.get("replay")),
    game: query.get("game"),
    version: query.get("version"),
    mode: query.get("mode"),
    event: query.get("event"),
    amountMicro: integerParam(query.get("amount")),
    currency: (query.get("currency") || "USD").toUpperCase(),
    lang,
    social: flag(query.get("social")),
    rgsUrl: normalizeRgsHost(query.get("rgs_url")),
    sessionID: query.get("sessionID"),
    device: query.get("device"),
  };
}

export function englishOnly(lang: string): boolean {
  return lang.toLowerCase() === "en" || lang.toLowerCase().startsWith("en-");
}
