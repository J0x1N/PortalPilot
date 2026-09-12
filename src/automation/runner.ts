import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import { describeStep, executeStep } from "./steps";
import type { RunInput, RunState, RowState, WorkflowStep } from "../types";

export class StopRequestedError extends Error {
  constructor() {
    super("Run stopped by user");
    this.name = "StopRequestedError";
  }
}

export interface RunnerOptions {
  state: RunState;
  runDirectory: string;
  browserProfileDir: string;
  headless?: boolean;
  onUpdate: (state: RunState) => Promise<void> | void;
  waitIfPaused: () => Promise<void>;
  pauseForUser: (message: string) => Promise<void>;
  isStopRequested: () => boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeRows(input: RunInput, existing: RowState[]): RowState[] {
  return input.rows.map((_row, index) => existing[index] ?? { row: index + 1, status: "pending" });
}

function updateCounts(state: RunState): void {
  state.successful = state.rows.filter((row) => row.status === "success").length;
  state.failed = state.rows.filter((row) => row.status === "failed").length;
}

async function saveFailureScreenshot(page: Page, runDirectory: string, rowNumber: number): Promise<string | undefined> {
  const errorsDirectory = path.join(runDirectory, "errors");
  const screenshotPath = path.join(errorsDirectory, `row-${rowNumber}.png`);
  await mkdir(errorsDirectory, { recursive: true });

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

async function markRemainingStopped(state: RunState): Promise<void> {
  for (const row of state.rows) {
    if (row.status === "pending" || row.status === "running") {
      row.status = "stopped";
    }
  }
  state.currentRow = undefined;
  state.currentStep = undefined;
  state.status = "stopped";
}

export async function runWorkflow(input: RunInput, options: RunnerOptions): Promise<RunState> {
  const state = options.state;
  state.rows = makeRows(input, state.rows);
  state.total = input.rows.length;
  state.status = "running";
  state.error = undefined;
  state.pauseMessage = undefined;
  updateCounts(state);
  await options.onUpdate(state);

  let context: BrowserContext | undefined;
  let stopped = false;

  try {
    await mkdir(options.browserProfileDir, { recursive: true });
    context = await chromium.launchPersistentContext(options.browserProfileDir, {
      headless: options.headless ?? false,
      args: ["--start-maximized"],
      viewport: null
    });
    const page = context.pages()[0] ?? (await context.newPage());

    for (let index = 0; index < input.rows.length; index += 1) {
      if (options.isStopRequested()) {
        stopped = true;
        await markRemainingStopped(state);
        await options.onUpdate(state);
        break;
      }

      await options.waitIfPaused();
      if (options.isStopRequested()) {
        stopped = true;
        await markRemainingStopped(state);
        await options.onUpdate(state);
        break;
      }

      const rowNumber = index + 1;
      const rowState = state.rows[index];
      if (rowState.status === "success" || rowState.status === "failed") {
        continue;
      }

      rowState.status = "running";
      rowState.error = undefined;
      rowState.screenshot = undefined;
      rowState.extracted = {};
      state.currentRow = rowNumber;
      state.currentStep = undefined;
      updateCounts(state);
      await options.onUpdate(state);

      try {
        for (let stepIndex = 0; stepIndex < input.workflow.steps.length; stepIndex += 1) {
          await options.waitIfPaused();
          if (options.isStopRequested()) {
            throw new StopRequestedError();
          }

          const step = input.workflow.steps[stepIndex];
          state.currentStep = {
            index: stepIndex + 1,
            total: input.workflow.steps.length,
            type: step.type,
            label: describeStep(step)
          };
          await options.onUpdate(state);

          await executeStep(step, {
            page,
            row: input.rows[index],
            extracted: rowState.extracted,
            pause: options.pauseForUser
          });
          if (options.isStopRequested()) {
            throw new StopRequestedError();
          }
        }

        rowState.status = "success";
      } catch (error) {
        if (error instanceof StopRequestedError) {
          stopped = true;
          rowState.status = "stopped";
          await markRemainingStopped(state);
          await options.onUpdate(state);
          break;
        }

        rowState.status = "failed";
        rowState.error = errorMessage(error);
        const screenshotPath = await saveFailureScreenshot(page, options.runDirectory, rowNumber);
        if (screenshotPath) {
          rowState.screenshot = path.relative(process.cwd(), screenshotPath).replaceAll(path.sep, "/");
        }
      }

      updateCounts(state);
      state.currentStep = undefined;
      await options.onUpdate(state);
    }

    if (!stopped) {
      state.status = state.rows.every((row) => row.status === "success" || row.status === "failed")
        ? "completed"
        : "stopped";
    }
  } catch (error) {
    state.status = "failed";
    state.error = errorMessage(error);
  } finally {
    state.currentRow = undefined;
    state.currentStep = undefined;
    state.pauseMessage = undefined;
    state.finishedAt = new Date().toISOString();
    updateCounts(state);
    if (context) {
      await context.close().catch(() => undefined);
    }
    await options.onUpdate(state);
  }

  return state;
}

export function createInitialRunState(id: string, total: number): RunState {
  return {
    id,
    status: "queued",
    total,
    startedAt: new Date().toISOString(),
    successful: 0,
    failed: 0,
    rows: Array.from({ length: total }, (_value, index) => ({ row: index + 1, status: "pending" }))
  };
}
