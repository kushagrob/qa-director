import inquirer from "inquirer";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { loadConfig, removeRole, getRole } from "../../core/config.js";
import { fileExists } from "../../core/files.js";
import { callClaudeCode } from "../../core/claude-code.js";
import { CLI_MESSAGES } from "../../utils/constants.js";
import { EjectOptions, QADirectorConfig, Role } from "../../types/index.js";

interface FileToRemove {
  path: string;
  description: string;
  exists: boolean;
  isDirectory: boolean;
}

export async function ejectCommand(options: EjectOptions = {}): Promise<void> {
  if (options.role) {
    return ejectRole(options.role, options);
  }

  console.log(chalk.blue("🚀 QA Director Eject"));
  console.log(
    chalk.gray(
      "This will remove all qa-director files and configurations from your project.\n"
    )
  );

  const config = await loadConfig();
  if (!config) {
    console.log(
      chalk.yellow(
        "✨ No qa-director configuration found. Project is already clean!"
      )
    );
    return;
  }

  // Collect all files that should be removed
  const filesToRemove = await collectFilesToRemove(config);

  if (filesToRemove.length === 0) {
    console.log(
      chalk.yellow(
        "✨ No qa-director files found to remove. Project is already clean!"
      )
    );
    return;
  }

  // Show what will be removed
  await displayRemovalPlan(filesToRemove);

  if (options.dryRun) {
    console.log(chalk.cyan("\n🔍 Dry run complete. No files were removed."));
    return;
  }

  // Confirm removal unless forced
  if (!options.force) {
    const { shouldProceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldProceed",
        message: "Are you sure you want to remove these files?",
        default: false,
      },
    ]);

    if (!shouldProceed) {
      console.log(chalk.yellow("❌ Eject cancelled."));
      return;
    }
  }

  // Remove files
  await removeFiles(filesToRemove);

  console.log(
    chalk.green(
      "\n🎉 QA Director has been successfully ejected from your project!"
    )
  );
  console.log(chalk.cyan("\nNote: You may need to manually:"));
  console.log(
    chalk.cyan("- Remove qa-director modifications from playwright.config.ts")
  );
  console.log(
    chalk.cyan("- Clean up GitHub Actions workflows if they were modified")
  );
  console.log(
    chalk.cyan("- Remove any qa-director dependencies from package.json")
  );
}

async function collectFilesToRemove(config: any): Promise<FileToRemove[]> {
  const files: FileToRemove[] = [];

  // Main config file
  files.push({
    path: "qa-director.config.ts",
    description: "QA Director configuration",
    exists: await fileExists("qa-director.config.ts"),
    isDirectory: false,
  });

  // Environment files
  if (config.envDir) {
    files.push({
      path: config.envDir,
      description: "Environment variables",
      exists: await fileExists(config.envDir),
      isDirectory: false,
    });

    files.push({
      path: `${config.envDir}.example`,
      description: "Environment variables example",
      exists: await fileExists(`${config.envDir}.example`),
      isDirectory: false,
    });
  }

  // Setup file
  if (config.setup?.path) {
    files.push({
      path: config.setup.path,
      description: "Authentication setup",
      exists: await fileExists(config.setup.path),
      isDirectory: false,
    });
  }

  // GitHub Actions workflow
  if (config.githubActions?.enabled && config.githubActions?.path) {
    files.push({
      path: config.githubActions.path,
      description: "GitHub Actions workflow",
      exists: await fileExists(config.githubActions.path),
      isDirectory: false,
    });
  }

  // Role-specific files
  if (config.roles && Array.isArray(config.roles)) {
    for (const role of config.roles) {
      // Storage state files
      if (role.storagePath) {
        files.push({
          path: role.storagePath,
          description: `${role.name} authentication state`,
          exists: await fileExists(role.storagePath),
          isDirectory: false,
        });
      }

      // Role folders
      if (role.folder) {
        files.push({
          path: role.folder,
          description: `${role.name} role test folder`,
          exists: await fileExists(role.folder),
          isDirectory: true,
        });
      }
    }
  }

  // Auth directory (if empty after removing files)
  if (config.authDir) {
    files.push({
      path: config.authDir,
      description: "Authentication directory",
      exists: await fileExists(config.authDir),
      isDirectory: true,
    });
  }

  // Temporary files
  const tempDir = path.join("node_modules", ".qa-director");
  files.push({
    path: tempDir,
    description: "Temporary files",
    exists: await fileExists(tempDir),
    isDirectory: true,
  });

  return files;
}

