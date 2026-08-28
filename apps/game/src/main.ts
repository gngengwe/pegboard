import type { Mode } from "@pegboard/commentary";
import { CribbageGame, type Card, type CardId, type GameEvent, type PlayerId } from "@pegboard/engine";
import { chooseBeginnerDiscard, chooseBeginnerPlay } from "./bot.js";
import { MatchCommentary } from "./commentaryClient.js";
import { recordMatch, summarize } from "./telemetry.js";
import "./style.css";

const HUMAN: PlayerId = "south";
const BOT: PlayerId = "north";
const BOT_DELAY_MS = 700;

const el = {
  commentaryToggle: document.getElementById("commentary-toggle") as HTMLInputElement,
  commentaryModeSelect: document.getElementById("commentary-mode-select") as HTMLSelectElement,
  commentary: document.getElementById("commentary") as HTMLElement,
  feed: document.getElementById("commentary-feed") as HTMLElement,
  scoreNorth: document.getElementById("score-north") as HTMLElement,
  scoreSouth: document.getElementById("score-south") as HTMLElement,
  targetScoreLabel: document.getElementById("target-score") as HTMLElement,
  runningCount: document.getElementById("running-count") as HTMLElement,
  starterCard: document.getElementById("starter-card") as HTMLElement,
  turnBanner: document.getElementById("turn-banner") as HTMLElement,
  sideNorth: document.getElementById("side-north") as HTMLElement,
  sideSouth: document.getElementById("side-south") as HTMLElement,
  pegStack: document.getElementById("peg-stack") as HTMLElement,
  northHandBacks: document.getElementById("north-hand-backs") as HTMLElement,
  handCount: document.getElementById("hand-count") as HTMLElement,
  handCountGrid: document.getElementById("hand-count-grid") as HTMLElement,
  handCountContinue: document.getElementById("hand-count-continue") as HTMLButtonElement,
  discardPanel: document.getElementById("discard-panel") as HTMLElement,
  discardHand: document.getElementById("discard-hand") as HTMLElement,
  discardConfirm: document.getElementById("discard-confirm") as HTMLButtonElement,
  discardCribOwner: document.getElementById("discard-crib-owner") as HTMLElement,
  playPanel: document.getElementById("play-panel") as HTMLElement,
  playHand: document.getElementById("play-hand") as HTMLElement,
  playHint: document.getElementById("play-hint") as HTMLElement,
  winPanel: document.getElementById("win-panel") as HTMLElement,
  winTitle: document.getElementById("win-title") as HTMLElement,
  winDetail: document.getElementById("win-detail") as HTMLElement,
  winCaption: document.getElementById("win-caption") as HTMLElement,
  rematch: document.getElementById("rematch") as HTMLButtonElement,
  startControls: document.getElementById("start-controls") as HTMLElement,
  targetSelect: document.getElementById("target-select") as HTMLSelectElement,
  newGame: document.getElementById("new-game") as HTMLButtonElement,
  sessionStats: document.getElementById("session-stats") as HTMLElement,
};

let game: CribbageGame | null = null;
let commentary: MatchCommentary | null = null;
let commentaryEnabled = true;
let matchStartedAt = 0;
let selectedDiscards: CardId[] = [];
let prevScores = { north: 0, south: 0 };
/** Which seat played each card in the current pegging segment — the engine's
 * projection doesn't carry this, so it's rebuilt client-side from events. */
let pegStackOwners: { player: PlayerId; cardId: CardId }[] = [];

function cardLabel(card: Card): { text: string; red: boolean } {
  const suitSymbol = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[card.suit];
  const red = card.suit === "diamonds" || card.suit === "hearts";
  return { text: `${card.rank}${suitSymbol}`, red };
}

/** Small non-interactive card used inside a hand-count combo row, glow-tinted
 * by scoring type so a player can see *which* cards made each fifteen/run/pair
 * instead of only reading a number. */
function renderComboCard(card: Card, scoreType: string): HTMLElement {
  const { text, red } = cardLabel(card);
  const div = document.createElement("div");
  div.className = `card hand-count-card hand-count-card--${scoreType} ${red ? "card--red" : ""}`.trim();
  div.textContent = text;
  return div;
}

/** Purely-decorative cards (peg stack, starter) — never focusable, never interactive. */
function renderCard(card: Card, extraClass = "", owner?: PlayerId): HTMLElement {
  const { text, red } = cardLabel(card);
  const div = document.createElement("div");
  const ownerClass = owner ? `card--owner-${owner}` : "";
  div.className = `card ${red ? "card--red" : ""} ${extraClass} ${ownerClass}`.trim();
  div.textContent = text;
  if (owner) {
    const badge = document.createElement("span");
    badge.className = "card__owner";
    badge.textContent = owner === "north" ? "N" : "S";
    div.appendChild(badge);
  }
  return div;
}

