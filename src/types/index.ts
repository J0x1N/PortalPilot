import { z } from "zod";

const urlTemplateSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2048, "URL is too long")
  .refine((value) => !/^\s*(javascript|data):/i.test(value), "JavaScript and data URLs are not allowed");

const selectorSchema = z
  .string()
  .trim()
  .min(1, "Selector is required")
  .max(2000, "Selector is too long")
  .refine((value) => !/^\s*javascript:/i.test(value), "JavaScript selectors are not allowed");

const columnSchema = z.string().trim().min(1).max(120);

export const stepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("OPEN"),
    url: urlTemplateSchema
  }),
  z.object({
    type: z.literal("FILL"),
    selector: selectorSchema,
    value: z.string().max(4000)
  }),
  z.object({
    type: z.literal("CLICK"),
    selector: selectorSchema
  }),
  z.object({
    type: z.literal("WAIT"),
    selector: selectorSchema,
    timeout: z.coerce.number().int().min(100).max(120000).default(10000)
  }),
  z.object({
    type: z.literal("EXTRACT"),
    selector: selectorSchema,
    column: columnSchema
  }),
  z.object({
    type: z.literal("PAUSE"),
    message: z.string().trim().min(1).max(500)
  })
]);

export const workflowSchema = z.object({
  steps: z.array(stepSchema).min(1).max(100)
});

export const runRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  columns: z.array(z.string().min(1).max(120)).min(1).max(200),
  rows: z
    .array(z.record(z.string().max(120), z.string().max(10000)))
    .min(1)
    .max(10000),
  workflow: workflowSchema
});

export type WorkflowStep = z.infer<typeof stepSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type DataRow = Record<string, string>;
export type StepType = WorkflowStep["type"];

export interface ParsedFile {
  fileName: string;
  columns: string[];
  rows: DataRow[];
  preview: DataRow[];
}

export type RowStatus = "pending" | "running" | "success" | "failed" | "stopped";
export type RunStatus = "queued" | "running" | "paused" | "completed" | "stopped" | "failed";

export interface RowState {
  row: number;
  status: RowStatus;
  error?: string;
  screenshot?: string;
  extracted?: Record<string, string>;
}

export interface StepProgress {
  index: number;
  total: number;
  type: StepType;
  label: string;
}

export interface RunState {
  id: string;
  status: RunStatus;
  total: number;
  currentRow?: number;
  currentStep?: StepProgress;
  pauseMessage?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  successful: number;
  failed: number;
  resultFile?: string;
  rows: RowState[];
}

export interface RunInput {
  fileName: string;
  columns: string[];
  rows: DataRow[];
  workflow: Workflow;
}