async function displayRemovalPlan(files: FileToRemove[]): Promise<void> {
  console.log(chalk.yellow("📋 Files to be removed:\n"));

  const existingFiles = files.filter((f) => f.exists);
  const missingFiles = files.filter((f) => !f.exists);

  if (existingFiles.length > 0) {
    console.log(chalk.green("✅ Found files:"));
    existingFiles.forEach((file) => {
      const icon = file.isDirectory ? "📁" : "📄";
      console.log(
        chalk.cyan(`  ${icon} ${file.path}`),
        chalk.gray(`- ${file.description}`)
      );
    });
  }

  if (missingFiles.length > 0) {
    console.log(chalk.gray("\n🔍 Files not found (will be skipped):"));
    missingFiles.forEach((file) => {
      const icon = file.isDirectory ? "📁" : "📄";
      console.log(chalk.gray(`  ${icon} ${file.path} - ${file.description}`));
    });
  }

  console.log(
    chalk.yellow(`\nTotal: ${existingFiles.length} files/directories to remove`)
  );
}

async function removeFiles(files: FileToRemove[]): Promise<void> {
  console.log(chalk.yellow("\n🗑️  Removing files...\n"));

  for (const file of files) {
    if (!file.exists) {
      continue;
    }

    try {
      const stats = await fs.stat(file.path);

      if (stats.isDirectory()) {
        await fs.rm(file.path, { recursive: true });
        console.log(chalk.green(`✅ Removed directory: ${file.path}`));
      } else {
        await fs.unlink(file.path);
        console.log(chalk.green(`✅ Removed file: ${file.path}`));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.log(
        chalk.red(`❌ Failed to remove ${file.path}: ${errorMessage}`)
      );
    }
  }

  // Clean up empty parent directories
  await cleanupEmptyDirectories();
}

async function cleanupEmptyDirectories(): Promise<void> {
  const dirsToCheck = ["tests", "playwright", ".github/workflows", ".github"];

  for (const dir of dirsToCheck) {
    try {
      const exists = await fileExists(dir);
      if (!exists) continue;

      const entries = await fs.readdir(dir);
      if (entries.length === 0) {
        await fs.rm(dir, { recursive: true });
        console.log(chalk.green(`✅ Removed empty directory: ${dir}`));
      }
    } catch (error) {
      // Ignore errors when cleaning up - these are just nice-to-have
    }
  }
}

async function ejectRole(
  roleName: string,
  options: EjectOptions
): Promise<void> {
  console.log(chalk.blue("🚀 QA Director Role Eject"));
  console.log(
    chalk.gray(
      `This will remove the "${roleName}" role and its associated files from your project.\n`
    )
  );

  const config = await loadConfig();
  if (!config) {
    console.log(
      chalk.yellow(
        "✨ No qa-director configuration found. Project is already clean!"
      )
    );
    return;
  }

  // Check if role exists
  const role = await getRole(roleName);
  if (!role) {
    console.log(
      chalk.yellow(`⚠️  Role "${roleName}" not found in configuration.`)
    );
    const availableRoles = config.roles.map((r) => r.name).join(", ");
    console.log(chalk.cyan(`Available roles: ${availableRoles || "none"}`));
    return;
  }

  // Detect role usage in config files
  const playwrightConfigUsage = await detectRoleInPlaywrightConfig(
    config,
    roleName
  );
  const setupFileUsage = await detectRoleInSetupFile(config, roleName);

  // Show detection results
  console.log(chalk.blue("🔍 Scanning for role usage...\n"));

  if (playwrightConfigUsage) {
    console.log(
      chalk.yellow(
        `📋 Role "${roleName}" found in Playwright config (${config.playwrightConfig})`
      )
    );
  }

  if (setupFileUsage) {
    console.log(
      chalk.yellow(
        `🔐 Role "${roleName}" found in setup file (${config.setup?.path})`
      )
    );
  }

  // Collect role-specific files
  const filesToRemove = await collectRoleFilesToRemove(config, role);

  if (filesToRemove.length === 0 && !playwrightConfigUsage && !setupFileUsage) {
    console.log(
      chalk.yellow(
        `✨ No files or configurations found for role "${roleName}". Role may already be clean!`
      )
    );
  } else {
    // Show what will be removed
    if (filesToRemove.length > 0) {
      await displayRemovalPlan(filesToRemove);
    }

    if (playwrightConfigUsage || setupFileUsage) {
      console.log(chalk.yellow("\n📝 Configuration files to update:"));
      if (playwrightConfigUsage) {
        console.log(
          chalk.cyan(`  📋 ${config.playwrightConfig} - Remove role project`)
        );
      }
      if (setupFileUsage) {
        console.log(
          chalk.cyan(`  🔐 ${config.setup?.path} - Remove role from setup`)
        );
      }
    }
  }

  if (options.dryRun) {
    console.log(chalk.cyan("\n🔍 Dry run complete. No files were removed."));
    return;
  }

  // Confirm removal unless forced
  if (!options.force) {
    const { shouldProceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldProceed",
        message: `Are you sure you want to remove the "${roleName}" role and its files?`,
        default: false,
      },
    ]);

    if (!shouldProceed) {
      console.log(chalk.yellow("❌ Role eject cancelled."));
      return;
    }
  }

  // Ask for confirmation on config file updates
  let shouldUpdatePlaywrightConfig = false;
  let shouldUpdateSetupFile = false;

  if (playwrightConfigUsage && !options.force) {
    const { shouldUpdate } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldUpdate",
        message: `Remove "${roleName}" from Playwright config using AI coding agent?`,
        default: true,
      },
    ]);
    shouldUpdatePlaywrightConfig = shouldUpdate;
  } else if (playwrightConfigUsage && options.force) {
    shouldUpdatePlaywrightConfig = true;
  }

  if (setupFileUsage && !options.force) {
    const { shouldUpdate } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldUpdate",
        message: `Remove "${roleName}" from setup file using AI coding agent?`,
        default: true,
      },
    ]);
    shouldUpdateSetupFile = shouldUpdate;
  } else if (setupFileUsage && options.force) {
    shouldUpdateSetupFile = true;
  }

  // Remove files
  if (filesToRemove.length > 0) {
    await removeFiles(filesToRemove);
  }

  // Remove role from configuration
  await removeRole(roleName);
  console.log(chalk.green(`✅ Removed role "${roleName}" from configuration`));

  // Remove role from Playwright config
  if (shouldUpdatePlaywrightConfig) {
    await removeRoleFromPlaywrightConfig(config, roleName);
  } else if (playwrightConfigUsage) {
    console.log(
      chalk.yellow(
        `⚠️  Playwright config not updated. You may need to manually remove the "${roleName}" project from ${config.playwrightConfig}`
      )
    );
  }

  // Remove role from auth.setup.ts
  if (shouldUpdateSetupFile) {
    await removeRoleFromSetup(config, roleName);
  } else if (setupFileUsage) {
    console.log(
      chalk.yellow(
        `⚠️  Setup file not updated. You may need to manually remove the "${roleName}" role from ${config.setup?.path}`
      )
    );
  }

  // Remove role-specific environment variables
  await removeRoleEnvVars(config, role);

  // Remove role from GitHub Actions workflow
  if (
    config.githubActions?.enabled &&
    role.envVars &&
    role.envVars.length > 0
  ) {
    await removeRoleFromWorkflow(config, roleName, role.envVars);
  }

  console.log(
    chalk.green(
      `\n🎉 Role "${roleName}" has been successfully ejected from your project!`
    )
  );

  // Show summary of what was updated
  const updatedFiles = [];
  if (filesToRemove.length > 0) {
    updatedFiles.push(`${filesToRemove.length} role-specific files removed`);
  }
  if (shouldUpdatePlaywrightConfig) {
    updatedFiles.push("Playwright config updated");
  }
  if (shouldUpdateSetupFile) {
    updatedFiles.push("Setup file updated");
  }
  if (role.envVars && role.envVars.length > 0) {
    updatedFiles.push("Environment variables cleaned");
  }

  if (updatedFiles.length > 0) {
    console.log(chalk.cyan("\n📝 Summary:"));
    updatedFiles.forEach((update) => {
      console.log(chalk.cyan(`  • ${update}`));
    });
  }
}

