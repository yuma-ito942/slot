import { formatMicro, formatMultiplier, grossMicro } from "../core/money";
import { FIXTURES } from "../core/fixtures";
import { LOOT_ORDER, LOOT_MILLI, VAULT_TIERS, vaultMilli } from "../core/paytable";
import type { MathAudit } from "../core/stats";
import { initialPresentation, type Beat, type Presentation } from "../core/present";
import { stakeMicro, type MachineState } from "../core/machine";
import { englishOnly } from "../launch/params";

export interface ViewHandlers {
  onPrimary: () => void;
  onSlam: () => void;
  onBet: (index: number) => void;
  onSound: () => void;
  onFast: () => void;
  onMotion: () => void;
  onRetry: () => void;
}

const ROOM_LABEL: Record<string, string> = {
  entry: "IN",
  loot: "CACHE",
  hack: "HACK",
  side: "SIDE",
  empty: "CLEAR",
  alarm: "ALARM",
  vault: "VAULT",
};

const LOOT_MARK: Record<string, string> = {
  "Data Chip": "CHIP",
  "Intel Pack": "INTEL",
  "Encrypted Drive": "DRIVE",
  "Prototype Module": "MODULE",
  "Quantum Artifact": "QUANTUM",
  "Black Case": "CASE",
};

export class RaidView {
  private readonly cells: HTMLElement[] = [];
  private readonly drone: HTMLElement;
  private readonly route: SVGPolylineElement;
  private readonly winValue: HTMLElement;
  private readonly winMult: HTMLElement;
  private readonly note: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly log: HTMLElement;
  private readonly stamp: HTMLElement;
  private readonly stampTitle: HTMLElement;
  private readonly stampBody: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly stakeLabel: HTMLElement;
  private readonly stakeValue: HTMLButtonElement;
  private readonly primary: HTMLButtonElement;
  private readonly slam: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private readonly fastButton: HTMLButtonElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly modeChip: HTMLElement;
  private readonly langChip: HTMLElement;
  private readonly errorBanner: HTMLElement;
  private readonly blocker: HTMLElement;
  private readonly blockerText: HTMLElement;
  private readonly rules: HTMLDialogElement;
  private readonly bets: HTMLDialogElement;
  private readonly costLine: HTMLElement;
  private readonly betDown: HTMLButtonElement;
  private readonly betUp: HTMLButtonElement;
  private lastWin = 0;
  private lastLog = "";
  private money = { stake: null as number | null, currency: "USD", social: false };
  private audit: MathAudit | null = null;
  private lang = "en";
  private levels: readonly number[] = [];
  private betIndex = 0;

