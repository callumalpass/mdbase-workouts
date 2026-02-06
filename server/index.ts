import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Collection } from "@callumalpass/mdbase";
import path from "node:path";
import "./lib/context.js";
import { readConfig } from "./lib/config.js";
import { setDb, getDb } from "./lib/db.js";
import exercises from "./routes/exercises.js";
import sessions from "./routes/sessions.js";
import plans from "./routes/plans.js";
import quickLogs from "./routes/quick-logs.js";
import today from "./routes/today.js";
import chat from "./routes/chat.js";
import settings from "./routes/settings.js";

const app = new Hono();

app.use("/api/*", cors());

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

async function start() {
  const config = readConfig();
  const dataDir = path.resolve(config.dataDir);
  const opened = await Collection.open(dataDir);
  if (opened.error) {
    console.error("Failed to open mdbase collection:", opened.error.message);
    process.exit(1);
  }
  console.log("mdbase collection opened:", dataDir);

  setDb(opened.collection!, dataDir);

  // Make db available to all routes
  app.use("/api/*", async (c, next) => {
    c.set("db", getDb());
    await next();
  });

  // Mount routes
  app.route("/api/exercises", exercises);
  app.route("/api/sessions", sessions);
  app.route("/api/plans", plans);
  app.route("/api/quick-logs", quickLogs);
  app.route("/api/today", today);
  app.route("/api/chat", chat);
  app.route("/api/settings", settings);

  // In production, serve static files from dist/
  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("@hono/node-server/serve-static");
    app.use("/*", serveStatic({ root: "./dist" }));
    app.get("*", serveStatic({ path: "./dist/index.html" }));
  }

  const port = Number(process.env.PORT) || 3002;
  console.log(`Server running on http://0.0.0.0:${port}`);
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

export default app;