/**
 * A card the player can actually act on. Real `<button>` elements so
 * keyboard users (Tab to reach it, Enter/Space to activate — native button
 * behavior, no custom keydown handling needed) and screen readers can use
 * them exactly like the surrounding confirm/continue/new-game buttons
 * already work. `disabled` cards stay in the DOM and are announced (with a
 * reason), rather than just being visually dimmed and invisible to AT.
 */
function renderActionableCard(
  card: Card,
  options: { selected?: boolean; disabled?: boolean; disabledReason?: string; onActivate?: () => void }
): HTMLButtonElement {
  const { text, red } = cardLabel(card);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `card card--playable ${red ? "card--red" : ""} ${options.selected ? "card--selected" : ""}`.trim();
  button.textContent = text;
  const label = options.disabled && options.disabledReason ? `${text}, ${options.disabledReason}` : text;
  button.setAttribute("aria-label", label);
  if (options.disabled) {
    button.disabled = true;
  } else if (options.onActivate) {
    button.addEventListener("click", options.onActivate);
  }
  return button;
}

/** Last line the booth said — reused in the win panel so the payoff line
 * isn't only visible if you happened to be looking at the sidebar feed. */
let lastCaptionText: string | null = null;

function appendCaption(voice: "pbp" | "color", text: string): void {
  lastCaptionText = text;
  const div = document.createElement("div");
  div.className = `caption caption--${voice}`;
  const label = document.createElement("span");
  label.className = "caption__voice";
  label.textContent = voice === "pbp" ? "Play-by-play" : "Color";
  div.appendChild(label);
  div.appendChild(document.createTextNode(text));
  el.feed.appendChild(div);
  el.feed.scrollTop = el.feed.scrollHeight;
}

function processEvents(events: readonly GameEvent[]): void {
  for (const event of events) {
    if (event.type === "CardPlayed") {
      pegStackOwners.push({ player: event.player, cardId: event.card });
    } else if (event.type === "SegmentEnded" || event.type === "HandDealt") {
      pegStackOwners = [];
    }
  }

  if (!commentaryEnabled || !commentary || !game) return;
  const projection = game.getProjection();
  const captions = commentary.process(events, projection, projection.dealer);
  for (const caption of captions) {
    appendCaption(caption.voice, caption.text);
  }
}

function showHandCountIfPresent(events: readonly GameEvent[]): void {
  const scored = events.filter((e) => e.type === "HandScored");
  if (scored.length === 0 || !game || game.winner) return;

  el.handCountGrid.innerHTML = "";
  for (const event of scored) {
    if (event.type !== "HandScored") continue;
    const col = document.createElement("div");
    col.className = "hand-count__col";
    const title = document.createElement("h3");
    title.textContent = `${event.player.toUpperCase()} ${event.source === "crib" ? "crib" : "hand"}`;
    col.appendChild(title);
    const list = document.createElement("ul");
    for (const entry of event.entries) {
      const li = document.createElement("li");
      const cardRow = document.createElement("div");
      cardRow.className = "hand-count__cards";
      cardRow.append(...entry.cards.map((c) => renderComboCard(c, entry.type)));
      li.appendChild(cardRow);
      const label = document.createElement("span");
      label.className = "hand-count__combo-label";
      label.textContent = `${entry.label} — ${entry.points}`;
      li.appendChild(label);
      list.appendChild(li);
    }
    col.appendChild(list);
    const total = document.createElement("div");
    total.className = "hand-count__total";
    total.textContent = `${event.points} points`;
    col.appendChild(total);
    el.handCountGrid.appendChild(col);
  }
  el.handCount.hidden = false;
}

/** Retriggers a CSS animation on `target` even if one is already mid-run —
 * removing the class doesn't do it alone since the browser coalesces the
 * add/remove within the same frame, so a reflow read is forced in between. */
function bump(target: HTMLElement, className: string): void {
  target.classList.remove(className);
  void target.offsetWidth;
  target.classList.add(className);
}

