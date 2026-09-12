import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

app.listen(port, "127.0.0.1", () => {
  console.log(`PortalPilot server listening on http://localhost:${port}`);
  console.log(`Demo target available at http://localhost:${port}/demo-target`);
});
