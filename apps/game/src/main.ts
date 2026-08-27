import { CribbageGame, type Card, type CardId, type GameEvent, type PlayerId } from "@pegboard/engine";
import { chooseBeginnerDiscard, chooseBeginnerPlay } from "./bot.js";
import { captionsForEvent } from "./commentary.js";
import { recordMatch } from "./telemetry.js";
import "./style.css";

const HUMAN: PlayerId = "south";
const BOT: PlayerId = "north";
const BOT_DELAY_MS = 700;

const el = {
  commentaryToggle: document.getElementById("commentary-toggle") as HTMLInputElement,
  commentary: document.getElementById("commentary") as HTMLElement,
  feed: document.getElementById("commentary-feed") as HTMLElement,
  scoreNorth: document.getElementById("score-north") as HTMLElement,
  scoreSouth: document.getElementById("score-south") as HTMLElement,
  targetScoreLabel: document.getElementById("target-score") as HTMLElement,
  runningCount: document.getElementById("running-count") as HTMLElement,
  starterCard: document.getElementById("starter-card") as HTMLElement,
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
  rematch: document.getElementById("rematch") as HTMLButtonElement,
  startControls: document.getElementById("start-controls") as HTMLElement,
  targetSelect: document.getElementById("target-select") as HTMLSelectElement,
  newGame: document.getElementById("new-game") as HTMLButtonElement,
};

let game: CribbageGame | null = null;
let commentaryEnabled = true;
let matchStartedAt = 0;
let selectedDiscards: CardId[] = [];

function cardLabel(card: Card): { text: string; red: boolean } {
  const suitSymbol = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[card.suit];
  const red = card.suit === "diamonds" || card.suit === "hearts";
  return { text: `${card.rank}${suitSymbol}`, red };
}

function renderCard(card: Card, extraClass = ""): HTMLElement {
  const { text, red } = cardLabel(card);
  const div = document.createElement("div");
  div.className = `card ${red ? "card--red" : ""} ${extraClass}`.trim();
  div.textContent = text;
  return div;
}

function appendCaption(voice: "pbp" | "color", text: string): void {
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
  if (!commentaryEnabled) return;
  for (const event of events) {
    for (const caption of captionsForEvent(event)) {
      appendCaption(caption.voice, caption.text);
    }
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
      li.textContent = `${entry.label} — ${entry.points}`;
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

function render(): void {
  if (!game) return;
  const pub = game.getProjection();
  const south = game.getProjection(HUMAN);
  const north = game.getProjection(BOT);

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

  el.pegStack.replaceChildren(...pub.pegStack.map((c) => renderCard(c)));
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

  if (pub.phase === "DISCARD_TO_CRIB" && south.ownHand?.length === 6) {
    el.discardPanel.hidden = false;
    el.discardCribOwner.textContent = pub.dealer === HUMAN ? "your" : "North's";
    el.discardHand.replaceChildren(
      ...south.ownHand.map((card) => {
        const node = renderCard(card, "card--playable");
        if (selectedDiscards.includes(card.id)) node.classList.add("card--selected");
        node.addEventListener("click", () => toggleDiscard(card.id));
        return node;
      })
    );
    el.discardConfirm.disabled = selectedDiscards.length !== 2;
  }

  if (pub.phase === "PEGGING" && pub.turnPlayer === HUMAN) {
    el.playPanel.hidden = false;
    const legal = south.legalPlays;
    el.playHint.textContent = legal.length > 0 ? "Your turn — play a card." : "No legal play — go.";
    el.playHand.replaceChildren(
      ...(south.remainingToPlay ?? []).map((card) => {
        const isLegal = legal.includes(card.id);
        const node = renderCard(card, isLegal ? "card--playable" : "");
        if (isLegal) node.addEventListener("click", () => humanPlay(card.id));
        else node.style.opacity = "0.35";
        return node;
      })
    );
  }

  el.winPanel.hidden = pub.winner === null;
  if (pub.winner) {
    el.winTitle.textContent = pub.winner === HUMAN ? "You win" : "North wins";
    el.winDetail.textContent = `${pub.scores.south} – ${pub.scores.north}`;
  }

  el.startControls.hidden = pub.phase !== "GAME_COMPLETE";
  el.commentaryToggle.disabled = pub.phase !== "GAME_COMPLETE";
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
  }
}

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
  const targetScore = Number(el.targetSelect.value) as 61 | 121;
  commentaryEnabled = el.commentaryToggle.checked;
  el.commentary.dataset.enabled = String(commentaryEnabled);
  el.feed.replaceChildren();
  el.handCount.hidden = true;
  selectedDiscards = [];
  matchStartedAt = Date.now();

  game = new CribbageGame({ targetScore });
  const events = game.start();
  processEvents(events);
  render();
  scheduleBotIfNeeded();
}

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
