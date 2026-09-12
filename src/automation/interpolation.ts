import type { DataRow } from "../types";

const variablePattern = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function interpolate(template: string, row: DataRow): string {
  return template.replace(variablePattern, (_match, rawKey: string) => row[rawKey.trim()] ?? "");
}
