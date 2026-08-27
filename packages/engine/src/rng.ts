/** A source of floats in [0, 1). Swap implementations without touching shuffle logic. */
export interface RandomSource {
  next(): number;
}

/** Cryptographically strong source for real matches. */
export class SecureRandomSource implements RandomSource {
  next(): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
}

/**
 * Deterministic PRNG (mulberry32) for golden tests and reproducible replays.
 * Never used for real-money-adjacent or ranked shuffles.
 */
export class SeededRandomSource implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** Unbiased Fisher-Yates shuffle, driven by the given random source. */
export function shuffle<T>(items: readonly T[], rng: RandomSource): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
