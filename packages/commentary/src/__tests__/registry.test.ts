import { describe, expect, it } from "vitest";
import { ALL_FAMILIES, getFamily } from "../registry/index.js";

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(/\[([a-zA-Z_]+)\]/g)].map((m) => m[1]);
}

describe("content registry consistency", () => {
  it("has no duplicate family IDs", () => {
    const ids = ALL_FAMILIES.map((f) => f.familyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every variant only references placeholders declared in allowedPlaceholders", () => {
    for (const family of ALL_FAMILIES) {
      for (const variant of family.variants) {
        for (const placeholder of placeholdersIn(variant.text)) {
          expect(
            family.allowedPlaceholders,
            `Family ${family.familyId} variant "${variant.text}" uses undeclared placeholder [${placeholder}]`
          ).toContain(placeholder);
        }
      }
    }
  });

  it("every family has at least one variant, one phase, and one allowed mode", () => {
    for (const family of ALL_FAMILIES) {
      expect(family.variants.length, `${family.familyId} has no variants`).toBeGreaterThan(0);
      expect(family.phases.length, `${family.familyId} has no phases`).toBeGreaterThan(0);
      expect(family.modeAllowlist.length, `${family.familyId} has no allowed modes`).toBeGreaterThan(0);
    }
  });

  it("every family the director can select actually exists in the registry", () => {
    const familyIdsUsedByDirector = [
      "PBP-06",
      "PBP-07",
      "PBP-09",
      "PBP-10",
      "PBP-11",
      "PBP-12",
      "PBP-13",
      "PBP-14",
      "PBP-15",
      "PBP-16",
      "PBP-17",
      "PBP-32",
      "PBP-33",
      "PBP-36",
      "PBP-38",
      "PBP-40",
      "ARC-03",
      "ARC-04",
      "ARC-07",
      "ARC-08",
      "ARC-11",
      "BX-01",
      "BX-12",
      "CLR-40",
    ];
    for (const id of familyIdsUsedByDirector) {
      expect(getFamily(id), `Director references unknown family ${id}`).toBeDefined();
    }
  });

  it("S and A grade families dominate the registry (vertical-slice priority)", () => {
    const grades = ALL_FAMILIES.map((f) => f.grade);
    const sAndA = grades.filter((g) => g === "S" || g === "A").length;
    expect(sAndA).toBe(grades.length); // this slice registers zero B/C families
  });
});
