import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workersRoot = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(workersRoot, ".env"), override: true });

export function getWorkersRoot() {
  return workersRoot;
}

export function getRepoRoot() {
  return path.resolve(workersRoot, "..");
}

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function isDirectRun(metaUrl: string) {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && metaUrl === pathToFileURL(entrypoint).href);
}
