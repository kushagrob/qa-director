import { spawn } from "child_process";
import fs from "fs/promises";
import inquirer from "inquirer";
import path from "path";
import { addRole, loadConfig } from "../../core/config.js";
import {
  detectEnvVars,
  extractEnvVarNames,
  formatEnvVarForDisplay,
  replaceWithEnvVars,
} from "../../core/env-detection.js";
import {
  createRoleFolder,
  updateEnvFiles,
  updatePlaywrightConfig,
  updateSetupFile,
} from "../../core/files.js";
import { LoginOptions, Role } from "../../types/index.js";
import { CLI_MESSAGES } from "../../utils/constants.js";
import {
  createSecretsInfo,
  updateWorkflowWithEnvVars,
} from "../../utils/github-actions.js";
import { loggers } from "../../utils/logger.js";

export async function loginCommand(options: LoginOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    loggers.error(CLI_MESSAGES.ERRORS.NO_CONFIG);
    process.exit(1);
  }

  const { role, refresh } = options;
  const isNewRole = !config.roles.find((r) => r.name === role);

  if (refresh && isNewRole) {
    loggers.error(
      `Role '${role}' not found. Remove --refresh flag to create new role.`
    );
    process.exit(1);
  }

  loggers.console.blue(`${CLI_MESSAGES.LOGIN.START} ${role}`);

  // Step 1: Record authentication if needed
  const authDir = path.join(process.cwd(), config.authDir);
  const storageStatePath = path.join(
    config.authDir,
    `storageState.${role}.json`
  );

  await fs.mkdir(authDir, { recursive: true });

  let loginFlow = "";
  if (refresh) {
    // Just refresh the storage state
    const { shouldRecord } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldRecord",
        message: "Record new login flow?",
        default: true,
      },
    ]);

    if (shouldRecord) {
      loginFlow = await recordLoginFlow(config.baseURL, storageStatePath);
    }

    loggers.success(`${CLI_MESSAGES.LOGIN.ROLE_REFRESHED} ${role}`);
    return;
  }

  // For new roles, always record login flow
  const { shouldRecord } = await inquirer.prompt([
    {
      type: "confirm",
      name: "shouldRecord",
      message: "Record login flow with Playwright codegen?",
      default: true,
    },
  ]);

  if (shouldRecord) {
    loginFlow = await recordLoginFlow(config.baseURL, storageStatePath);
  } else {
    loggers.warn(
      "Skipping login recording. You'll need to manually set up authentication."
    );
  }

  if (isNewRole) {
    await handleNewRole(role, loginFlow, storageStatePath, config);
  }
}

