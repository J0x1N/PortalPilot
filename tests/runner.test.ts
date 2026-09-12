import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import { RunManager } from "../src/server/run-manager";
import type { RunInput } from "../src/types";
import { closeServer, listen, waitForRun } from "./helpers";

describe("workflow runner", () => {
  it("continues after one row fails and saves its screenshot", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "portalpilot-runner-"));
    const manager = new RunManager({
      runsDirectory: path.join(tempDirectory, "runs"),
      browserProfileDirectory: path.join(tempDirectory, "profile"),
      headless: true
    });
    const { server, baseUrl } = await listen(createApp(manager));
    const input: RunInput = {
      fileName: "recovery.csv",
      columns: ["customer_id"],
      rows: [{ customer_id: "UNKNOWN" }, { customer_id: "CUST-001" }, { customer_id: "CUST-002" }],
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
      const screenshotPath = path.join(tempDirectory, "runs", started.id, "errors", "row-1.png");
      const resultPath = path.join(tempDirectory, "runs", started.id, "result.xlsx");

      expect(finalState.status).toBe("completed");
      expect(finalState.successful).toBe(2);
      expect(finalState.failed).toBe(1);
      expect(finalState.rows[0].status).toBe("failed");
      expect(finalState.rows[1].status).toBe("success");
      expect(finalState.rows[2].status).toBe("success");
      await expect(readFile(screenshotPath)).resolves.toBeInstanceOf(Buffer);
      await expect(readFile(resultPath)).resolves.toBeInstanceOf(Buffer);
    } finally {
      await closeServer(server);
      await rm(tempDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
  });
});
