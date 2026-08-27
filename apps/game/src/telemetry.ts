/**
 * The one thing this MVP actually needs to measure: does commentary change
 * how a match plays out (finishes vs. abandoned) compared to a silent match?
 * No backend — just a local tally so a tester can eyeball the two conditions
 * after a session. Replace with real analytics once the hypothesis is worth
 * spending on.
 */

export interface MatchRecord {
  readonly commentaryEnabled: boolean;
  readonly result: "completed" | "abandoned";
  readonly durationMs: number;
  readonly timestamp: number;
}

const STORAGE_KEY = "pegboard.testTable.matches";

export function recordMatch(record: MatchRecord): void {
  try {
    const existing = readMatches();
    existing.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Storage can fail (private browsing, quota) — this is a nice-to-have, not load-bearing.
  }
}

export function readMatches(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

export function summarize(): string {
  const matches = readMatches();
  const byCondition = (enabled: boolean) => matches.filter((m) => m.commentaryEnabled === enabled);
  const rate = (list: MatchRecord[]) =>
    list.length === 0 ? "—" : `${Math.round((list.filter((m) => m.result === "completed").length / list.length) * 100)}%`;

  const withCommentary = byCondition(true);
  const withoutCommentary = byCondition(false);
  return [
    `Commentary ON  — ${withCommentary.length} matches, ${rate(withCommentary)} completed`,
    `Commentary OFF — ${withoutCommentary.length} matches, ${rate(withoutCommentary)} completed`,
  ].join("\n");
}
