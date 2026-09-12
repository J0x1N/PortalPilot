import type { Page } from "playwright";
import { interpolate } from "./interpolation";
import type { DataRow, WorkflowStep } from "../types";

export interface StepContext {
  page: Page;
  row: DataRow;
  extracted: Record<string, string>;
  pause: (message: string) => Promise<void>;
}

function getSafeHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  return parsed.toString();
}

export async function executeStep(step: WorkflowStep, context: StepContext): Promise<void> {
  switch (step.type) {
    case "OPEN": {
      const url = getSafeHttpUrl(interpolate(step.url, context.row));
      await context.page.goto(url, { waitUntil: "domcontentloaded" });
      return;
    }
    case "FILL":
      await context.page.locator(step.selector).fill(interpolate(step.value, context.row));
      return;
    case "CLICK":
      await context.page.locator(step.selector).click();
      return;
    case "WAIT":
      await context.page.locator(step.selector).waitFor({ state: "visible", timeout: step.timeout });
      return;
    case "EXTRACT": {
      const value = await context.page.locator(step.selector).innerText();
      context.extracted[step.column] = value.trim();
      return;
    }
    case "PAUSE":
      await context.pause(interpolate(step.message, context.row));
      return;
  }
}

export function describeStep(step: WorkflowStep): string {
  switch (step.type) {
    case "OPEN":
      return `Open ${step.url}`;
    case "FILL":
      return `Fill ${step.selector}`;
    case "CLICK":
      return `Click ${step.selector}`;
    case "WAIT":
      return `Wait for ${step.selector}`;
    case "EXTRACT":
      return `Extract ${step.column}`;
    case "PAUSE":
      return `Pause: ${step.message}`;
  }
}
