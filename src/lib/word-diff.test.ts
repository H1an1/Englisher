import { describe, expect, it } from "vitest";
import { buildWordDiff, normalizeWords, scoreDiff } from "./word-diff";

describe("normalizeWords", () => {
  it("lowercases text and removes punctuation without losing contractions", () => {
    expect(normalizeWords("I'm learning, slowly-but surely.")).toEqual([
      "i'm",
      "learning",
      "slowly",
      "but",
      "surely"
    ]);
  });
});

describe("buildWordDiff", () => {
  it("marks missing expected words as deletions", () => {
    const diff = buildWordDiff("I want to improve my English", "I want improve English");

    expect(diff.operations).toEqual([
      { type: "equal", expected: "I", actual: "I" },
      { type: "equal", expected: "want", actual: "want" },
      { type: "delete", expected: "to", actual: null },
      { type: "equal", expected: "improve", actual: "improve" },
      { type: "delete", expected: "my", actual: null },
      { type: "equal", expected: "English", actual: "English" }
    ]);
    expect(scoreDiff(diff)).toBe(67);
  });

  it("prefers substitutions when expected and actual words both advance", () => {
    const diff = buildWordDiff("I can hear it clearly", "I cannot hear clearly");

    expect(diff.operations).toEqual([
      { type: "equal", expected: "I", actual: "I" },
      { type: "substitute", expected: "can", actual: "cannot" },
      { type: "equal", expected: "hear", actual: "hear" },
      { type: "delete", expected: "it", actual: null },
      { type: "equal", expected: "clearly", actual: "clearly" }
    ]);
    expect(scoreDiff(diff)).toBe(60);
  });
});

