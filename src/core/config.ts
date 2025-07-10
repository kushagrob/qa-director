import fs from "fs/promises";
import path from "path";
import { build } from "esbuild";
import {
  QADirectorConfig,
  QADirectorConfigSchema,
  Role,
} from "../types/index.js";
import chalk from "chalk";

const CONFIG_FILE = "qa-director.config.ts";

export async function loadConfig(): Promise<QADirectorConfig | null> {
  try {
    const configPath = path.join(process.cwd(), CONFIG_FILE);
    const exists = await fs
      .access(configPath)
      .then(() => true)
      .catch(() => false);

    if (!exists) return null;

    // Use esbuild to transpile TypeScript config
    const config = await loadTSConfig(configPath);

    return QADirectorConfigSchema.parse(config);
  } catch (error) {
    console.error(chalk.red("❌ Invalid qa-director.config.ts:"), error);
    return null;
  }
}

async function loadTSConfig(configPath: string): Promise<any> {
  // Create temporary output file
  const tempOutPath = path.join(
    process.cwd(),
    "node_modules",
    ".qa-director",
    "config.mjs"
  );
  await fs.mkdir(path.dirname(tempOutPath), { recursive: true });

  try {
    // Build the TypeScript config to ESM
    await build({
      entryPoints: [configPath],
      outfile: tempOutPath,
      bundle: true,
      platform: "node",
      format: "esm",
      write: true,
      external: ["qa-director"], // Don't bundle our own types
    });

    // Import the compiled config
    const configModule = await import(path.resolve(tempOutPath));
    return configModule.default;
  } finally {
    // Clean up temporary file
    try {
      await fs.unlink(tempOutPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function saveConfig(config: QADirectorConfig): Promise<void> {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  const configContent = `import { QADirectorConfig } from 'qa-director';

const config: QADirectorConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;

  await fs.writeFile(configPath, configContent);
}

export async function updateConfig(
  updates: Partial<QADirectorConfig>
): Promise<void> {
  const current = await loadConfig();
  if (!current) {
    throw new Error(
      "No qa-director.config.ts found. Run `qa-director init` first."
    );
  }

  const updated = { ...current, ...updates };
  await saveConfig(updated);
}

export async function addRole(role: Role): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    throw new Error(
      "No qa-director.config.ts found. Run `qa-director init` first."
    );
  }

  // Remove existing role with same name
  config.roles = config.roles.filter((r) => r.name !== role.name);
  config.roles.push(role);

  await saveConfig(config);
}

export async function removeRole(roleName: string): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    throw new Error(
      "No qa-director.config.ts found. Run `qa-director init` first."
    );
  }

  config.roles = config.roles.filter((r) => r.name !== roleName);
  await saveConfig(config);
}

export async function getRoles(): Promise<Role[]> {
  const config = await loadConfig();
  return config?.roles || [];
}

export async function getRole(roleName: string): Promise<Role | null> {
  const config = await loadConfig();
  return config?.roles.find((r) => r.name === roleName) || null;
}

export async function configExists(): Promise<boolean> {
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  return await fs
    .access(configPath)
    .then(() => true)
    .catch(() => false);
}