async function recordLoginFlow(
  baseURL: string,
  storageStatePath: string
): Promise<string> {
  loggers.console.yellow(CLI_MESSAGES.LOGIN.CODEGEN_START);
  loggers.console.gray(CLI_MESSAGES.LOGIN.CODEGEN_INSTRUCTION);

  // Create a temp file to capture the generated code
  const tempCodePath = path.join(process.cwd(), "temp-login.spec.ts");

  const codegenProcess = spawn(
    "npx",
    [
      "playwright",
      "codegen",
      "--save-storage",
      path.resolve(storageStatePath),
      "--output",
      tempCodePath,
      baseURL,
    ],
    {
      stdio: "inherit",
    }
  );

  await new Promise<void>((resolve, reject) => {
    codegenProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Codegen process exited with code ${code}`));
      }
    });

    codegenProcess.on("error", (error) => {
      reject(error);
    });
  });

  // Read the generated code
  let generatedCode = "";
  try {
    generatedCode = await fs.readFile(tempCodePath, "utf-8");
    // Clean up temp file
    await fs.unlink(tempCodePath);
  } catch (error) {
    loggers.warn(
      "Could not read generated code for environment variable detection"
    );
  }

  loggers.success(`${CLI_MESSAGES.LOGIN.SUCCESS} ${storageStatePath}`);
  return generatedCode;
}

async function handleNewRole(
  roleName: string,
  loginFlow: string,
  storageStatePath: string,
  config: any
): Promise<void> {
  // Step 1: Detect environment variables
  const envVars = await detectEnvVars(loginFlow, roleName);
  let processedLoginFlow = loginFlow;
  let envVarNames: string[] = [];

  if (envVars.length > 0) {
    loggers.console.yellow(`${CLI_MESSAGES.LOGIN.ENV_VARS_DETECTED}`);
    envVars.forEach((envVar) => {
      loggers.console.cyan(`  ${formatEnvVarForDisplay(envVar)}`);
    });

    const { shouldReplace } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldReplace",
        message: "Replace sensitive data with environment variables?",
        default: true,
      },
    ]);

    if (shouldReplace) {
      processedLoginFlow = replaceWithEnvVars(loginFlow, envVars);
      envVarNames = extractEnvVarNames(envVars);
      await updateEnvFiles(config, envVarNames);
    }
  } else if (loginFlow.trim()) {
    loggers.console.gray("No sensitive data detected in login flow");
  } else {
    loggers.warn(
      "No login flow captured - environment variable detection skipped"
    );
  }

  // Step 2: Ask about folder organization
  const { useFolder } = await inquirer.prompt([
    {
      type: "confirm",
      name: "useFolder",
      message:
        "Create role-specific test folder? (Recommended for multiple roles)",
      default: config.roles.length > 0,
    },
  ]);

  const roleFolder = useFolder ? `${config.testDir}/${roleName}` : undefined;
  const testMatch = roleFolder
    ? [`${roleFolder}/**/*.{test,spec}.{js,ts}`]
    : undefined;

  // Step 3: Create role object
  const role: Role = {
    name: roleName,
    storagePath: storageStatePath,
    testMatch,
    envVars: envVarNames.length > 0 ? envVarNames : undefined,
    folder: roleFolder,
  };

  // Step 4: Create role folder if requested
  if (roleFolder) {
    await createRoleFolder(config, role);
  }

  // Step 5: Ask before adding to playwright config
  const { shouldAddToPlaywrightConfig } = await inquirer.prompt([
    {
      type: "confirm",
      name: "shouldAddToPlaywrightConfig",
      message: "Add role to Playwright configuration?",
      default: true,
    },
  ]);

  // Step 6: Ask before updating setup file (only if setup file exists)
  let shouldUpdateSetup = false;
  const setupPath = path.join(process.cwd(), config.setup.path);
  const setupExists = await fs
    .access(setupPath)
    .then(() => true)
    .catch(() => false);

  if (setupExists && processedLoginFlow) {
    const { shouldUpdate } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldUpdate",
        message: "Add role to setup file using coding agent?",
        default: true,
      },
    ]);
    shouldUpdateSetup = shouldUpdate;
  } else if (!setupExists) {
    loggers.warn(
      `Setup file not found at ${config.setup.path}. You'll need to create it first using 'qa-director init' or manually.`
    );
  } else if (!processedLoginFlow) {
    loggers.warn("No login flow captured. Setup file update skipped.");
  }

  // Step 7: Update files
  try {
    // Always add role to config
    await addRole(role);
    loggers.success(`Role "${roleName}" added to configuration`);

    // Update setup file if requested and possible
    if (shouldUpdateSetup && processedLoginFlow) {
      try {
        await updateSetupFile(config, role, processedLoginFlow);
        loggers.success(`Setup file updated with "${roleName}" role`);
      } catch (error) {
        loggers.warn(`Failed to update setup file: ${error}`);
        loggers.console.cyan(
          `📝 You may need to manually add the "${roleName}" role to your ${config.setup.path} file`
        );
      }
    }

    // Update Playwright config if requested
    if (shouldAddToPlaywrightConfig) {
      try {
        await updatePlaywrightConfig(config, role);
        loggers.success(`Playwright config updated with "${roleName}" role`);
      } catch (error) {
        loggers.warn(`Failed to update Playwright config: ${error}`);
        loggers.console.cyan(
          `📝 You may need to manually add the "${roleName}" role to your ${config.playwrightConfig} file`
        );
      }
    }

    // Step 8: Update GitHub Actions if enabled
    if (config.githubActions.enabled && envVarNames.length > 0) {
      await updateWorkflowWithEnvVars(config.githubActions.path, envVarNames);
      await createSecretsInfo(envVarNames);
    }

    loggers.success(`${CLI_MESSAGES.LOGIN.ROLE_CREATED} ${roleName}`);

    if (envVarNames.length > 0) {
      loggers.success("\nEnvironment variables added to .env.qa");
      loggers.warn("\nDon't forget to:");
      loggers.console.cyan(
        "  1. Update the placeholder values in .env.qa with real values"
      );
      loggers.console.cyan("  2. Add them to GitHub Actions secrets");
      loggers.console.cyan("\nEnvironment variables added:");
      envVarNames.forEach((envVar) => {
        loggers.console.cyan(`  - ${envVar}`);
      });
    }

    if (roleFolder) {
      loggers.console.cyan(
        `\n📁 Role-specific test folder created: ${roleFolder}`
      );
    }
  } catch (error) {
    loggers.error("Failed to create role:", error);
    process.exit(1);
  }
}

// Utility function to validate role names
function validateRoleName(roleName: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(roleName);
}

// Utility function to check if Anthropic API key is available
function checkApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Export for use in init command
export { handleNewRole, recordLoginFlow };
