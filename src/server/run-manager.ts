import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { buildResultWorkbook } from "../files/result";
import { readJson, writeJson } from "../files/storage";
import { createInitialRunState, runWorkflow } from "../automation/runner";
import type { RunInput, RunState } from "../types";

interface RunControl {
  pauseRequested: boolean;
  stopRequested: boolean;
  waiters: Array<() => void>;
}

interface ManagedRun {
  input: RunInput;
  state: RunState;
  control: RunControl;
}

export interface RunManagerOptions {
  runsDirectory?: string;
  browserProfileDirectory?: string;
  headless?: boolean;
}

function isValidRunId(runId: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(runId);
}

function isTerminalStatus(status: RunState["status"]): boolean {
  return status === "completed" || status === "stopped" || status === "failed";
}

export class RunManager {
  private readonly runsDirectory: string;
  private readonly browserProfileDirectory: string;
  private readonly headless: boolean;
  private readonly runs = new Map<string, ManagedRun>();

  constructor(options: RunManagerOptions = {}) {
    this.runsDirectory = options.runsDirectory ?? path.resolve(process.cwd(), "runs");
    this.browserProfileDirectory = options.browserProfileDirectory ?? path.resolve(process.cwd(), ".portalpilot/browser-profile");
    this.headless = options.headless ?? false;
  }

  async start(input: RunInput): Promise<RunState> {
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const state = createInitialRunState(id, input.rows.length);
    const managed: ManagedRun = {
      input,
      state,
      control: { pauseRequested: false, stopRequested: false, waiters: [] }
    };

    this.runs.set(id, managed);
    await this.persist(managed);
    void this.execute(managed);
    return state;
  }

  async getState(runId: string): Promise<RunState | undefined> {
    if (!isValidRunId(runId)) {
      return undefined;
    }

    const managed = this.runs.get(runId);
    if (managed) {
      if (isTerminalStatus(managed.state.status) && !managed.state.resultFile) {
        return { ...managed.state, status: "running" };
      }
      return managed.state;
    }

    try {
      return await readJson<RunState>(this.statePath(runId));
    } catch {
      return undefined;
    }
  }

  async resume(runId: string): Promise<RunState | undefined> {
    if (!isValidRunId(runId)) {
      return undefined;
    }

    const existing = this.runs.get(runId);
    if (existing) {
      if (existing.state.status === "running" || existing.state.status === "paused" || existing.state.status === "queued") {
        existing.control.pauseRequested = false;
        existing.control.stopRequested = false;
        this.releaseWaiters(existing.control);
        return existing.state;
      }
      return existing.state;
    }

    try {
      const [state, input] = await Promise.all([
        readJson<RunState>(this.statePath(runId)),
        readJson<RunInput>(this.inputPath(runId))
      ]);
      for (const row of state.rows) {
        if (row.status === "running" || row.status === "stopped") {
          row.status = "pending";
        }
      }
      state.status = "queued";
      state.currentRow = undefined;
      state.currentStep = undefined;
      state.finishedAt = undefined;
      state.error = undefined;
      const managed: ManagedRun = {
        input,
        state,
        control: { pauseRequested: false, stopRequested: false, waiters: [] }
      };
      this.runs.set(runId, managed);
      await this.persist(managed);
      void this.execute(managed);
      return state;
    } catch {
      return undefined;
    }
  }

  async pause(runId: string): Promise<RunState | undefined> {
    const managed = this.runs.get(runId);
    if (!managed || managed.state.status === "completed" || managed.state.status === "stopped" || managed.state.status === "failed") {
      return managed?.state;
    }

    managed.control.pauseRequested = true;
    managed.state.status = "paused";
    managed.state.pauseMessage = "Paused by user";
    await this.persist(managed);
    return managed.state;
  }

  async resumeActive(runId: string): Promise<RunState | undefined> {
    const managed = this.runs.get(runId);
    if (!managed) {
      return this.resume(runId);
    }

    if (managed.state.status !== "completed" && managed.state.status !== "stopped" && managed.state.status !== "failed") {
      managed.control.pauseRequested = false;
      managed.state.status = "running";
      managed.state.pauseMessage = undefined;
      this.releaseWaiters(managed.control);
      await this.persist(managed);
    }
    return managed.state;
  }

  async stop(runId: string): Promise<RunState | undefined> {
    const managed = this.runs.get(runId);
    if (!managed || managed.state.status === "completed" || managed.state.status === "failed" || managed.state.status === "stopped") {
      return managed?.state;
    }

    managed.control.stopRequested = true;
    managed.control.pauseRequested = false;
    this.releaseWaiters(managed.control);
    await this.persist(managed);
    return managed.state;
  }

  resultPath(runId: string): string {
    return path.join(this.runsDirectory, runId, "result.xlsx");
  }

  errorScreenshotPath(runId: string, rowNumber: string): string | undefined {
    if (!isValidRunId(runId) || !/^\d+$/.test(rowNumber)) {
      return undefined;
    }
    return path.join(this.runsDirectory, runId, "errors", `row-${rowNumber}.png`);
  }

  private statePath(runId: string): string {
    return path.join(this.runsDirectory, runId, "state.json");
  }

  private inputPath(runId: string): string {
    return path.join(this.runsDirectory, runId, "input.json");
  }

  private async persist(managed: ManagedRun): Promise<void> {
    await writeJson(this.statePath(managed.state.id), managed.state);
    await writeJson(this.inputPath(managed.state.id), managed.input);
  }

  private releaseWaiters(control: RunControl): void {
    const waiters = control.waiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  }

  private async waitIfPaused(managed: ManagedRun): Promise<void> {
    if (!managed.control.pauseRequested) {
      return;
    }

    managed.state.status = "paused";
    managed.state.pauseMessage ??= "Paused by user";
    await this.persist(managed);
    await new Promise<void>((resolve) => managed.control.waiters.push(resolve));
  }

  private async pauseForUser(managed: ManagedRun, message: string): Promise<void> {
    managed.control.pauseRequested = true;
    managed.state.status = "paused";
    managed.state.pauseMessage = message;
    await this.persist(managed);
    await new Promise<void>((resolve) => managed.control.waiters.push(resolve));
  }

  private async execute(managed: ManagedRun): Promise<void> {
    try {
      await runWorkflow(managed.input, {
        state: managed.state,
        runDirectory: path.join(this.runsDirectory, managed.state.id),
        browserProfileDir: this.browserProfileDirectory,
        headless: this.headless,
        onUpdate: async () => {
          if (!isTerminalStatus(managed.state.status) || managed.state.resultFile) {
            await this.persist(managed);
          }
        },
        waitIfPaused: () => this.waitIfPaused(managed),
        pauseForUser: (message) => this.pauseForUser(managed, message),
        isStopRequested: () => managed.control.stopRequested
      });

      const resultBuffer = buildResultWorkbook(managed.input, managed.state);
      await mkdir(path.dirname(this.resultPath(managed.state.id)), { recursive: true });
      await writeFile(this.resultPath(managed.state.id), resultBuffer);
      managed.state.resultFile = this.resultPath(managed.state.id).replaceAll(path.sep, "/");
      await this.persist(managed);
    } catch (error) {
      managed.state.status = "failed";
      managed.state.error = error instanceof Error ? error.message : String(error);
      managed.state.finishedAt = new Date().toISOString();
      await this.persist(managed);
    }
  }
}
