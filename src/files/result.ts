import * as XLSX from "xlsx";
import type { RunInput, RunState } from "../types";

export function buildResultWorkbook(input: RunInput, state: RunState): Buffer {
  const extractedColumns = state.rows.flatMap((row) => Object.keys(row.extracted ?? {}));
  const uniqueExtractedColumns = [...new Set(extractedColumns)];
  const headers = [...input.columns, ...uniqueExtractedColumns, "_portalpilot_status", "_portalpilot_error"];
  const rows = input.rows.map((inputRow, index) => {
    const rowState = state.rows[index];
    const output: Record<string, string> = { ...inputRow };

    for (const column of uniqueExtractedColumns) {
      output[column] = rowState?.extracted?.[column] ?? "";
    }

    output._portalpilot_status = rowState?.status ?? "pending";
    output._portalpilot_error = rowState?.error ?? "";
    return output;
  });

  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Results");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
