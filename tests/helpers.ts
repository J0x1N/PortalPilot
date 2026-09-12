import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import type { RunState } from "../src/types";
import type { RunManager } from "../src/server/run-manager";

export async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const server = await new Promise<Server>((resolve) => {
    const created = app.listen(0, "127.0.0.1", () => resolve(created));
  });
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export async function waitForRun(manager: RunManager, runId: string): Promise<RunState> {
  const terminalStatuses = new Set(["completed", "stopped", "failed"]);
  const deadline = Date.now() + 40_000;

  while (Date.now() < deadline) {
    const state = await manager.getState(runId);
    if (state && terminalStatuses.has(state.status)) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for run");
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
