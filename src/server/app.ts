import path from "node:path";
import { readFile } from "node:fs/promises";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { parseWorkbook } from "../files/parser";
import { sanitizeFileName } from "../files/storage";
import { runRequestSchema } from "../types";
import type { RunInput } from "../types";
import { demoTargetHtml } from "./demo";
import { RunManager } from "./run-manager";

const parseRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(1).max(25_000_000)
});

function getRunId(request: Request): string {
  const runId = request.params.runId;
  return Array.isArray(runId) ? runId[0] ?? "" : runId;
}

export function createApp(runManager = new RunManager()): express.Express {
  const app = express();
  app.use(express.json({ limit: "30mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, name: "PortalPilot", version: "0.1.0" });
  });

  app.post("/api/parse", (request, response) => {
    try {
      const body = parseRequestSchema.parse(request.body);
      const fileName = sanitizeFileName(body.fileName);
      const buffer = Buffer.from(body.contentBase64, "base64");
      if (buffer.length > 15 * 1024 * 1024) {
        response.status(413).json({ error: "Files must be 15 MB or smaller" });
        return;
      }
      response.json(parseWorkbook(buffer, fileName));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not parse file";
      response.status(400).json({ error: message });
    }
  });

  app.get("/api/demo-data", async (_request, response) => {
    try {
      const fileName = "customers-with-error.xlsx";
      const filePath = path.resolve(process.cwd(), "examples", fileName);
      const buffer = await readFile(filePath);
      response.json(parseWorkbook(buffer, fileName));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Demo data is unavailable";
      response.status(500).json({ error: message });
    }
  });

  app.post("/api/runs", async (request, response) => {
    try {
      const input: RunInput = runRequestSchema.parse(request.body);
      const state = await runManager.start({
        ...input,
        fileName: sanitizeFileName(input.fileName)
      });
      response.status(202).json(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start run";
      response.status(400).json({ error: message });
    }
  });

  app.get("/api/runs/:runId", async (request, response) => {
    const state = await runManager.getState(getRunId(request));
    if (!state) {
      response.status(404).json({ error: "Run not found" });
      return;
    }
    response.json(state);
  });

  app.post("/api/runs/:runId/pause", async (request, response) => {
    const state = await runManager.pause(getRunId(request));
    if (!state) {
      response.status(404).json({ error: "Run not found" });
      return;
    }
    response.json(state);
  });

  app.post("/api/runs/:runId/resume", async (request, response) => {
    const state = await runManager.resumeActive(getRunId(request));
    if (!state) {
      response.status(404).json({ error: "Run not found" });
      return;
    }
    response.json(state);
  });

  app.post("/api/runs/:runId/stop", async (request, response) => {
    const state = await runManager.stop(getRunId(request));
    if (!state) {
      response.status(404).json({ error: "Run not found" });
      return;
    }
    response.json(state);
  });

  app.get("/api/runs/:runId/result", async (request, response) => {
    const state = await runManager.getState(getRunId(request));
    if (!state || !state.resultFile) {
      response.status(404).json({ error: "Result is not ready" });
      return;
    }
    response.download(runManager.resultPath(getRunId(request)), "result.xlsx");
  });

  app.get("/api/runs/:runId/errors/:rowNumber.png", async (request, response) => {
    const screenshotPath = runManager.errorScreenshotPath(getRunId(request), request.params.rowNumber);
    if (!screenshotPath) {
      response.status(404).end();
      return;
    }
    response.sendFile(screenshotPath, (error) => {
      if (error && !response.headersSent) {
        response.status(404).end();
      }
    });
  });

  app.get("/demo-target", (_request: Request, response: Response) => {
    response.type("html").send(demoTargetHtml);
  });

  return app;
}