async function collectRoleFilesToRemove(
  config: QADirectorConfig,
  role: Role
): Promise<FileToRemove[]> {
  const files: FileToRemove[] = [];

  // Storage state file
  if (role.storagePath) {
    files.push({
      path: role.storagePath,
      description: `${role.name} authentication state`,
      exists: await fileExists(role.storagePath),
      isDirectory: false,
    });
  }

  // Role folder
  if (role.folder) {
    files.push({
      path: role.folder,
      description: `${role.name} role test folder`,
      exists: await fileExists(role.folder),
      isDirectory: true,
    });
  }

  return files;
}

async function removeRoleFromSetup(
  config: QADirectorConfig,
  roleName: string
): Promise<void> {
  if (!config.setup?.path) return;

  const setupPath = path.join(process.cwd(), config.setup.path);
  const setupExists = await fileExists(setupPath);

  if (!setupExists) {
    console.log(
      chalk.gray(
        `⚠️  Setup file not found at ${config.setup.path}, skipping setup update`
      )
    );
    return;
  }

  const prompt = `Please remove the "${roleName}" role from the authentication setup file.

The setup file is located at: ${config.setup.path}

Instructions:
1. Remove the "${roleName}" entry from the roleSetups dictionary
2. Keep all other roles intact
3. Ensure the remaining setup code is valid TypeScript
4. Do not remove any imports or shared configuration

Please update the file to remove only the specified role while maintaining the structure and functionality for other roles.`;

  try {
    const result = await callClaudeCode(prompt, {
      maxTurns: 3,
      allowedTools: ["Write", "Edit", "ReadFile"],
      permissionMode: "acceptEdits",
    });

    if (result.success) {
      console.log(chalk.green(`✅ Removed "${roleName}" from setup file`));
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Failed to update setup file automatically: ${result.error}`
        )
      );
      console.log(
        chalk.cyan(
          `📝 You may need to manually remove the "${roleName}" role from ${config.setup.path}`
        )
      );
    }
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Error updating setup file: ${error}`));
    console.log(
      chalk.cyan(
        `📝 You may need to manually remove the "${roleName}" role from ${config.setup.path}`
      )
    );
  }
}