  constructor(
    root: HTMLElement,
    private readonly handlers: ViewHandlers,
  ) {
    root.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "shell";
    shell.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <p class="kicker">Stack 07 · scripted route</p>
          <h1>Breach Protocol</h1>
        </div>
        <div class="top-meta">
          <span class="chip" id="mode-chip">Local demo</span>
          <span class="chip" id="lang-chip" hidden></span>
          <p class="balance"><span id="balance-label">Balance</span> <strong id="balance">—</strong></p>
          <button type="button" id="sound" aria-pressed="true">Sound</button>
          <button type="button" id="rules-open">Rules</button>
        </div>
      </header>
      <div class="stage">
        <div class="facility">
          <div class="board-wrap">
            <div class="board" id="board" role="img" aria-label="Security floor, 5 by 5"></div>
            <div class="drone" id="drone" aria-hidden="true">
              <span class="drone-core"></span>
            </div>
            <svg class="route" id="route" viewBox="0 0 5 5" aria-hidden="true">
              <polyline id="route-line" fill="none"></polyline>
            </svg>
            <div class="stamp" id="stamp" hidden>
              <p class="stamp-kicker">Debrief</p>
              <p class="stamp-title" id="stamp-title"></p>
              <p class="stamp-body" id="stamp-body"></p>
            </div>
          </div>
        </div>
        <aside class="readout">
          <p class="ghost" id="ghost" hidden></p>
          <p class="readout-label" id="loot-label">Secured loot</p>
          <p class="win" id="win" aria-live="polite">0.00</p>
          <p class="win-mult" id="win-mult">0.00×</p>
          <p class="note" id="note">Awaiting insertion</p>
          <p class="cost-line" id="cost-line">Base mode · cost 1.00×</p>
          <ol class="log" id="log"></ol>
        </aside>
      </div>
      <footer class="dock">
        <div class="stake-control">
          <button type="button" id="bet-down" aria-label="Decrease stake">−</button>
          <button type="button" id="stake-value" class="stake-value">—</button>
          <button type="button" id="bet-up" aria-label="Increase stake">+</button>
        </div>
        <button type="button" id="primary" class="primary">Play</button>
        <div class="dock-tools">
          <button type="button" id="slam" hidden>Skip</button>
          <button type="button" id="fast" aria-pressed="false">Fast</button>
          <button type="button" id="motion" aria-pressed="false">Reduce motion</button>
        </div>
      </footer>
      <p class="banner" id="error-banner" role="alert" hidden></p>
      <div class="blocker" id="blocker" hidden>
        <div class="blocker-card">
          <p class="kicker">Session</p>
          <h2>Round unavailable</h2>
          <p id="blocker-text"></p>
          <button type="button" id="retry">Retry</button>
        </div>
      </div>
      <dialog id="rules"></dialog>
      <dialog id="bets"></dialog>
    `;
    root.append(shell);
    this.drone = shell.querySelector("#drone") as HTMLElement;
    this.route = shell.querySelector("#route-line") as SVGPolylineElement;
    this.winValue = shell.querySelector("#win") as HTMLElement;
    this.winMult = shell.querySelector("#win-mult") as HTMLElement;
    this.note = shell.querySelector("#note") as HTMLElement;
    this.ghost = shell.querySelector("#ghost") as HTMLElement;
    this.log = shell.querySelector("#log") as HTMLElement;
    this.stamp = shell.querySelector("#stamp") as HTMLElement;
    this.stampTitle = shell.querySelector("#stamp-title") as HTMLElement;
    this.stampBody = shell.querySelector("#stamp-body") as HTMLElement;
    this.balance = shell.querySelector("#balance") as HTMLElement;
    this.stakeLabel = shell.querySelector("#loot-label") as HTMLElement;
    this.stakeValue = shell.querySelector("#stake-value") as HTMLButtonElement;
    this.primary = shell.querySelector("#primary") as HTMLButtonElement;
    this.slam = shell.querySelector("#slam") as HTMLButtonElement;
    this.soundButton = shell.querySelector("#sound") as HTMLButtonElement;
    this.fastButton = shell.querySelector("#fast") as HTMLButtonElement;
    this.motionButton = shell.querySelector("#motion") as HTMLButtonElement;
    this.modeChip = shell.querySelector("#mode-chip") as HTMLElement;
    this.langChip = shell.querySelector("#lang-chip") as HTMLElement;
    this.errorBanner = shell.querySelector("#error-banner") as HTMLElement;
    this.blocker = shell.querySelector("#blocker") as HTMLElement;
    this.blockerText = shell.querySelector("#blocker-text") as HTMLElement;
    this.rules = shell.querySelector("#rules") as HTMLDialogElement;
    this.bets = shell.querySelector("#bets") as HTMLDialogElement;
    this.costLine = shell.querySelector("#cost-line") as HTMLElement;
    this.betDown = shell.querySelector("#bet-down") as HTMLButtonElement;
    this.betUp = shell.querySelector("#bet-up") as HTMLButtonElement;

    const board = shell.querySelector("#board") as HTMLElement;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const cell = document.createElement("div");
        cell.className = "cell is-sealed";
        const mark = document.createElement("span");
        mark.className = "cell-mark";
        const name = document.createElement("span");
        name.className = "cell-name";
        cell.append(mark, name);
        board.append(cell);
        this.cells.push(cell);
      }
    }
    const routeSvg = shell.querySelector("#route") as SVGElement;
    board.append(this.drone, routeSvg);

    this.primary.addEventListener("click", () => this.handlers.onPrimary());
    this.slam.addEventListener("click", () => this.handlers.onSlam());
    this.soundButton.addEventListener("click", () => this.handlers.onSound());
    this.fastButton.addEventListener("click", () => this.handlers.onFast());
    this.motionButton.addEventListener("click", () => this.handlers.onMotion());
    this.betDown.addEventListener("click", () => this.handlers.onBet(-1));
    this.betUp.addEventListener("click", () => this.handlers.onBet(1));
    this.stakeValue.addEventListener("click", () => this.openBets());
    shell.querySelector("#rules-open")?.addEventListener("click", () => this.openRules());
    shell.querySelector("#retry")?.addEventListener("click", () => this.handlers.onRetry());
    this.rules.addEventListener("click", (event) => {
      if (event.target === this.rules) this.rules.close();
    });
    this.bets.addEventListener("click", (event) => {
      if (event.target === this.bets) this.bets.close();
    });
    this.show(initialPresentation());
  }

  setPreferences(sound: boolean, fast: boolean, reduced: boolean): void {
    this.soundButton.setAttribute("aria-pressed", String(sound));
    this.soundButton.textContent = sound ? "Sound on" : "Sound off";
    this.fastButton.setAttribute("aria-pressed", String(fast));
    this.motionButton.setAttribute("aria-pressed", String(reduced));
    document.documentElement.classList.toggle("is-reduced", reduced);
  }

  setAudit(audit: MathAudit | null): void {
    this.audit = audit;
  }

  setLanguage(lang: string): void {
    this.lang = lang;
    const foreign = !englishOnly(lang);
    this.langChip.hidden = !foreign;
    this.langChip.textContent = foreign ? `${lang} unavailable · English` : "";
  }

  setMoney(stake: number | null, currency: string, social: boolean): void {
    this.money = { stake, currency, social };
  }

  show(state: Presentation, beat?: Beat): void {
    const shell = this.primary.closest(".shell");
    shell?.classList.toggle("is-alarm", state.alarm);
    this.cells.forEach((cell, index) => {
      const row = Math.floor(index / 5);
      const col = index % 5;
      const room = state.rooms[`${row},${col}`];
      cell.className = "cell";
      const mark = cell.querySelector(".cell-mark") as HTMLElement;
      const name = cell.querySelector(".cell-name") as HTMLElement;
      if (!room) {
        cell.classList.add("is-sealed");
        if (row === 2 && col === 2) {
          cell.classList.add("is-vault-sealed");
          name.textContent = "VAULT";
        } else if (row === 2 && col === 0) {
          cell.classList.add("is-entry-sealed");
          name.textContent = "IN";
        } else {
          name.textContent = "";
        }
        mark.textContent = "";
        return;
      }
      cell.classList.add("is-open", `room-${room.room}`);
      if (room.item) cell.dataset.item = room.item;
      else delete cell.dataset.item;
      if (state.operative[0] === row && state.operative[1] === col) cell.classList.add("is-hot");
      if (room.room === "vault" && state.vaultOpen) cell.classList.add("is-vault-open");
      if (room.room === "alarm") cell.classList.add("is-alarm-cell");
      name.textContent = (room.item && LOOT_MARK[room.item]) || ROOM_LABEL[room.room] || "";
      mark.textContent = room.room === "alarm" ? "!" : room.room === "hack" ? "#" : "";
    });
    this.drone.style.setProperty("--row", String(state.operative[0]));
    this.drone.style.setProperty("--col", String(state.operative[1]));
    this.route.setAttribute("points", state.trail.map((cell) => `${cell[1] + 0.5},${cell[0] + 0.5}`).join(" "));
    this.note.textContent = state.note;
    if (state.ghostFactor && state.ghostFactor > 1) {
      this.ghost.hidden = false;
      this.ghost.textContent = `Ghost run ×${state.ghostFactor}`;
      this.ghost.classList.add("is-hot");
    } else if (state.ghostFactor === 1) {
      this.ghost.hidden = false;
      this.ghost.textContent = "Standard protocol";
      this.ghost.classList.remove("is-hot");
    } else {
      this.ghost.hidden = true;
      this.ghost.textContent = "";
    }
    if (beat?.sound === "start") {
      this.log.replaceChildren();
      this.lastLog = "";
      this.lastWin = 0;
    }
    const increased = state.winMilli > this.lastWin;
    this.lastWin = state.winMilli;
    this.winValue.classList.toggle("is-pulse", increased && state.winMilli > 0);
    this.winMult.textContent = formatMultiplier(state.winMilli);
    this.winValue.textContent = currencyWin(state.winMilli, this.money.stake, this.money.currency, this.money.social);
    const debrief = describe(state);
    this.stamp.hidden = debrief === null;
    if (debrief) {
      this.stampTitle.textContent = debrief.title;
      this.stampBody.textContent = debrief.body;
      this.stamp.dataset.status = state.status ?? "";
    }
    if (beat && beat.detail && beat.detail !== this.lastLog && beat.sound !== "tick" && beat.sound !== "start") {
      this.lastLog = beat.detail;
      const item = document.createElement("li");
      item.textContent = beat.detail;
      this.log.append(item);
      while (this.log.children.length > 6) this.log.firstElementChild?.remove();
    }
  }

  resetRound(): void {
    this.lastWin = 0;
    this.lastLog = "";
    this.log.replaceChildren();
    this.show(initialPresentation());
  }

  sync(machine: MachineState, costMultiplier: number, mode: string): void {
    const social = machine.social;
    this.stakeLabel.textContent = "Secured loot";
    const balanceLabel = this.balance.parentElement?.querySelector("#balance-label");
    if (balanceLabel) balanceLabel.textContent = social ? "Credits" : "Balance";
    const replay = machine.replay;
    this.balance.parentElement?.toggleAttribute("hidden", replay);
    if (!replay && machine.balanceMicro !== null) {
      this.balance.textContent = formatMicro(machine.balanceMicro, machine.currency, social);
    }
    const stake = replay ? this.money.stake : stakeMicro(machine);
    if (!replay && stake !== null) {
      this.stakeValue.textContent = formatMicro(stake, machine.currency, social);
    }
    if (replay) {
      this.stakeValue.textContent =
        this.money.stake === null ? "Replay" : formatMicro(this.money.stake, machine.currency, social);
    }
    this.stakeValue.disabled = replay || (machine.phase !== "READY" && machine.phase !== "RESULT");
    this.betDown.disabled = this.stakeValue.disabled || machine.betIndex <= 0;
    this.betUp.disabled = this.stakeValue.disabled || machine.betIndex >= machine.betLevelsMicro.length - 1;
    const playable =
      machine.phase === "READY" ||
      machine.phase === "RESULT" ||
      machine.phase === "REPLAY_READY" ||
      machine.phase === "REPLAY_DONE";
    this.primary.disabled = !playable;
    this.primary.textContent = primaryLabel(machine.phase, social);
    const live = machine.phase === "ANIMATING" || machine.phase === "REPLAY_ANIMATING";
    this.slam.hidden = !(live && machine.slamAllowed);
    this.levels = machine.betLevelsMicro;
    this.betIndex = machine.betIndex;
    this.modeChip.textContent = machine.demo ? "Local demo" : replay ? "Replay" : "Live session";
    this.costLine.textContent = `${mode} · cost ${costMultiplier.toFixed(2)}×`;
    if (machine.phase === "ERROR") {
      this.blocker.hidden = false;
      this.blockerText.textContent = machine.error ?? "The session could not be recovered.";
      this.errorBanner.hidden = true;
    } else {
      this.blocker.hidden = true;
      if (machine.error) {
        this.errorBanner.hidden = false;
        this.errorBanner.textContent = machine.error;
      } else {
        this.errorBanner.hidden = true;
        this.errorBanner.textContent = "";
      }
    }
    document.querySelector(".stake-control")?.toggleAttribute("hidden", replay);
  }

  private openRules(): void {
    this.rules.replaceChildren();
    const close = document.createElement("button");
    close.type = "button";
    close.className = "dialog-close";
    close.textContent = "Close";
    close.addEventListener("click", () => this.rules.close());
    const body = document.createElement("div");
    body.className = "dialog-body";
    body.append(rulesIntro(this.audit), paytableBlock(), rulesMath(this.audit), rulesPlay(this.lang), fixtureBlock());
    this.rules.append(close, body);
    this.rules.showModal();
  }

  private openBets(): void {
    if (this.stakeValue.disabled) return;
    this.bets.replaceChildren();
    const close = document.createElement("button");
    close.type = "button";
    close.className = "dialog-close";
    close.textContent = "Close";
    close.addEventListener("click", () => this.bets.close());
    const list = document.createElement("div");
    list.className = "bet-list";
    const title = document.createElement("h2");
    title.textContent = this.money.social ? "Play amount" : "Stake";
    list.append(title);
    this.levels.forEach((level, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = formatMicro(level, this.money.currency, this.money.social);
      if (index === this.betIndex) button.classList.add("is-current");
      button.addEventListener("click", () => {
        this.handlers.onBet(index - this.betIndex);
        this.bets.close();
      });
      list.append(button);
    });
    this.bets.append(close, list);
    this.bets.showModal();
  }
}

function primaryLabel(phase: MachineState["phase"], social: boolean): string {
  if (phase === "BET_PENDING") return "Locking";
  if (phase === "ANIMATING" || phase === "REPLAY_ANIMATING") return "In raid";
  if (phase === "SETTLING") return "Settling";
  if (phase === "REPLAY_LOADING") return "Loading";
  if (phase === "REPLAY_READY") return "Play replay";
  if (phase === "REPLAY_DONE") return "Play again";
  if (phase === "ERROR" || phase === "AUTHENTICATING" || phase === "BOOT") return social ? "Wait" : "Play";
  return "Play";
}

function describe(state: Presentation): { title: string; body: string } | null {
  if (state.status === "INTERCEPTED" && state.vaultOpen) {
    return {
      title: "INTERCEPTED",
      body: "The vault paid, then the alarm shut the floor. Loot already taken still counts.",
    };
  }
  if (state.status === "INTERCEPTED") {
    return { title: "INTERCEPTED", body: "The alarm shut the floor. Loot already taken still counts." };
  }
  if (state.status === "VAULT SECURED") {
    return { title: "VAULT SECURED", body: "The central vault opened on this route." };
  }
  if (state.status === "EXTRACTED") {
    return { title: "EXTRACTED", body: "The route ended clear." };
  }
  return null;
}

function section(title: string): HTMLElement {
  const wrap = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = title;
  wrap.append(heading);
  return wrap;
}

function paragraph(text: string): HTMLParagraphElement {
  const node = document.createElement("p");
  node.textContent = text;
  return node;
}

function rulesIntro(audit: MathAudit | null): HTMLElement {
  const block = section("One wager, one route");
  block.append(
    paragraph(
      "Each play is a single stake. The route, rooms, and payout are already fixed when the raid animation starts. Nothing you tap during the raid changes the result. Hack terminals and side passages are part of that script.",
    ),
    paragraph(
      "The animation is illustrative. Winnings are determined by the round result supplied to the game, not by the timing or appearance of the animation. If a round is interrupted, reload and recover the session. The long-run return is not a promise for any single play.",
    ),
  );
  if (audit) {
    block.append(
      paragraph(
        "This build plays a local demonstration book. It is not an approved Stake Engine deployment. Figures below are the exact weighted totals of that book.",
      ),
    );
  }
  return block;
}

function paytableBlock(): HTMLElement {
  const block = section("Values");
  const list = document.createElement("ul");
  list.className = "pay-list";
  for (const item of LOOT_ORDER) {
    const row = document.createElement("li");
    row.textContent = `${item}  ${formatMultiplier(LOOT_MILLI[item])}`;
    list.append(row);
  }
  for (const tier of VAULT_TIERS) {
    const row = document.createElement("li");
    row.textContent = `Central vault ${tier}×  ${formatMultiplier(vaultMilli(tier))}`;
    list.append(row);
  }
  const ghost = document.createElement("li");
  ghost.textContent = "Ghost run  ×1, ×2, or ×3 on every cash award, including the vault. Declared before the first award. No stacking.";
  list.append(ghost);
  block.append(
    list,
    paragraph("Hack, side passage, empty rooms, and the alarm pay 0. An alarm ends the route. Loot already credited still pays. At most eight ordinary loot awards, and at most one vault."),
  );
  return block;
}

function rulesMath(audit: MathAudit | null): HTMLElement {
  const block = section("Return");
  if (!audit) {
    block.append(paragraph("Return, hit rate, and maximum win are published with the certified math package for this version."));
    return block;
  }
  block.append(
    paragraph(`Exact book return ${percent(audit.rtp)}. Hit rate ${percent(audit.hitRate)} (${oneIn(audit.hitRate)}).`),
    paragraph(
      `Designed ceiling ${formatMultiplier(audit.maxMilli)}, and that outcome is in the book at ${oneIn(audit.maxFrequency)}. Standard deviation ${audit.standardDeviation.toFixed(2)}×.`,
    ),
  );
  const bars = document.createElement("div");
  bars.className = "bands";
  for (const band of audit.bands) {
    const row = document.createElement("div");
    row.className = "band";
    const label = document.createElement("span");
    label.textContent = `${band.label}  ${percent(band.weight / audit.totalWeight)}`;
    const track = document.createElement("span");
    track.className = "band-track";
    const fill = document.createElement("span");
    fill.className = "band-fill";
    fill.style.width = `${(band.weight / audit.totalWeight) * 100}%`;
    track.append(fill);
    row.append(label, track);
    bars.append(row);
  }
  block.append(bars);
  return block;
}

function rulesPlay(lang: string): HTMLElement {
  const block = section("Controls");
  block.append(
    paragraph("Play or Space starts the next round when the previous one has settled. Stake plus and minus move through the allowed amounts. Sound, fast playback, and reduced motion do not change the payout."),
    paragraph("Fast playback still shows each credited amount. Reduced motion removes the travel and alarm pulse."),
  );
  if (!englishOnly(lang)) {
    block.append(paragraph(`Language “${lang}” is not in this build. The interface stays in English.`));
  }
  return block;
}

function fixtureBlock(): HTMLElement {
  const block = section("Replay fixtures");
  block.append(paragraph("Replay never places a wager. These local event ids cover the approval scenarios when no session is attached."));
  const list = document.createElement("ul");
  const entries: Array<[string, number]> = [
    ["Loss", FIXTURES.loss],
    ["Normal win", FIXTURES.normal],
    ["High win", FIXTURES.high],
    ["Max win", FIXTURES.max],
    ["Vault", FIXTURES.vault],
  ];
  for (const [label, id] of entries) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `?replay=true&event=${id}&mode=BASE&amount=1000000&currency=USD`;
    link.textContent = `${label} · event ${id}`;
    item.append(link);
    list.append(item);
  }
  block.append(list);
  return block;
}

function currencyWin(milli: number, stake: number | null, currency: string, social: boolean): string {
  if (stake === null) return formatMultiplier(milli);
  try {
    return formatMicro(grossMicro(stake, milli), currency, social);
  } catch {
    return formatMultiplier(milli);
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function oneIn(probability: number): string {
  if (probability <= 0) return "none";
  return `1 in ${Math.round(1 / probability).toLocaleString("en-US")}`;
}
