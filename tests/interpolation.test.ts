import { describe, expect, it } from "vitest";
import { interpolate } from "../src/automation/interpolation";

describe("interpolate", () => {
  it("replaces repeated variables and trims variable names", () => {
    expect(interpolate("Hello {{ customer_id }} / {{customer_id}}", { customer_id: "CUST-001" })).toBe("Hello CUST-001 / CUST-001");
  });

  it("uses an empty string for a missing variable", () => {
    expect(interpolate("https://example.test/{{missing}}", { customer_id: "CUST-001" })).toBe("https://example.test/");
  });

  it("leaves ordinary text untouched", () => {
    expect(interpolate("No placeholders", { customer_id: "CUST-001" })).toBe("No placeholders");
  });
});