async function removeRoleEnvVars(
  config: QADirectorConfig,
  role: Role
): Promise<void> {
  if (!role.envVars || role.envVars.length === 0) return;

  const envPath = config.envDir;
  const examplePath = `${envPath}.example`;

  for (const filePath of [envPath, examplePath]) {
    try {
      const exists = await fileExists(filePath);
      if (!exists) continue;

      let content = await fs.readFile(filePath, "utf-8");
      let modified = false;

      // Remove lines containing the role's environment variables
      for (const envVar of role.envVars) {
        const lines = content.split("\n");
        const filteredLines = lines.filter((line) => {
          const trimmed = line.trim();
          return !trimmed.startsWith(`${envVar}=`);
        });

        if (filteredLines.length !== lines.length) {
          content = filteredLines.join("\n");
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile(filePath, content);
        console.log(
          chalk.green(`✅ Removed role environment variables from ${filePath}`)
        );
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to update ${filePath}: ${error}`));
    }
  }
}

async function removeRoleFromWorkflow(
  config: QADirectorConfig,
  roleName: string,
  envVars: string[]
): Promise<void> {
  if (!config.githubActions?.path) return;

  const workflowPath = config.githubActions.path;
  const workflowExists = await fileExists(workflowPath);

  if (!workflowExists) {
    console.log(
      chalk.gray(
        `⚠️  GitHub Actions workflow not found at ${workflowPath}, skipping workflow update`
      )
    );
    return;
  }

  try {
    let content = await fs.readFile(workflowPath, "utf-8");
    let modified = false;

    // Remove environment variable references from the workflow
    for (const envVar of envVars) {
      const envLine = `          ${envVar}: \${{ secrets.${envVar} }}`;
      if (content.includes(envLine)) {
        content = content.replace(envLine + "\n", "");
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(workflowPath, content);
      console.log(
        chalk.green(
          "✅ Removed role environment variables from GitHub Actions workflow"
        )
      );
    }
  } catch (error) {
    console.log(
      chalk.yellow(`⚠️  Failed to update GitHub Actions workflow: ${error}`)
    );
  }
}

async function detectRoleInPlaywrightConfig(
  config: QADirectorConfig,
  roleName: string
): Promise<boolean> {
  if (!config.playwrightConfig) return false;

  const configPath = path.join(process.cwd(), config.playwrightConfig);
  const configExists = await fileExists(configPath);

  if (!configExists) {
    return false;
  }

  try {
    const content = await fs.readFile(configPath, "utf-8");
    // Look for project configuration with the role name
    const roleProjectPattern = new RegExp(
      `name:\\s*['"\`]${roleName}['"\`]`,
      "i"
    );
    const roleStoragePattern = new RegExp(
      `storageState:\\s*['"\`][^'"\`]*${roleName}[^'"\`]*['"\`]`,
      "i"
    );

    return roleProjectPattern.test(content) || roleStoragePattern.test(content);
  } catch (error) {
    console.log(chalk.gray(`ℹ️  Could not read playwright config: ${error}`));
    return false;
  }
}

async function detectRoleInSetupFile(
  config: QADirectorConfig,
  roleName: string
): Promise<boolean> {
  if (!config.setup?.path) return false;

  const setupPath = path.join(process.cwd(), config.setup.path);
  const setupExists = await fileExists(setupPath);

  if (!setupExists) {
    return false;
  }

  try {
    const content = await fs.readFile(setupPath, "utf-8");
    // Look for role in roleSetups dictionary
    const roleSetupPattern = new RegExp(`${roleName}\\s*:\\s*{`, "i");
    const roleRecordPattern = new RegExp(`record\\s+${roleName}\\s+state`, "i");

    return roleSetupPattern.test(content) || roleRecordPattern.test(content);
  } catch (error) {
    console.log(chalk.gray(`ℹ️  Could not read setup file: ${error}`));
    return false;
  }
}

async function removeRoleFromPlaywrightConfig(
  config: QADirectorConfig,
  roleName: string
): Promise<void> {
  if (!config.playwrightConfig) return;

  const configPath = path.join(process.cwd(), config.playwrightConfig);
  const configExists = await fileExists(configPath);

  if (!configExists) {
    console.log(
      chalk.gray(
        `⚠️  Playwright config file not found at ${config.playwrightConfig}, skipping config update`
      )
    );
    return;
  }

  const prompt = `Please remove the "${roleName}" role project from the Playwright configuration file.

The config file is located at: ${config.playwrightConfig}

Instructions:
1. Remove the project configuration for "${roleName}" from the projects array
2. Keep all other project configurations intact
3. Ensure the remaining configuration is valid TypeScript/JavaScript
4. Do not remove any shared configuration or imports

The project configuration to remove typically looks like:
{
  name: '${roleName}',
  use: { /* ... */ },
  storageState: '/* path containing ${roleName} */',
  testDir: '/* ... */',
  testMatch: [/* ... */],
  dependencies: [/* ... */]
}

Please update the file to remove only the specified role project while maintaining all other configurations.`;

  try {
    const result = await callClaudeCode(prompt, {
      maxTurns: 3,
      allowedTools: ["Write", "Edit", "ReadFile"],
      permissionMode: "acceptEdits",
    });

    if (result.success) {
      console.log(
        chalk.green(`✅ Removed "${roleName}" project from Playwright config`)
      );
    } else {
      console.log(
        chalk.yellow(
          `⚠️  Failed to update Playwright config automatically: ${result.error}`
        )
      );
      console.log(
        chalk.cyan(
          `📝 You may need to manually remove the "${roleName}" project from ${config.playwrightConfig}`
        )
      );
    }
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Error updating Playwright config: ${error}`));
    console.log(
      chalk.cyan(
        `📝 You may need to manually remove the "${roleName}" project from ${config.playwrightConfig}`
      )
    );
  }
}
