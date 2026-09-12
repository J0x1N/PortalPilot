import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ParsedFile, RunState, StepType, Workflow, WorkflowStep } from "../types";

const defaultWorkflow: Workflow = {
  steps: [
    { type: "OPEN", url: "http://localhost:3001/demo-target" },
    { type: "FILL", selector: "#customer-id", value: "{{customer_id}}" },
    { type: "CLICK", selector: "#search-button" },
    { type: "WAIT", selector: "#result", timeout: 10000 },
    { type: "EXTRACT", selector: "#balance", column: "balance" },
    { type: "EXTRACT", selector: "#status", column: "status" }
  ]
};

const stepTypes: StepType[] = ["OPEN", "FILL", "CLICK", "WAIT", "EXTRACT", "PAUSE"];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function newStep(type: StepType): WorkflowStep {
  switch (type) {
    case "OPEN":
      return { type, url: "http://localhost:3001/demo-target" };
    case "FILL":
      return { type, selector: "#customer-id", value: "{{customer_id}}" };
    case "CLICK":
      return { type, selector: "#search-button" };
    case "WAIT":
      return { type, selector: "#result", timeout: 10000 };
    case "EXTRACT":
      return { type, selector: "#balance", column: "extracted_value" };
    case "PAUSE":
      return { type, message: "Complete the manual step, then resume." };
  }
}

function stepTitle(type: StepType): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function isTerminalRun(status: RunState["status"] | undefined): boolean {
  return status === "completed" || status === "stopped" || status === "failed";
}

