import { readFile, rm, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { parseWorkbook } from "../src/files/parser";
import { RunManager } from "../src/server/run-manager";
import type { RunInput } from "../src/types";
import { closeServer, listen, waitForRun } from "./helpers";

describe("demo target end-to-end", () => {
  it("processes all ten successful example customers and extracts balance and status", async () => {
    const examplePath = path.resolve(process.cwd(), "examples", "customers-success.xlsx");
    const example = parseWorkbook(await readFile(examplePath), "customers-success.xlsx");
    expect(example.rows).toHaveLength(10);
    expect(example.columns).toEqual(["customer_id"]);

    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "portalpilot-demo-"));
    const manager = new RunManager({
      runsDirectory: path.join(tempDirectory, "runs"),
      browserProfileDirectory: path.join(tempDirectory, "profile"),
      headless: true
    });
    const { server, baseUrl } = await listen(createApp(manager));

    const input: RunInput = {
      fileName: example.fileName,
      columns: example.columns,
      rows: example.rows,
      workflow: {
        steps: [
          { type: "OPEN", url: `${baseUrl}/demo-target` },
          { type: "FILL", selector: "#customer-id", value: "{{customer_id}}" },
          { type: "CLICK", selector: "#search-button" },
          { type: "WAIT", selector: "#result", timeout: 3000 },
          { type: "EXTRACT", selector: "#balance", column: "balance" },
          { type: "EXTRACT", selector: "#status", column: "status" }
        ]
      }
    };

    try {
      const started = await manager.start(input);
      const finalState = await waitForRun(manager, started.id);
      const workbook = XLSX.read(await readFile(path.join(tempDirectory, "runs", started.id, "result.xlsx")), { type: "buffer" });
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.Results);

      expect(finalState.status).toBe("completed");
      expect(finalState.successful).toBe(10);
      expect(finalState.failed).toBe(0);
      expect(rows).toHaveLength(10);
      expect(rows[0]).toMatchObject({ customer_id: "CUST-001", balance: "€1,245", status: "Active", _portalpilot_status: "success" });
      expect(rows.every((row) => row._portalpilot_error === "")).toBe(true);
    } finally {
      await closeServer(server);
      await rm(tempDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
  });
});
