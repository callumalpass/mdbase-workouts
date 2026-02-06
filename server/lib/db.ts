import { Collection } from "@callumalpass/mdbase";
import path from "node:path";

let currentDb: Collection;
let currentDataDir: string;

export function getDb(): Collection {
  return currentDb;
}

export function getDataDir(): string {
  return currentDataDir;
}

export function setDb(db: Collection, dataDir: string): void {
  currentDb = db;
  currentDataDir = dataDir;
}

export async function reopenDb(dataDir: string): Promise<void> {
  const resolved = path.resolve(dataDir);
  const opened = await Collection.open(resolved);
  if (opened.error) {
    throw new Error(
      `Failed to open collection at ${resolved}: ${opened.error.message}`
    );
  }
  currentDb = opened.collection!;
  currentDataDir = resolved;
}
