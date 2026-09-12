import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../src/files/parser";

describe("parseWorkbook", () => {
  it("parses CSV headers and rows", () => {
    const parsed = parseWorkbook(Buffer.from("customer_id,email\nCUST-001,one@example.test\nCUST-002,two@example.test\n"), "customers.csv");

    expect(parsed.columns).toEqual(["customer_id", "email"]);
    expect(parsed.rows).toEqual([
      { customer_id: "CUST-001", email: "one@example.test" },
      { customer_id: "CUST-002", email: "two@example.test" }
    ]);
    expect(parsed.preview).toHaveLength(2);
  });

  it("parses XLSX values and creates stable names for duplicate headers", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["customer_id", "customer_id"],
      ["CUST-001", "duplicate"]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Customers");

    const parsed = parseWorkbook(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "customers.xlsx");

    expect(parsed.columns).toEqual(["customer_id", "customer_id_2"]);
    expect(parsed.rows[0]).toEqual({ customer_id: "CUST-001", customer_id_2: "duplicate" });
  });
});
