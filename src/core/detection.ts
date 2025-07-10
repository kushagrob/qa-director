import fs from "fs/promises";
import path from "path";
import { glob } from "glob";

export async function detectPlaywrightConfig(): Promise<string[]> {
  const patterns = [
    "playwright.config.ts",
    "playwright.config.js",
    "e2e/playwright.config.ts",
    "tests/playwright.config.ts",
    "**/playwright.config.ts",
    "**/playwright.config.js",
  ];

  const configs: string[] = [];
  for (const pattern of patterns) {
    try {
      const files = await glob(pattern, { ignore: ["node_modules/**"] });
      configs.push(...files);
    } catch (error) {
      // Ignore glob errors
    }
  }

  return [...new Set(configs)];
}

export async function detectTestDir(
  configPath: string
): Promise<string | null> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const testDirMatch = content.match(/testDir:\s*['"`]([^'"`]+)['"`]/);
    return testDirMatch ? testDirMatch[1] : null;
  } catch {
    return null;
  }
}

export async function detectBaseURL(
  configPath: string
): Promise<string | null> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const baseURLMatch = content.match(/baseURL:\s*['"`]([^'"`]+)['"`]/);
    return baseURLMatch ? baseURLMatch[1] : null;
  } catch {
    return null;
  }
}

export async function detectGithubActions(): Promise<string[]> {
  const workflowDir = ".github/workflows";
  try {
    const files = await fs.readdir(workflowDir);
    return files.filter(
      (f) =>
        (f.endsWith(".yml") || f.endsWith(".yaml")) &&
        (f.includes("e2e") || f.includes("playwright") || f.includes("test"))
    );
  } catch {
    return [];
  }
}

export async function detectAuthDir(): Promise<string | null> {
  const commonAuthDirs = [
    ".auth",
    "playwright/.auth",
    "tests/.auth",
    "e2e/.auth",
  ];

  for (const dir of commonAuthDirs) {
    try {
      const stats = await fs.stat(dir);
      if (stats.isDirectory()) {
        return dir;
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return null;
}

export async function detectEnvFile(): Promise<string | null> {
  const commonEnvFiles = [".env.qa", ".env.test", ".env.e2e", ".env.local"];

  for (const file of commonEnvFiles) {
    try {
      await fs.access(file);
      return file;
    } catch {
      // File doesn't exist
    }
  }

  return null;
}

export async function detectSetupFile(testDir: string): Promise<string | null> {
  const commonSetupFiles = [
    "auth.setup.ts",
    "setup.ts",
    "global.setup.ts",
    "login.setup.ts",
  ];

  for (const file of commonSetupFiles) {
    const fullPath = path.join(testDir, file);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {
      // File doesn't exist
    }
  }

  return null;
}

export async function isPlaywrightProject(): Promise<boolean> {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));

    const hasDeps =
      !!packageJson.dependencies?.["@playwright/test"] ||
      !!packageJson.devDependencies?.["@playwright/test"] ||
      !!packageJson.dependencies?.["playwright"] ||
      !!packageJson.devDependencies?.["playwright"];

    const hasConfig = (await detectPlaywrightConfig()).length > 0;

    return hasDeps || hasConfig;
  } catch {
    return false;
  }
}
