import { describe, expect, it } from "vitest";
import { getDiffTokenText } from "./diff-format";

describe("getDiffTokenText", () => {
  it("shows expected text for missing or changed words without echoing the user's typed word", () => {
    expect(getDiffTokenText({ type: "delete", expected: "Thank", actual: null })).toBe("Thank");
    expect(getDiffTokenText({ type: "substitute", expected: "honored", actual: "hornerd" })).toBe("honored");
  });

  it("shows extra user words without a leading marker", () => {
    expect(getDiffTokenText({ type: "insert", expected: null, actual: "for" })).toBe("for");
  });
});