function render(): void {
  if (!game) return;
  const pub = game.getProjection();
  const south = game.getProjection(HUMAN);
  const north = game.getProjection(BOT);

  if (pub.scores.north !== prevScores.north) bump(el.scoreNorth, "scoreboard__score--bump");
  if (pub.scores.south !== prevScores.south) bump(el.scoreSouth, "scoreboard__score--bump");
  prevScores = { north: pub.scores.north, south: pub.scores.south };

  el.scoreNorth.textContent = String(pub.scores.north);
  el.scoreSouth.textContent = String(pub.scores.south);
  el.targetScoreLabel.textContent = String(pub.targetScore);
  el.runningCount.textContent = String(pub.runningCount);

  el.starterCard.replaceChildren();
  if (pub.starter) {
    const { text, red } = cardLabel(pub.starter);
    el.starterCard.textContent = text;
    el.starterCard.classList.toggle("card--red", red);
    el.starterCard.classList.remove("card--placeholder");
  } else {
    el.starterCard.textContent = "—";
    el.starterCard.classList.add("card--placeholder");
  }

  el.pegStack.replaceChildren(
    ...pub.pegStack.map((c) => {
      const owner = pegStackOwners.find((o) => o.cardId === c.id)?.player;
      return renderCard(c, "", owner);
    })
  );
  el.northHandBacks.replaceChildren(
    ...north.remainingToPlay?.map(() => {
      const back = document.createElement("div");
      back.className = "card-back";
      return back;
    }) ?? (north.ownHand ?? []).map(() => {
      const back = document.createElement("div");
      back.className = "card-back";
      return back;
    })
  );

  el.discardPanel.hidden = true;
  el.playPanel.hidden = true;
  // Tear down stale card listeners whenever leaving either panel's active
  // condition below — otherwise the last hand's card elements (bound to
  // card ids that no longer exist once a new hand deals) sit hidden in the
  // DOM with live listeners, and a non-mouse activation path (synthetic
  // event, assistive tech, an automated driver) could fire a discard/play
  // command against the wrong phase and throw uncaught.
  el.discardHand.replaceChildren();
  el.discardConfirm.disabled = true;
  el.playHand.replaceChildren();

  // Whose move is it, in plain language — this is the single source of truth
  // for "who is who" at any moment, independent of which panel is showing.
  el.sideNorth.classList.remove("scoreboard__side--active");
  el.sideSouth.classList.remove("scoreboard__side--active");
  if (pub.phase === "DISCARD_TO_CRIB" || pub.phase === "PEGGING") {
    el.turnBanner.hidden = false;
    if (pub.phase === "DISCARD_TO_CRIB") {
      el.turnBanner.textContent = "Your turn.";
      el.turnBanner.dataset.turn = "south";
      el.sideSouth.classList.add("scoreboard__side--active");
    } else {
      const isHuman = pub.turnPlayer === HUMAN;
      el.turnBanner.textContent = isHuman ? "Your turn — play a card." : "North is thinking…";
      el.turnBanner.dataset.turn = isHuman ? "south" : "north";
      (isHuman ? el.sideSouth : el.sideNorth).classList.add("scoreboard__side--active");
    }
  } else {
    el.turnBanner.hidden = true;
  }

  if (pub.phase === "DISCARD_TO_CRIB" && south.ownHand?.length === 6) {
    el.discardPanel.hidden = false;
    el.discardCribOwner.textContent = pub.dealer === HUMAN ? "your" : "North's";
    el.discardHand.replaceChildren(
      ...south.ownHand.map((card) =>
        renderActionableCard(card, {
          selected: selectedDiscards.includes(card.id),
          onActivate: () => toggleDiscard(card.id),
        })
      )
    );
    el.discardConfirm.disabled = selectedDiscards.length !== 2;
  }

  if (pub.phase === "PEGGING") {
    el.playPanel.hidden = false;
    const isHuman = pub.turnPlayer === HUMAN;
    const legal = isHuman ? south.legalPlays : [];
    el.playHint.textContent = isHuman
      ? legal.length > 0
        ? "Your turn — play a card."
        : "No legal play — go."
      : "North is thinking…";
    el.playHand.replaceChildren(
      ...(south.remainingToPlay ?? []).map((card) => {
        const isLegal = isHuman && legal.includes(card.id);
        return renderActionableCard(card, {
          disabled: !isLegal,
          disabledReason: isHuman ? "not currently playable" : "waiting for North",
          onActivate: () => humanPlay(card.id),
        });
      })
    );
  }

  el.winPanel.hidden = pub.winner === null;
  if (pub.winner) {
    el.winTitle.textContent = pub.winner === HUMAN ? "You win" : "North wins";
    el.winDetail.textContent = `${pub.scores.south} – ${pub.scores.north}`;
    el.winCaption.textContent = commentaryEnabled && lastCaptionText ? lastCaptionText : "";
  }

  el.startControls.hidden = pub.phase !== "GAME_COMPLETE";
  const matchActive = pub.phase !== "GAME_COMPLETE";
  el.commentaryToggle.disabled = matchActive;
  el.commentaryModeSelect.disabled = matchActive || !el.commentaryToggle.checked;
}