export function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedFile, setParsedFile] = useState<ParsedFile | undefined>();
  const [workflow, setWorkflow] = useState<Workflow>(defaultWorkflow);
  const [newStepType, setNewStepType] = useState<StepType>("CLICK");
  const [run, setRun] = useState<RunState | undefined>();
  const [busy, setBusy] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!run || isTerminalRun(run.status)) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      try {
        const latest = await requestJson<RunState>(`/api/runs/${run.id}`);
        setRun(latest);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Could not refresh run");
      }
    }, 450);

    return () => window.clearInterval(timer);
  }, [run?.id, run?.status]);

  async function loadParsedFile(file: File): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const contentBase64 = await fileToBase64(file);
      const parsed = await requestJson<ParsedFile>("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentBase64 })
      });
      setParsedFile(parsed);
      setRun(undefined);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not parse file");
    } finally {
      setBusy(false);
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file) {
      await loadParsedFile(file);
    }
    event.target.value = "";
  }

  async function loadDemoData(): Promise<void> {
    setLoadingDemo(true);
    setError(undefined);
    try {
      const demoData = await requestJson<ParsedFile>("/api/demo-data");
      setParsedFile(demoData);
      setRun(undefined);
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : "Could not load demo data");
    } finally {
      setLoadingDemo(false);
    }
  }

  function updateStep(index: number, step: WorkflowStep): void {
    setWorkflow((current) => ({
      steps: current.steps.map((existing, stepIndex) => (stepIndex === index ? step : existing))
    }));
  }

  function updateStepField(index: number, field: string, value: string | number): void {
    const step = workflow.steps[index];
    updateStep(index, { ...step, [field]: value } as WorkflowStep);
  }

  function changeStepType(index: number, type: StepType): void {
    updateStep(index, newStep(type));
  }

  function removeStep(index: number): void {
    setWorkflow((current) => ({ steps: current.steps.filter((_step, stepIndex) => stepIndex !== index) }));
  }

  function addStep(): void {
    setWorkflow((current) => ({ steps: [...current.steps, newStep(newStepType)] }));
  }

  async function startRun(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!parsedFile || workflow.steps.length === 0) {
      setError("Upload a data file and add at least one workflow step.");
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const started = await requestJson<RunState>("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: parsedFile.fileName,
          columns: parsedFile.columns,
          rows: parsedFile.rows,
          workflow
        })
      });
      setRun(started);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Could not start workflow");
    } finally {
      setBusy(false);
    }
  }

  async function controlRun(action: "pause" | "resume" | "stop"): Promise<void> {
    if (!run) {
      return;
    }
    try {
      const updated = await requestJson<RunState>(`/api/runs/${run.id}/${action}`, { method: "POST" });
      setRun(updated);
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : "Could not update run");
    }
  }

  const processed = (run?.successful ?? 0) + (run?.failed ?? 0);
  const isRunning = Boolean(run && !isTerminalRun(run.status));

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/">
          <span className="wordmark-mark">P</span>
          <span>PortalPilot</span>
          <small>v0.1</small>
        </a>
        <div className="topbar-note"><span className="live-dot" /> Local workspace</div>
      </header>

      <main className="workspace">
        <section className="intro-row">
          <div>
            <p className="kicker">Workflow studio</p>
            <h1>Move portal work forward.</h1>
            <p className="intro-copy">Bring in a spreadsheet, compose the browser steps, and keep the result on this machine.</p>
          </div>
          <div className="intro-stat">
            <span>Browser context</span>
            <strong>Persistent</strong>
            <small>Chromium / local profile</small>
          </div>
        </section>

        {error && (
          <div className="alert" role="alert">
            <strong>Something needs attention</strong>
            <span>{error}</span>
            <button className="icon-button" type="button" onClick={() => setError(undefined)} aria-label="Dismiss error">×</button>
          </div>
        )}

        <div className="content-grid">
          <section className="panel data-panel" aria-labelledby="data-heading">
            <div className="section-heading">
              <div>
                <p className="section-index">01 / Input</p>
                <h2 id="data-heading">Data</h2>
              </div>
              <span className="file-kind">CSV / XLSX</span>
            </div>

            <input ref={fileInputRef} className="visually-hidden" type="file" accept=".csv,.xlsx" onChange={onFileChange} />
            <div className="upload-zone">
              <span className="upload-glyph">↑</span>
              <div>
                <strong>{parsedFile ? parsedFile.fileName : "Drop a spreadsheet here"}</strong>
                <p>{parsedFile ? `${parsedFile.rows.length} rows ready to run` : "CSV or XLSX, up to 15 MB"}</p>
              </div>
              <button className="button button-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <span>↑</span> {busy ? "Reading..." : "Upload file"}
              </button>
            </div>
            <button className="text-button" type="button" onClick={loadDemoData} disabled={loadingDemo || busy}>
              {loadingDemo ? "Loading demo..." : "Load the 10-row demo dataset"}
            </button>

            {parsedFile && (
              <div className="preview-block">
                <div className="subheading-row">
                  <div>
                    <p className="section-index">Preview</p>
                    <h3>{parsedFile.columns.length} columns</h3>
                  </div>
                  <span className="row-count">{parsedFile.rows.length} rows</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr>{parsedFile.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {parsedFile.preview.map((row, rowIndex) => (
                        <tr key={rowIndex}>{parsedFile.columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="panel workflow-panel" aria-labelledby="workflow-heading">
            <div className="section-heading">
              <div>
                <p className="section-index">02 / Recipe</p>
                <h2 id="workflow-heading">Workflow</h2>
              </div>
              <span className="step-count">{workflow.steps.length} steps</span>
            </div>

            <div className="steps-list">
              {workflow.steps.map((step, index) => (
                <article className="step-card" key={`${index}-${step.type}`}>
                  <div className="step-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="step-body">
                    <div className="step-title-row">
                      <select aria-label={`Step ${index + 1} type`} value={step.type} onChange={(event) => changeStepType(index, event.target.value as StepType)}>
                        {stepTypes.map((type) => <option key={type} value={type}>{stepTitle(type)}</option>)}
                      </select>
                      <button className="icon-button" type="button" onClick={() => removeStep(index)} aria-label={`Remove step ${index + 1}`}>×</button>
                    </div>
                    {step.type === "OPEN" && (
                      <label>URL<input value={step.url} onChange={(event) => updateStepField(index, "url", event.target.value)} /></label>
                    )}
                    {step.type === "FILL" && (
                      <div className="field-pair">
                        <label>Selector<input value={step.selector} onChange={(event) => updateStepField(index, "selector", event.target.value)} /></label>
                        <label>Value<input value={step.value} onChange={(event) => updateStepField(index, "value", event.target.value)} /></label>
                      </div>
                    )}
                    {step.type === "CLICK" && (
                      <label>Selector<input value={step.selector} onChange={(event) => updateStepField(index, "selector", event.target.value)} /></label>
                    )}
                    {step.type === "WAIT" && (
                      <div className="field-pair">
                        <label>Selector<input value={step.selector} onChange={(event) => updateStepField(index, "selector", event.target.value)} /></label>
                        <label>Timeout (ms)<input type="number" min="100" step="100" value={step.timeout} onChange={(event) => updateStepField(index, "timeout", Number(event.target.value))} /></label>
                      </div>
                    )}
                    {step.type === "EXTRACT" && (
                      <div className="field-pair">
                        <label>Selector<input value={step.selector} onChange={(event) => updateStepField(index, "selector", event.target.value)} /></label>
                        <label>Save as<input value={step.column} onChange={(event) => updateStepField(index, "column", event.target.value)} /></label>
                      </div>
                    )}
                    {step.type === "PAUSE" && (
                      <label>Message<input value={step.message} onChange={(event) => updateStepField(index, "message", event.target.value)} /></label>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="add-step-row">
              <select value={newStepType} onChange={(event) => setNewStepType(event.target.value as StepType)} aria-label="New step type">
                {stepTypes.map((type) => <option key={type} value={type}>{stepTitle(type)}</option>)}
              </select>
              <button className="button button-outline" type="button" onClick={addStep}><span>+</span> Add step</button>
            </div>
          </section>
        </div>

        <section className="run-panel panel" aria-labelledby="run-heading">
          <div className="section-heading run-heading">
            <div>
              <p className="section-index">03 / Control room</p>
              <h2 id="run-heading">Run</h2>
            </div>
            {run && <span className={`run-badge ${run.status}`}>{run.status}</span>}
          </div>
          <div className="run-toolbar">
            <button className="button button-primary" type="button" onClick={startRun} disabled={!parsedFile || busy || isRunning}>
              <span>▶</span> Run workflow
            </button>
            <div className="run-controls">
              <button className="button button-quiet" type="button" onClick={() => controlRun("pause")} disabled={!isRunning || run?.status === "paused"}><span>Ⅱ</span> Pause</button>
              <button className="button button-quiet" type="button" onClick={() => controlRun("resume")} disabled={!isRunning || run?.status !== "paused"}><span>▶</span> Resume</button>
              <button className="button button-danger" type="button" onClick={() => controlRun("stop")} disabled={!isRunning}><span>■</span> Stop</button>
            </div>
          </div>

          {run ? (
            <div className="run-status">
              <div className="run-summary">
                <div><span className="metric-label">{run.status === "running" || run.status === "paused" ? "Running" : "Processed"}</span><strong>{processed} <small>/ {run.total}</small></strong></div>
                <div><span className="metric-label">Successful</span><strong className="success-number">{run.successful}</strong></div>
                <div><span className="metric-label">Failed</span><strong className="failure-number">{run.failed}</strong></div>
                <div className="active-step"><span className="metric-label">Current step</span><strong>{run.currentStep ? `${run.currentStep.index}. ${run.currentStep.type}` : run.pauseMessage ?? "Waiting"}</strong></div>
              </div>
              <div className="progress-track"><span style={{ width: `${run.total ? Math.min(100, (processed / run.total) * 100) : 0}%` }} /></div>
              <div className="row-log">
                {run.rows.map((row) => (
                  <div className={`row-log-item ${row.status}`} key={row.row}>
                    <span className="row-marker">{row.status === "success" ? "✓" : row.status === "failed" ? "✕" : row.status === "running" ? "→" : row.status === "stopped" ? "■" : "·"}</span>
                    <span>{row.row}</span>
                    <span className="row-state">{row.status === "running" ? run.currentStep?.label ?? "Running" : row.status}</span>
                  </div>
                ))}
              </div>
              {run.status === "completed" && (
                <div className="result-banner">
                  <div><strong>{run.successful} successful</strong><span>{run.failed} failed</span></div>
                  <a className="button button-primary" href={`/api/runs/${run.id}/result`}><span>↓</span> Download result.xlsx</a>
                </div>
              )}
              {run.status === "stopped" && run.resultFile && (
                <div className="result-banner"><div><strong>Run stopped</strong><span>Saved progress is available</span></div><a className="button button-primary" href={`/api/runs/${run.id}/result`}><span>↓</span> Download partial result</a></div>
              )}
              {run.error && <p className="run-error">{run.error}</p>}
            </div>
          ) : (
            <div className="empty-run"><span>○</span><div><strong>Ready when you are</strong><p>Load a dataset, review the recipe, and start a local Chromium run.</p></div></div>
          )}
        </section>
      </main>
      <footer><span>PortalPilot runs locally.</span><span>Data stays on this computer.</span></footer>
    </div>
  );
}
