import type { GameEvent, PlayerId } from "@pegboard/engine";

export type Voice = "pbp" | "color";

export interface Caption {
  readonly voice: Voice;
  readonly text: string;
}

function name(player: PlayerId): string {
  return player === "north" ? "North" : "South";
}

function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

function pbp(text: string): Caption {
  return { voice: "pbp", text };
}
function color(text: string): Caption {
  return { voice: "color", text };
}

/**
 * All authored/parameterized — no generation. This is deliberately the
 * cheapest, most cacheable commentary tier (see the strategy doc's Tier A/B),
 * enough to test whether commentary itself moves engagement before a single
 * dollar goes toward generated or recorded lines.
 */
export function captionsForEvent(event: GameEvent): Caption[] {
  switch (event.type) {
    case "GameStarted":
      return [
        color(`${name(event.dealer)} deals first. ${name(event.pone)} leads the pegging.`),
      ];

    case "HandDealt":
      return [pbp("New hand — six cards each, two go to the crib.")];

    case "StarterRevealed":
      return [pbp(`Starter's up: ${describeCard(event.card)}.`)];

    case "HisHeels":
      return [
        color(`Jack on the cut — his heels, ${event.points} for ${name(event.dealer)} before a card's even played.`),
      ];

    case "CardPlayed": {
      const captions: Caption[] = [];
      for (const entry of event.entries) {
        if (entry.type === "fifteen" && entry.label.toLowerCase().includes("thirty-one")) {
          captions.push(
            pick([
              pbp(`Thirty-one, right on the number — two for ${name(event.player)}.`),
              color(`Counted it out perfectly. Thirty-one for two.`),
            ])
          );
        } else if (entry.type === "fifteen") {
          captions.push(pbp(pick([`Fifteen for two.`, `Fifteen, and two more on the board.`])));
        } else if (entry.type === "run") {
          captions.push(color(`Run of ${entry.points} — ${name(event.player)} saw that coming.`));
        } else if (entry.type === "pair" && entry.points >= 6) {
          captions.push(color(pick([`Pair royal! ${entry.points} points, just like that.`, `That's the kind of card nobody wants to see across the table.`])));
        } else if (entry.type === "pair") {
          captions.push(pbp(`Pair for two.`));
        }
      }
      if (captions.length === 0 && event.runningCount >= 26) {
        captions.push(color(pick([`Count's at ${event.runningCount} — getting tight.`, `${event.runningCount} on the count. Somebody's about to run out of room.`])));
      }
      return captions;
    }

    case "Go":
      return [pbp(pick([`Go — nothing there for ${name(event.player)}.`, `${name(event.player)} can't help it. Go.`]))];

    case "SegmentEnded":
      if (event.points === 1) {
        return [pbp(`Last card — one for ${name(event.lastPlayer)}.`)];
      }
      return [];

    case "PeggingComplete":
      return [pbp("That's the last card played. Time to count.")];

    case "HandScored": {
      const label = event.source === "crib" ? `${name(event.player)}'s crib` : `${name(event.player)}'s hand`;
      if (event.points === 0) {
        return [pbp(`${label} counts for nothing this time.`)];
      }
      const highlights = event.entries
        .filter((e) => e.points >= 4)
        .map((e) => e.label)
        .join(", ");
      const base = pbp(`${label} counts ${event.points}${highlights ? ` — ${highlights}` : ""}.`);
      if (event.points >= 10) {
        return [base, color(pick([`That's a real hand.`, `${name(event.player)} was sitting on something all along.`]))];
      }
      return [base];
    }

    case "GameWon":
      return [
        color(pick([
          `And that's the game! ${name(event.player)} takes it ${event.finalScore[event.player]}–${event.finalScore[event.player === "north" ? "south" : "north"]}.`,
          `${name(event.player)} pegs out and wins it. Ballgame.`,
        ])),
      ];

    case "HandComplete":
      return [];

    case "CardsDiscarded":
      return [];

    default:
      return [];
  }
}

function describeCard(cardId: string): string {
  const [rank, suit] = cardId.split("-");
  return `${rank} of ${suit}`;
}
