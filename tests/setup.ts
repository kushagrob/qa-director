import fs from "fs/promises";
import path from "path";
import { afterEach, beforeEach, vi } from "vitest";

global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

process.env.NODE_ENV = "test";
process.env.ANTHROPIC_API_KEY = "test-key";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures");

beforeEach(async () => {
  vi.clearAllMocks();

  try {
    await fs.mkdir(fixturesDir, { recursive: true });
  } catch (error) {
    // Directory already exists
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

export const createTempDir = async (name: string): Promise<string> => {
  const tempDir = path.join(fixturesDir, name);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
};

export const createTempFile = async (
  filePath: string,
  content: string
): Promise<void> => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
};

export const cleanupTempDir = async (dirPath: string): Promise<void> => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist or already cleaned up
  }
};
