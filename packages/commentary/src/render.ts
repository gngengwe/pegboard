import type { ContentFamily, LineVariant, Mode } from "./types.js";

/** Preferred variant tier per mode, with a fallback chain if that tier has no authored line. */
const TIER_PREFERENCE: Record<Mode, LineVariant["tier"][]> = {
  minimal: ["clean"],
  broadcast: ["broadcast", "clean"],
  arcade: ["arcade", "broadcast", "clean"],
  learn: ["learn", "clean"],
  expert: ["expert", "broadcast", "clean"],
  kids: ["kids", "clean"],
  quiet: ["clean"],
};

export function pickVariant(family: ContentFamily, mode: Mode): LineVariant | null {
  if (family.variants.length === 0) return null;
  for (const tier of TIER_PREFERENCE[mode]) {
    const match = family.variants.find((v) => v.tier === tier);
    if (match) return match;
  }
  return family.variants[0];
}

/**
 * Interpolates `[placeholder]` tokens. Throws if a placeholder in the line
 * text has no supplied value, and throws if a supplied key isn't in the
 * family's `allowedPlaceholders` — both are authoring-time bugs, not runtime
 * conditions to swallow silently, since a silently-blank placeholder is
 * exactly the kind of thing that could later hide a leaked field.
 */
export function renderLine(
  family: ContentFamily,
  variant: LineVariant,
  placeholders: Readonly<Record<string, string | number>>
): string {
  for (const key of Object.keys(placeholders)) {
    if (!family.allowedPlaceholders.includes(key)) {
      throw new Error(
        `Placeholder "${key}" is not declared in allowedPlaceholders for family ${family.familyId}.`
      );
    }
  }

  return variant.text.replace(/\[([a-zA-Z_]+)\]/g, (_match, key: string) => {
    if (!(key in placeholders)) {
      throw new Error(
        `Family ${family.familyId} variant references [${key}] but no value was supplied.`
      );
    }
    return String(placeholders[key]);
  });
}
