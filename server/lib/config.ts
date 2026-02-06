import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_DIR = path.join(os.homedir(), ".config", "workout-tracker");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export interface AppConfig {
  dataDir: string;
}

const DEFAULTS: AppConfig = {
  dataDir: "./data",
};

export function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeConfig(
  config: Partial<AppConfig>
): Promise<AppConfig> {
  const current = readConfig();
  const merged = { ...current, ...config };
  await fs.promises.mkdir(CONFIG_DIR, { recursive: true });
  await fs.promises.writeFile(
    CONFIG_PATH,
    JSON.stringify(merged, null, 2) + "\n"
  );
  return merged;
}
