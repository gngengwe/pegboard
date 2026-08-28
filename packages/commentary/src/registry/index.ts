import type { ContentFamily } from "../types.js";
import { PBP_FAMILIES } from "./pbp.js";
import { COLOR_FAMILIES } from "./color.js";
import { EXCHANGE_FAMILIES } from "./exchange.js";

export const ALL_FAMILIES: readonly ContentFamily[] = [
  ...PBP_FAMILIES,
  ...COLOR_FAMILIES,
  ...EXCHANGE_FAMILIES,
];

const BY_ID = new Map<string, ContentFamily>(ALL_FAMILIES.map((f) => [f.familyId, f]));

export function getFamily(familyId: string): ContentFamily | undefined {
  return BY_ID.get(familyId);
}

export function requireFamily(familyId: string): ContentFamily {
  const family = BY_ID.get(familyId);
  if (!family) {
    throw new Error(`Unknown commentary family id: ${familyId}`);
  }
  return family;
}

export { PBP_FAMILIES, COLOR_FAMILIES, EXCHANGE_FAMILIES };
