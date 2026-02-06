import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { readConfig, writeConfig } from "../lib/config.js";
import { reopenDb, getDataDir } from "../lib/db.js";

const settings = new Hono();

settings.get("/", (c) => {
  const config = readConfig();
  return c.json({
    dataDir: getDataDir(),
    configDataDir: config.dataDir,
  });
});

settings.put("/", async (c) => {
  const body = await c.req.json();
  const { dataDir } = body;

  if (!dataDir || typeof dataDir !== "string") {
    return c.json({ error: "dataDir is required" }, 400);
  }

  const trimmed = dataDir.trim();
  const resolved = path.resolve(trimmed);

  try {
    const stat = await fs.promises.stat(resolved);
    if (!stat.isDirectory()) {
      return c.json({ error: "Path is not a directory" }, 400);
    }
  } catch {
    return c.json({ error: "Directory does not exist" }, 400);
  }

  try {
    await reopenDb(trimmed);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  const config = await writeConfig({ dataDir: trimmed });
  return c.json({
    dataDir: getDataDir(),
    configDataDir: config.dataDir,
  });
});

export default settings;
