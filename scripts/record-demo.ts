import { readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { chromium, type Page } from "playwright";
import { parseWorkbook } from "../src/files/parser";

const appUrl = process.env.PORTALPILOT_URL ?? "http://127.0.0.1:5173";
const openingTitle = "Excel \u2192 Website \u2192 Excel. Automated.";
const closingTitle = "I can automate your repetitive browser workflow in 48h.";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function buildSourcePreview(fileName: string, customerIds: string[]): string {
  const rows = customerIds.map((customerId, index) => `
    <tr><td>${index + 1}</td><td>${escapeHtml(customerId)}</td></tr>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fileName)}</title>
  <style>
    :root { color-scheme: light; font-family: Georgia, 'Times New Roman', serif; color: #17231f; background: #e7ebe4; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #e7ebe4, #f8f5ed 58%, #dfe9e2); }
    main { width: min(880px, calc(100% - 64px)); margin: 0 auto; padding: 80px 0; }
    .window { overflow: hidden; border: 1px solid #c4d0c6; background: #fffefa; box-shadow: 0 24px 70px rgba(24, 54, 43, .13); }
    .window-bar { display: flex; align-items: center; gap: 10px; padding: 13px 18px; background: #183b35; color: #f5f0e7; font: 700 12px Arial, sans-serif; }
    .window-bar span { width: 8px; height: 8px; border-radius: 50%; background: #d26f4c; }
    .sheet-heading { display: flex; justify-content: space-between; gap: 20px; align-items: end; padding: 30px 32px 22px; border-bottom: 1px solid #d4ddd4; }
    .sheet-heading p { margin: 0 0 7px; color: #d26f4c; font: 700 11px 'Courier New', monospace; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 0; color: #123e36; font-size: 34px; font-weight: 400; }
    .sheet-heading small { color: #6a7770; font: 12px 'Courier New', monospace; }
    .table-wrap { padding: 0 32px 32px; }
    table { width: 100%; border-collapse: collapse; font: 15px 'Courier New', monospace; }
    th { padding: 13px 14px; border-bottom: 1px solid #b8c8bc; background: #edf3ed; color: #5e7067; font-size: 11px; text-align: left; text-transform: uppercase; }
    td { padding: 12px 14px; border-bottom: 1px solid #e4e9e2; }
    td:first-child { width: 90px; color: #849089; }
    td:last-child { color: #123e36; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    @media (max-width: 640px) { main { width: min(100% - 32px, 880px); padding: 42px 0; } .sheet-heading, .table-wrap { padding-left: 20px; padding-right: 20px; } }
  </style>
</head>
<body>
  <main>
    <section class="window" aria-labelledby="sheet-title">
      <div class="window-bar"><span></span><span></span><span></span><strong>${escapeHtml(fileName)}</strong></div>
      <div class="sheet-heading"><div><p>Workbook / Customers</p><h1 id="sheet-title">Customer IDs</h1></div><small>11 rows / 1 column</small></div>
      <div class="table-wrap"><table><thead><tr><th>Row</th><th>customer_id</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
  </main>
</body>
</html>`;
}

function buildResultPreview(rows: Array<Record<string, string>>): string {
  const visibleColumns = [
    ["customer_id", "customer_id"],
    ["balance", "balance"],
    ["status", "status"],
    ["_portalpilot_status", "state"],
    ["_portalpilot_error", "error"]
  ] as const;
  const header = visibleColumns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("");
  const body = rows.map((row) => {
    const cells = visibleColumns.map(([key]) => {
      const value = row[key] ?? "";
      const displayValue = key === "_portalpilot_error" && value ? "Extraction failed" : value;
      return `<td title="${escapeHtml(value)}">${escapeHtml(displayValue)}</td>`;
    }).join("");
    const rowClass = row._portalpilot_status === "failed" ? "failed" : "success";
    return `<tr class="${rowClass}">${cells}</tr>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>result.xlsx</title>
  <style>
    :root { color-scheme: light; font-family: Georgia, 'Times New Roman', serif; color: #17231f; background: #e7ebe4; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #e7ebe4, #f8f5ed 58%, #dfe9e2); }
    main { width: min(1240px, calc(100% - 64px)); margin: 0 auto; padding: 70px 0; }
    .window { overflow: hidden; border: 1px solid #c4d0c6; background: #fffefa; box-shadow: 0 24px 70px rgba(24, 54, 43, .13); }
    .window-bar { display: flex; align-items: center; gap: 10px; padding: 13px 18px; background: #183b35; color: #f5f0e7; font: 700 12px Arial, sans-serif; }
    .window-bar span { width: 8px; height: 8px; border-radius: 50%; background: #d26f4c; }
    .sheet-heading { display: flex; justify-content: space-between; gap: 20px; align-items: end; padding: 30px 32px 22px; border-bottom: 1px solid #d4ddd4; }
    .sheet-heading p { margin: 0 0 7px; color: #d26f4c; font: 700 11px 'Courier New', monospace; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 0; color: #123e36; font-size: 34px; font-weight: 400; }
    .sheet-heading small { color: #6a7770; font: 12px 'Courier New', monospace; }
    .table-wrap { overflow: auto; padding: 0 32px 32px; }
    table { width: 100%; border-collapse: collapse; font: 13px 'Courier New', monospace; }
    th { padding: 13px 12px; border-bottom: 1px solid #b8c8bc; background: #edf3ed; color: #5e7067; font-size: 10px; text-align: left; text-transform: uppercase; white-space: nowrap; }
    td { padding: 11px 12px; border-bottom: 1px solid #e4e9e2; white-space: nowrap; }
    tr.success td:nth-child(4) { color: #4f9560; font-weight: 700; }
    tr.failed { background: #fff0eb; }
    tr.failed td:nth-child(4), tr.failed td:nth-child(5) { color: #a14d36; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    @media (max-width: 640px) { main { width: min(100% - 32px, 1240px); padding: 42px 0; } .sheet-heading, .table-wrap { padding-left: 20px; padding-right: 20px; } }
  </style>
</head>
<body>
  <main>
    <section class="window" aria-labelledby="sheet-title">
      <div class="window-bar"><span></span><span></span><span></span><strong>result.xlsx</strong></div>
      <div class="sheet-heading"><div><p>Export / Workflow results</p><h1 id="sheet-title">Processed customers</h1></div><small>11 rows / 5 columns</small></div>
      <div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>
    </section>
  </main>
</body>
</html>`;
}

async function pause(page: Page, milliseconds: number): Promise<void> {
  await page.waitForTimeout(milliseconds);
}

async function smoothScrollTo(page: Page, selector: string, milliseconds: number): Promise<void> {
  await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (!target) {
      throw new Error(`Could not find scroll target: ${targetSelector}`);
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, selector);
  await pause(page, milliseconds);
}

async function showOverlay(page: Page, text: string, milliseconds: number): Promise<void> {
  await page.evaluate((overlayText) => {
    const overlay = document.createElement("div");
    overlay.id = "recording-overlay";
    overlay.textContent = overlayText;
    Object.assign(overlay.style, {
      position: "fixed",
      left: "50%",
      bottom: "34px",
      zIndex: "2147483647",
      transform: "translateX(-50%)",
      padding: "14px 22px",
      border: "1px solid rgba(255, 255, 255, .25)",
      background: "rgba(18, 62, 54, .94)",
      color: "#fffdf8",
      font: "700 20px Georgia, serif",
      letterSpacing: "0",
      whiteSpace: "nowrap",
      boxShadow: "0 12px 30px rgba(18, 62, 54, .2)"
    });
    document.body.append(overlay);
  }, text);
  await pause(page, milliseconds);
  await page.evaluate(() => document.getElementById("recording-overlay")?.remove());
}

async function requireRunning(url: string): Promise<void> {
  try {
    const response = await fetch(`${url}/api/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch {
    throw new Error(`PortalPilot is not running at ${url}. Start it with "npm run dev" first.`);
  }
}

async function main(): Promise<void> {
  const sourcePath = path.resolve(process.cwd(), "examples", "customers-with-error.xlsx");
  const source = parseWorkbook(await readFile(sourcePath), "customers-with-error.xlsx");
  const customerIds = source.rows.map((row) => row.customer_id ?? "");

  await requireRunning(appUrl);

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"]
  });
  const context = await browser.newContext({ acceptDownloads: true, viewport: null });
  const page = await context.newPage();

  try {
    await page.setContent(buildSourcePreview(source.fileName, customerIds));
    await showOverlay(page, openingTitle, 4200);
    await smoothScrollTo(page, ".table-wrap tr:last-child", 1500);
    await pause(page, 1000);

    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "PortalPilot" }).waitFor();
    await pause(page, 2200);

    await page.getByRole("button", { name: "Load customers-with-error.xlsx" }).click();
    await page.locator(".preview-block").waitFor();
    await page.getByLabel("URL").fill("http://localhost:3001/demo-target?recording=1");
    await page.locator(".step-card").nth(5).waitFor();
    await smoothScrollTo(page, ".preview-block", 1100);
    await pause(page, 900);
    await smoothScrollTo(page, ".preview-block tbody tr:last-child", 900);
    await pause(page, 700);
    await smoothScrollTo(page, ".step-card:nth-child(1)", 900);
    await pause(page, 650);
    await smoothScrollTo(page, ".step-card:nth-child(3)", 900);
    await pause(page, 650);
    await smoothScrollTo(page, ".step-card:nth-child(6)", 900);
    await pause(page, 900);
    await smoothScrollTo(page, ".run-panel", 900);
    await pause(page, 700);

    await page.getByRole("button", { name: /Run workflow/i }).click();
    await page.locator(".run-badge.completed").waitFor({ timeout: 45_000 });
    await page.getByText("10 successful", { exact: true }).waitFor();
    await page.getByText("1 failed", { exact: true }).waitFor();
    await pause(page, 2500);

    const failedRow = await page.locator(".row-log-item.failed").first().locator("span").nth(1).innerText();
    const resultHref = await page.getByRole("link", { name: /Download result\.xlsx/i }).getAttribute("href");
    if (!resultHref) {
      throw new Error("The completed run did not expose a result download.");
    }
    const runId = resultHref.split("/").at(-2);
    if (!runId) {
      throw new Error("Could not determine the completed run id.");
    }

    const screenshotPage = await context.newPage();
    try {
      const screenshotResponse = await screenshotPage.goto(`${appUrl}/api/runs/${runId}/errors/${failedRow}.png`, { waitUntil: "domcontentloaded" });
      if (!screenshotResponse?.ok()) {
        throw new Error("The failed-row screenshot could not be opened.");
      }
      await pause(screenshotPage, 3500);
    } finally {
      await screenshotPage.close();
    }
    await page.bringToFront();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /Download result\.xlsx/i }).click();
    const download = await downloadPromise;
    if (download.suggestedFilename() !== "result.xlsx") {
      throw new Error(`Expected result.xlsx, received ${download.suggestedFilename()}.`);
    }
    const downloadedPath = await download.path();
    if (!downloadedPath) {
      throw new Error("The result download has no readable path.");
    }

    const workbook = XLSX.read(await readFile(downloadedPath), { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      throw new Error("The downloaded workbook has no result sheet.");
    }
    const resultRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
    if (resultRows.length !== 11) {
      throw new Error(`Expected 11 result rows, received ${resultRows.length}.`);
    }

    const resultPage = await context.newPage();
    try {
      await resultPage.setContent(buildResultPreview(resultRows));
      await pause(resultPage, 1200);
      await smoothScrollTo(resultPage, ".table-wrap tbody tr:last-child", 1200);
      await pause(resultPage, 1200);
      await showOverlay(resultPage, closingTitle, 6500);
    } finally {
      await resultPage.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});