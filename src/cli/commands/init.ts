import chalk from "chalk";
import { promises as fs } from "fs";
import inquirer from "inquirer";
import path from "path";
import { configExists, saveConfig } from "../../core/config.js";
import {
  detectBaseURL,
  detectPlaywrightConfig,
  detectTestDir,
  isPlaywrightProject,
} from "../../core/detection.js";
import {
  createEnvFiles,
  createSetupFile,
  ensureDirectoryExists,
  updatePlaywrightConfigWithSetup,
} from "../../core/files.js";
import { InitOptions, QADirectorConfig } from "../../types/index.js";
import { CLI_MESSAGES, DEFAULT_QA_CONFIG } from "../../utils/constants.js";
import { setupGithubActions } from "../../utils/github-actions.js";
import { loginCommand } from "./login.js";

const PEER_DEPENDENCIES = ["@playwright/test"];

async function checkPeerDependencies(): Promise<string[]> {
  const missing: string[] = [];

  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const dep of PEER_DEPENDENCIES) {
      if (!allDeps[dep]) {
        missing.push(dep);
      }
    }
  } catch (error) {
    // If we can't read package.json, assume all are missing
    return [...PEER_DEPENDENCIES];
  }

  return missing;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  console.log(chalk.blue(CLI_MESSAGES.INIT.START));

  // Check if already initialized
  if (await configExists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "qa-director.config.ts already exists. Overwrite?",
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow("Initialization cancelled."));
      return;
    }
  }

  // Check if this is a Playwright project
  if (!(await isPlaywrightProject())) {
    console.log(
      chalk.yellow("⚠️  This doesn't appear to be a Playwright project.")
    );
    const { continue: shouldContinue } = await inquirer.prompt([
      {
        type: "confirm",
        name: "continue",
        message: "Continue anyway?",
        default: false,
      },
    ]);

    if (!shouldContinue) {
      console.log(chalk.yellow("Initialization cancelled."));
      return;
    }
  }

  // Check peer dependencies
  const missingPeerDeps = await checkPeerDependencies();
  if (missingPeerDeps.length > 0) {
    console.log(chalk.yellow("⚠️  Missing required peer dependencies:"));
    missingPeerDeps.forEach((dep: string) =>
      console.log(chalk.cyan(`  - ${dep}`))
    );
    console.log(chalk.yellow("\nInstall them with:"));
    console.log(chalk.cyan(`npm install ${missingPeerDeps.join(" ")}`));
    console.log(chalk.yellow("or"));
    console.log(chalk.cyan(`pnpm add ${missingPeerDeps.join(" ")}`));

    const { continue: shouldContinue } = await inquirer.prompt([
      {
        type: "confirm",
        name: "continue",
        message: "Continue anyway?",
        default: false,
      },
    ]);

    if (!shouldContinue) {
      console.log(chalk.yellow("Initialization cancelled."));
      return;
    }
  }

  // Step 1: Detect Playwright config
  const playwrightConfigs = await detectPlaywrightConfig();
  let selectedConfig: string;

  if (options.playwrightConfig) {
    selectedConfig = options.playwrightConfig;
  } else if (playwrightConfigs.length === 0) {
    console.log(chalk.yellow(CLI_MESSAGES.INIT.NO_PLAYWRIGHT));
    const { shouldCreate } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldCreate",
        message: "Would you like to create one now?",
        default: true,
      },
    ]);

    if (shouldCreate) {
      console.log(chalk.cyan("Run: npm init playwright@latest"));
      console.log(chalk.cyan("Then run: qa-director init"));
      process.exit(0);
    } else {
      console.log(chalk.red(CLI_MESSAGES.INIT.PLAYWRIGHT_REQUIRED));
      process.exit(1);
    }
  } else if (playwrightConfigs.length === 1) {
    selectedConfig = playwrightConfigs[0];
    console.log(
      chalk.green(`${CLI_MESSAGES.INIT.DETECTED_CONFIG} ${selectedConfig}`)
    );
  } else {
    console.log(chalk.yellow(CLI_MESSAGES.INIT.MULTIPLE_CONFIGS));
    const { config } = await inquirer.prompt([
      {
        type: "list",
        name: "config",
        message: "Choose one:",
        choices: playwrightConfigs,
      },
    ]);
    selectedConfig = config;
  }

  // Step 2: Detect and confirm settings
  const detectedSettings = {
    testDir: options.testDir || (await detectTestDir(selectedConfig)),
    baseURL: options.baseURL || (await detectBaseURL(selectedConfig)),
  };

  const settings = await inquirer.prompt([
    {
      type: "input",
      name: "testDir",
      message: "Test directory:",
      default: detectedSettings.testDir || DEFAULT_QA_CONFIG.testDir,
      when: !options.testDir,
      filter: (input) => (input.startsWith("./") ? input.slice(2) : input),
    },
    {
      type: "input",
      name: "baseURL",
      message: "Base URL:",
      default: detectedSettings.baseURL || DEFAULT_QA_CONFIG.baseURL,
      when: !options.baseURL,
    },
    {
      type: "input",
      name: "authDir",
      message: "Auth directory:",
      default: DEFAULT_QA_CONFIG.authDir,
      when: !options.authDir,
      filter: (input) => (input.startsWith("./") ? input.slice(2) : input),
    },
    {
      type: "input",
      name: "envDir",
      message: "Environment file:",
      default: DEFAULT_QA_CONFIG.envDir,
      when: !options.envDir,
      filter: (input) => (input.startsWith("./") ? input.slice(2) : input),
    },
  ]);

  // Use provided options or prompt answers
  const finalSettings = {
    testDir: (options.testDir || settings.testDir || "").startsWith("./")
      ? (options.testDir || settings.testDir || "").slice(2)
      : options.testDir || settings.testDir,
    baseURL: options.baseURL || settings.baseURL,
    authDir: (options.authDir || settings.authDir || "").startsWith("./")
      ? (options.authDir || settings.authDir || "").slice(2)
      : options.authDir || settings.authDir,
    envDir: (options.envDir || settings.envDir || "").startsWith("./")
      ? (options.envDir || settings.envDir || "").slice(2)
      : options.envDir || settings.envDir,
  };

  // Step 3: GitHub Actions setup
  let githubActions = DEFAULT_QA_CONFIG.githubActions;
  if (!options.skipGithubActions) {
    githubActions = await setupGithubActions();
  }

  // Step 4: API Key setup
  const { apiKey } = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message: "Enter your Anthropic API key (optional, you can add it later):",
      mask: "*",
      validate: (input) => {
        if (!input.trim()) {
          return true; // Allow empty - will use placeholder
        }
        if (!input.startsWith("sk-")) {
          return 'Anthropic API keys should start with "sk-"';
        }
        return true;
      },
    },
  ]);

  // Set the API key in environment for this session if provided
  if (apiKey?.trim()) {
    process.env.ANTHROPIC_API_KEY = apiKey.trim();
  }

  // Step 5: Setup file configuration
  const { enableSetup } = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableSetup",
      message: "Do you want to use a setup file for authentication?",
      default: true,
    },
  ]);

  let setupPath = "";
  let shouldCreateSetup = false;
  let shouldUpdatePlaywrightConfig = false;

  if (enableSetup) {
    const { setupChoice } = await inquirer.prompt([
      {
        type: "list",
        name: "setupChoice",
        message: "Setup file configuration:",
        choices: [
          { name: "Create new setup file", value: "create" },
          { name: "Configure existing setup file path", value: "configure" },
        ],
      },
    ]);

    if (setupChoice === "create") {
      const { newSetupPath } = await inquirer.prompt([
        {
          type: "input",
          name: "newSetupPath",
          message: "Setup file path:",
          default: `${finalSettings.testDir}/auth.setup.ts`,
          validate: (input) => {
            if (!input.trim()) {
              return "Setup file path cannot be empty";
            }
            if (!input.endsWith(".ts") && !input.endsWith(".js")) {
              return "Setup file must be a TypeScript or JavaScript file";
            }
            return true;
          },
          filter: (input) => (input.startsWith("./") ? input.slice(2) : input),
        },
      ]);

      setupPath = newSetupPath;
      shouldCreateSetup = true;
      shouldUpdatePlaywrightConfig = true;
    } else {
      const { existingSetupPath } = await inquirer.prompt([
        {
          type: "input",
          name: "existingSetupPath",
          message: "Path to existing setup file:",
          default: `${finalSettings.testDir}/auth.setup.ts`,
          validate: (input) => {
            if (!input.trim()) {
              return "Setup file path cannot be empty";
            }
            if (!input.endsWith(".ts") && !input.endsWith(".js")) {
              return "Setup file must be a TypeScript or JavaScript file";
            }
            return true;
          },
          filter: (input) => (input.startsWith("./") ? input.slice(2) : input),
        },
      ]);

      setupPath = existingSetupPath;
      shouldCreateSetup = false;
      shouldUpdatePlaywrightConfig = false;
    }
  }

  // Step 6: Create initial config
  const config: QADirectorConfig = {
    baseURL: finalSettings.baseURL,
    testDir: finalSettings.testDir,
    roles: [], // Empty initially
    authDir: finalSettings.authDir,
    githubActions,
    setup: {
      path: setupPath,
      enabled: enableSetup,
    },
    envDir: finalSettings.envDir,
    playwrightConfig: selectedConfig,
  };

  // Step 7: Create files and directories
  try {
    await ensureDirectoryExists(config.testDir);
    await ensureDirectoryExists(config.authDir);

    if (shouldCreateSetup) {
      await createSetupFile(config);
    }

    await createEnvFiles(config, apiKey?.trim() || undefined);

    if (shouldUpdatePlaywrightConfig) {
      const updatedConfig = await updatePlaywrightConfigWithSetup(config);
      Object.assign(config, updatedConfig);
    }

    await saveConfig(config);

    console.log(chalk.green(CLI_MESSAGES.INIT.SUCCESS));
    console.log(chalk.cyan("\nFiles created:"));
    console.log(chalk.cyan(`  - qa-director.config.ts`));

    if (shouldCreateSetup) {
      console.log(chalk.cyan(`  - ${config.setup.path}`));
    }

    console.log(chalk.cyan(`  - ${config.envDir}`));
    console.log(chalk.cyan(`  - ${config.envDir}.example`));

    if (githubActions.enabled) {
      console.log(chalk.cyan(`  - ${githubActions.path}`));
    }

    if (shouldUpdatePlaywrightConfig) {
      console.log(chalk.cyan("\nFiles updated:"));
      console.log(
        chalk.cyan(`  - ${config.playwrightConfig} (added setup configuration)`)
      );
    }

    if (enableSetup && !shouldCreateSetup) {
      console.log(chalk.cyan("\nSetup file configured:"));
      console.log(chalk.cyan(`  - ${config.setup.path} (existing file)`));
    }

    if (!enableSetup) {
      console.log(
        chalk.yellow(
          "\nSetup file disabled - you can enable it later in qa-director.config.ts"
        )
      );
    }
  } catch (error) {
    console.error(chalk.red("❌ Failed to create files:"), error);
    process.exit(1);
  }

  // Step 8: Offer login
  const { shouldLogin } = await inquirer.prompt([
    {
      type: "confirm",
      name: "shouldLogin",
      message: "Would you like to set up a login role now?",
      default: true,
      when: enableSetup,
    },
  ]);

  if (enableSetup && shouldLogin) {
    const { roleName } = await inquirer.prompt([
      {
        type: "input",
        name: "roleName",
        message: "Enter role name:",
        default: "user",
        validate: (input) => {
          if (!input.trim()) {
            return "Role name cannot be empty";
          }
          if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input)) {
            return "Role name must start with a letter and contain only letters, numbers, hyphens, and underscores";
          }
          return true;
        },
      },
    ]);

    try {
      await loginCommand({ role: roleName });
    } catch (error) {
      console.error(chalk.red("❌ Login setup failed:"), error);
      console.log(
        chalk.yellow(
          "You can set up login later with: qa-director login",
          roleName
        )
      );
    }
  }

  console.log(chalk.green("\n🎉 QA Director is ready!"));
  console.log(chalk.cyan("\nNext steps:"));

  if (!enableSetup) {
    console.log(
      chalk.cyan(
        "1. Enable setup in qa-director.config.ts if you want to use authentication"
      )
    );
    console.log(
      chalk.cyan(
        '2. Generate tests without authentication: qa-director generate "Your test description"'
      )
    );

    if (githubActions.enabled) {
      console.log(
        chalk.cyan("3. Add secrets to your GitHub repository for CI/CD")
      );
    }
  } else if (!apiKey?.trim()) {
    console.log(chalk.cyan("1. Add your ANTHROPIC_API_KEY to .env.qa"));
    console.log(
      chalk.cyan(
        '2. Generate your first test: qa-director generate --role <role> "Your test description"'
      )
    );

    if (githubActions.enabled) {
      console.log(
        chalk.cyan("3. Add secrets to your GitHub repository for CI/CD")
      );
    }
  } else {
    console.log(
      chalk.cyan(
        '1. Generate your first test: qa-director generate --role <role> "Your test description"'
      )
    );

    if (githubActions.enabled) {
      console.log(
        chalk.cyan("2. Add secrets to your GitHub repository for CI/CD")
      );
    }
  }
}
