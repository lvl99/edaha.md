import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput } from "..";

describe("dates", () => {
  it("should convert between ISO dates and datetime-local values", () => {
    const iso = new Date(2026, 9, 19, 11, 54).toISOString();
    expect(toLocalInput(iso)).toBe("2026-10-19T11:54");
    expect(fromLocalInput("2026-10-19T11:54")).toBe(iso);
  });

  it("should return an empty string for empty or invalid values", () => {
    expect(fromLocalInput("")).toBe("");
    expect(fromLocalInput("nope")).toBe("");
  });
});
