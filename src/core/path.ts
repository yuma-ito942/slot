import { BOARD_SIZE, ENTRY, VAULT_CELL, type Cell, type Step } from "./types";

export function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function inBounds(cell: Cell): boolean {
  return cell[0] >= 0 && cell[0] < BOARD_SIZE && cell[1] >= 0 && cell[1] < BOARD_SIZE;
}

export function orthogonal(a: Cell, b: Cell): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export function neighbors(cell: Cell): Cell[] {
  const [row, col] = cell;
  const found: Cell[] = [];
  if (row > 0) found.push([row - 1, col]);
  if (row < BOARD_SIZE - 1) found.push([row + 1, col]);
  if (col > 0) found.push([row, col - 1]);
  if (col < BOARD_SIZE - 1) found.push([row, col + 1]);
  return found;
}

/**
 * Entry (2,0) and vault (2,2) are the same chessboard color.
 * A walk between them needs an even number of steps, so the vault's index in the post-entry step list is odd.
 */
export function explainUnroutable(steps: readonly Step[]): string | null {
  const ordinary = steps.filter((step) => step.room !== "vault").length;
  if (ordinary > 8) return "more than 8 ordinary visits";
  const vaults = steps.filter((step) => step.room === "vault").length;
  if (vaults > 1) return "more than one vault step";
  const vaultAt = steps.findIndex((step) => step.room === "vault");
  if (vaultAt >= 0 && vaultAt % 2 === 0) {
    return "vault step must sit on an odd index so the walk from entry to vault has even length";
  }
  const alarmAt = steps.findIndex((step) => step.room === "alarm");
  if (alarmAt >= 0 && alarmAt !== steps.length - 1) return "alarm must be the final step";
  return null;
}

function rank(cell: Cell, salt: number): number {
  let hash = Math.imul(cell[0] + 3, 0x45d9f3b) ^ Math.imul(cell[1] + 5, 0x27d4eb2d) ^ salt;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

/** Self-avoiding orthogonal route for a fixed step list. Deterministic for a given salt. */
export function findRoute(steps: readonly Step[], salt: number): Cell[] | null {
  if (explainUnroutable(steps)) return null;
  const used = new Set<string>([cellKey(ENTRY)]);
  let nodes = 0;

  function walk(index: number, current: Cell): Cell[] | null {
    if (index === steps.length) return [];
    if (++nodes > 400_000) return null;
    const step = steps[index];
    if (!step) return null;
    const options = neighbors(current)
      .filter((cell) => !used.has(cellKey(cell)))
      .filter((cell) => (step.room === "vault" ? sameCell(cell, VAULT_CELL) : !sameCell(cell, VAULT_CELL)))
      .sort((a, b) => rank(a, salt + index * 17) - rank(b, salt + index * 17));
    for (const cell of options) {
      used.add(cellKey(cell));
      const rest = walk(index + 1, cell);
      if (rest) return [cell, ...rest];
      used.delete(cellKey(cell));
    }
    return null;
  }

  return walk(0, ENTRY);
}

export function findRouteAttempts(steps: readonly Step[], id: number, attempts = 16): Cell[] {
  const problem = explainUnroutable(steps);
  if (problem) throw new Error(`Round ${id} is not routable: ${problem}`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const route = findRoute(steps, id * 10007 + attempt * 997);
    if (route && route.length === steps.length) return route;
  }
  throw new Error(`Round ${id} has no legal 5×5 route`);
}
