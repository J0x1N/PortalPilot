# PortalPilot v0.1

PortalPilot is a local workflow runner for repetitive CSV/XLSX work in browser portals. It uses React and Vite for the interface, Express for the local server, Playwright for a visible Chromium browser, and `xlsx` for file parsing and export.

No data leaves the computer. PortalPilot does not use a cloud service, external API, authentication system, database, AI API, Docker, Electron, or Chrome extension.

## Run it

Requirements: Node.js 18 or newer.

```bash
npm install
npx playwright install chromium
npm run dev
```

Open the application at <http://localhost:5173>.

The Express server runs at <http://localhost:3001>. The local demo portal is available at <http://localhost:3001/demo-target>.

## Local demo

1. Start PortalPilot with `npm run dev`.
2. Open <http://localhost:5173>.
3. Click **Load the 10-row demo dataset**. This loads `examples/customers.xlsx`.
4. The demo workflow is already in the editor. It opens `/demo-target`, fills `#customer-id`, clicks `#search-button`, waits for `#result`, and extracts `#balance` and `#status`.
5. Click **Run workflow**.
6. Chromium opens visibly. The run processes the ten rows one at a time and updates the row log live.
7. Download `result.xlsx` when the run completes.

The same recipe is stored in `examples/workflow.json`. The demo portal contains ten fictional customers with IDs `CUST-001` through `CUST-010`.

## Project layout

```text
src/
  automation/
    interpolation.ts  # {{variable}} replacement
    runner.ts         # persistent Playwright context and row recovery
    steps.ts          # validated browser step execution
  client/
    App.tsx           # local workflow studio UI
    main.tsx
    styles.css
  files/
    parser.ts         # CSV/XLSX input
    result.ts         # result.xlsx output
    storage.ts        # JSON state and filename sanitization
  server/
    app.ts            # Express API and demo route
    demo.ts           # self-contained demo portal
    index.ts
    run-manager.ts    # run lifecycle, controls, and persistence
  types/
    index.ts          # Zod schemas and shared types
examples/
  customers.xlsx
  workflow.json
runs/
  {runId}/
    input.json
    state.json
    result.xlsx
    errors/row-{n}.png
```

`.portalpilot/browser-profile/` is the persistent Playwright browser profile. It is created locally, is ignored by Git, and PortalPilot never reads or stores passwords.

## Tests and build

```bash
npm run build
npm test
```

The test suite covers variable interpolation, CSV/XLSX parsing, workflow execution, row-level failure recovery with screenshots, and an end-to-end run against `/demo-target` that processes all ten customers.

## Supported steps

- **OPEN**: navigates to an interpolated HTTP(S) URL.
- **FILL**: fills a CSS selector with a literal or interpolated value.
- **CLICK**: clicks a CSS selector.
- **WAIT**: waits for a visible selector with a configurable timeout.
- **EXTRACT**: reads visible text from a selector into a result column.
- **PAUSE**: pauses on a message until the user presses **Resume**. This is intended for manual login, CAPTCHA, or 2FA.

Each row is isolated. A failed row gets an error message and a screenshot at `runs/{runId}/errors/row-{n}.png`; the next row still runs. After every row, `state.json` is written so a run can be resumed from the saved run directory. The current UI exposes the live run controls; a later process can resume a persisted run through the local run manager API.

## Current limitations

- The workflow editor supports CSS selectors and the step types listed above; it does not execute arbitrary user JavaScript.
- There is one active browser run at a time in the local process.
- The browser profile is shared by runs in this project, so it should be treated as a local user profile.
- The app is intentionally local-only and does not provide authentication or multi-user access.
- The current run list is kept in the filesystem rather than a database.