function toggleDiscard(id: CardId): void {
  if (selectedDiscards.includes(id)) {
    selectedDiscards = selectedDiscards.filter((c) => c !== id);
  } else if (selectedDiscards.length < 2) {
    selectedDiscards = [...selectedDiscards, id];
  }
  render();
}

function humanPlay(id: CardId): void {
  if (!game) return;
  const events = game.playCard(HUMAN, id);
  processEvents(events);
  showHandCountIfPresent(events);
  finishTurn(events);
}

function finishTurn(events: readonly GameEvent[]): void {
  render();
  checkGameOver(events);
  scheduleBotIfNeeded();
}

function checkGameOver(events: readonly GameEvent[]): void {
  if (!game) return;
  if (events.some((e) => e.type === "GameWon")) {
    recordMatch({
      commentaryEnabled,
      result: "completed",
      durationMs: Date.now() - matchStartedAt,
      timestamp: Date.now(),
    });
    renderSessionStats();
  }
}

/**
 * Records the CURRENT match as abandoned if one is genuinely in progress
 * (started, not yet won). Without this, the "abandoned" side of the
 * commentary-on-vs-off comparison this MVP exists to produce was never
 * populated at all — every match either completed or vanished with no
 * record, making the one metric this build order depends on unmeasurable.
 * Safe to call speculatively (e.g. before starting a fresh match, or on
 * `beforeunload`) since it no-ops once a game has already been won.
 */
function recordAbandonedIfInProgress(): void {
  if (!game || game.winner) return;
  recordMatch({
    commentaryEnabled,
    result: "abandoned",
    durationMs: Date.now() - matchStartedAt,
    timestamp: Date.now(),
  });
  renderSessionStats();
}

function renderSessionStats(): void {
  el.sessionStats.textContent = summarize();
}

window.addEventListener("beforeunload", recordAbandonedIfInProgress);

function scheduleBotIfNeeded(): void {
  if (!game || game.winner) return;

  if (game.phase === "DISCARD_TO_CRIB" && game.getProjection(BOT).ownHand?.length === 6) {
    const hand = game.getProjection(BOT).ownHand!;
    const [a, b] = chooseBeginnerDiscard(hand);
    const events = game.discard(BOT, [a, b]);
    processEvents(events);
    showHandCountIfPresent(events);
    render();
    checkGameOver(events);
    scheduleBotIfNeeded();
    return;
  }

  if (game.phase === "PEGGING" && game.turnPlayer === BOT) {
    setTimeout(() => {
      if (!game || game.turnPlayer !== BOT) return;
      const legalIds = game.getLegalPlays(BOT);
      const hand = game.getProjection(BOT).remainingToPlay ?? [];
      const legalCards = hand.filter((c) => legalIds.includes(c.id));
      const runningCount = game.getProjection().runningCount;
      const chosen = chooseBeginnerPlay(legalCards, runningCount);
      const events = game.playCard(BOT, chosen);
      processEvents(events);
      showHandCountIfPresent(events);
      finishTurn(events);
    }, BOT_DELAY_MS);
  }
}

function startNewGame(): void {
  recordAbandonedIfInProgress(); // catches "New game"/"Rematch" clicked mid-match

  const targetScore = Number(el.targetSelect.value) as 61 | 121;
  const mode = el.commentaryModeSelect.value as Mode;
  commentaryEnabled = el.commentaryToggle.checked;
  el.commentary.dataset.enabled = String(commentaryEnabled);
  el.feed.replaceChildren();
  el.handCount.hidden = true;
  selectedDiscards = [];
  pegStackOwners = [];
  prevScores = { north: 0, south: 0 };
  matchStartedAt = Date.now();

  game = new CribbageGame({ targetScore });
  commentary = new MatchCommentary(crypto.randomUUID(), mode, targetScore);
  const events = game.start();
  processEvents(events);
  render();
  scheduleBotIfNeeded();
}

el.commentaryToggle.addEventListener("change", () => {
  el.commentaryModeSelect.disabled = !el.commentaryToggle.checked;
});

el.discardConfirm.addEventListener("click", () => {
  if (!game || selectedDiscards.length !== 2) return;
  const [a, b] = selectedDiscards as [CardId, CardId];
  selectedDiscards = [];
  const events = game.discard(HUMAN, [a, b]);
  processEvents(events);
  showHandCountIfPresent(events);
  finishTurn(events);
});

el.handCountContinue.addEventListener("click", () => {
  el.handCount.hidden = true;
});

el.newGame.addEventListener("click", startNewGame);
el.rematch.addEventListener("click", startNewGame);

render();
renderSessionStats();
