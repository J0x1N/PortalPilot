import path from "node:path";
import * as XLSX from "xlsx";
import type { DataRow, ParsedFile } from "../types";

const supportedExtensions = new Set([".csv", ".xlsx"]);

function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function makeUniqueColumnName(rawValue: unknown, index: number, used: Set<string>): string {
  const baseName = valueToString(rawValue).trim() || `column_${index + 1}`;
  let candidate = baseName;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }

  used.add(candidate);
  return candidate;
}

export function parseWorkbook(buffer: Buffer, fileName: string): ParsedFile {
  const extension = path.extname(fileName).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new Error("Only .csv and .xlsx files are supported");
  }

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: false,
    cellDates: false
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The workbook has no worksheets");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false
  });
  const headerRow = matrix[0] ?? [];
  if (headerRow.length === 0) {
    throw new Error("The file has no header row");
  }

  const usedColumns = new Set<string>();
  const columns = headerRow.map((value, index) => makeUniqueColumnName(value, index, usedColumns));
  const rows: DataRow[] = [];

  for (const row of matrix.slice(1)) {
    const values = Array.from({ length: columns.length }, (_, index) => valueToString(row[index]));
    if (values.every((value) => value.trim() === "")) {
      continue;
    }

    const record: DataRow = {};
    columns.forEach((column, index) => {
      record[column] = values[index];
    });
    rows.push(record);
  }

  if (rows.length === 0) {
    throw new Error("The file has no data rows");
  }

  return {
    fileName,
    columns,
    rows,
    preview: rows.slice(0, 5)
  };
}
