import fs from "fs/promises";
import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import { QADirectorConfig, Role } from "../types/index.js";
import {
  createSetupScaffold,
  createSetupProjectConfig,
} from "../utils/constants.js";
import { callClaudeCode } from "./claude-code.js";
import {
  createRoleAdditionPrompt,
  addToPlaywrightConfigPrompt,
} from "../utils/prompts.js";

export async function createSetupFile(config: QADirectorConfig): Promise<void> {
  const setupPath = config.setup.path;
  const setupDir = path.dirname(setupPath);

  await fs.mkdir(setupDir, { recursive: true });

  const scaffold = createSetupScaffold(config.envDir);
  await fs.writeFile(setupPath, scaffold);
}

export async function updateSetupFile(
  config: QADirectorConfig,
  role: Role,
  loginFlow: string
): Promise<void> {
  // Check if setup file exists
  const setupPath = path.join(process.cwd(), config.setup.path);
  try {
    await fs.access(setupPath);
  } catch {
    console.log(
      `⚠️  Setup file not found at ${config.setup.path}, skipping setup update`
    );
    return;
  }

  const prompt = createRoleAdditionPrompt(loginFlow, config.setup.path);

  const result = await callClaudeCode(prompt, {
    maxTurns: 5,
    allowedTools: ["Write", "Edit", "ReadFile"],
    permissionMode: "acceptEdits",
  });

  if (!result.success) {
    console.log(
      `⚠️  Failed to update setup file automatically: ${result.error}`
    );
    console.log(
      `📝 You may need to manually add the "${role.name}" role to your ${config.setup.path} file`
    );
    // Don't throw error, just warn the user
    return;
  }
}

export async function updatePlaywrightConfig(
  config: QADirectorConfig,
  role: Role
): Promise<void> {
  // Check if Playwright config file exists
  const configPath = path.join(process.cwd(), config.playwrightConfig);
  try {
    await fs.access(configPath);
  } catch {
    console.log(
      `⚠️  Playwright config file not found at ${config.playwrightConfig}, skipping config update`
    );
    return;
  }

  const setupProjectName = config.setup.projectName || "setup";
  const prompt = addToPlaywrightConfigPrompt(
    config.playwrightConfig,
    role.name,
    setupProjectName
  );

  const result = await callClaudeCode(prompt, {
    maxTurns: 5,
    allowedTools: ["Write", "Edit", "ReadFile"],
    permissionMode: "acceptEdits",
  });

  if (!result.success) {
    console.log(
      `⚠️  Failed to update Playwright config automatically: ${result.error}`
    );
    console.log(
      `📝 You may need to manually add the "${role.name}" role to your ${config.playwrightConfig} file`
    );
    console.log(`💡 Add this project configuration:`);
    console.log(`   {
      name: '${role.name}',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '${role.storagePath}',
      },
      testDir: '${role.folder || config.testDir}',
      testMatch: ${JSON.stringify(role.testMatch || ["**/*.{test,spec}.{js,ts}"])},
      dependencies: ['${setupProjectName}']
    }`);
    // Don't throw error, just warn the user
    return;
  }
}

async function checkExistingSetupProjects(
  configPath: string
): Promise<string[]> {
  try {
    const configContent = await fs.readFile(configPath, "utf-8");

    // Look for existing setup projects - projects with names like 'setup', 'auth-setup', etc.
    const setupProjectRegex = /name:\s*['"]([^'"]*setup[^'"]*)['"]/gi;
    const matches = [];
    let match;

    while ((match = setupProjectRegex.exec(configContent)) !== null) {
      matches.push(match[1]);
    }

    return matches;
  } catch (error) {
    return [];
  }
}

export async function updatePlaywrightConfigWithSetup(
  config: QADirectorConfig
): Promise<QADirectorConfig> {
  const configPath = path.join(process.cwd(), config.playwrightConfig);
  try {
    await fs.access(configPath);
  } catch {
    console.log(
      `⚠️  Playwright config file not found at ${config.playwrightConfig}, skipping setup config`
    );
    return config;
  }

  let setupProjectName = config.setup.projectName || "setup";

  try {
    // Check for existing setup projects
    const existingSetupProjects = await checkExistingSetupProjects(configPath);

    if (existingSetupProjects.length > 0) {
      console.log(
        chalk.yellow(
          `🔍 Found existing setup projects in ${config.playwrightConfig}:`
        )
      );
      existingSetupProjects.forEach((name) =>
        console.log(chalk.cyan(`  - ${name}`))
      );

      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "How would you like to handle the existing setup project?",
          choices: [
            {
              name: "Add another setup project with a different name",
              value: "add",
            },
            { name: "Replace the existing setup project", value: "replace" },
            { name: "Skip adding setup project", value: "skip" },
          ],
        },
      ]);

      if (action === "skip") {
        console.log(chalk.yellow("⏭️  Skipping setup project addition"));
        return config;
      }

      if (action === "add") {
        const { customName } = await inquirer.prompt([
          {
            type: "input",
            name: "customName",
            message: "Enter name for the new setup project:",
            default: "qa-setup",
            validate: (input) => {
              if (!input.trim()) {
                return "Setup project name cannot be empty";
              }
              if (existingSetupProjects.includes(input.trim())) {
                return "A setup project with this name already exists";
              }
              return true;
            },
          },
        ]);

        setupProjectName = customName.trim();
      }

      if (action === "replace") {
        if (existingSetupProjects.length === 1) {
          setupProjectName = existingSetupProjects[0];
        } else {
          const { selectedProject } = await inquirer.prompt([
            {
              type: "list",
              name: "selectedProject",
              message: "Which setup project would you like to replace?",
              choices: existingSetupProjects,
            },
          ]);
          setupProjectName = selectedProject;
        }
      }
    }

    // Read the playwright config file
    const configContent = await fs.readFile(configPath, "utf-8");

    // Find the projects array and add/replace the setup project
    const setupProjectConfig = createSetupProjectConfig(
      config.setup.path,
      setupProjectName
    );

    // Simple regex to find projects array and add setup project
    const projectsRegex = /projects:\s*\[/;
    const match = configContent.match(projectsRegex);

    if (match) {
      let updatedContent = configContent;

      if (existingSetupProjects.includes(setupProjectName)) {
        // Replace existing setup project
        const existingProjectRegex = new RegExp(
          `{[^}]*name:\\s*['"]${setupProjectName}['"][^}]*}`,
          "g"
        );
        updatedContent = updatedContent.replace(
          existingProjectRegex,
          setupProjectConfig
        );
        console.log(
          chalk.green(
            `✅ Replaced setup project '${setupProjectName}' in ${config.playwrightConfig}`
          )
        );
      } else {
        // Add new setup project as first item in projects array
        updatedContent = updatedContent.replace(
          /projects:\s*\[/,
          `projects: [\n    ${setupProjectConfig},`
        );
        console.log(
          chalk.green(
            `✅ Added setup project '${setupProjectName}' to ${config.playwrightConfig}`
          )
        );
      }

      await fs.writeFile(configPath, updatedContent);

      // Update the config with the setup project name
      const updatedConfig = {
        ...config,
        setup: {
          ...config.setup,
          projectName: setupProjectName,
        },
      };

      return updatedConfig;
    } else {
      console.log(
        `⚠️  Could not find projects array in ${config.playwrightConfig}`
      );
      console.log(`📝 You may need to manually add the setup project:`);
      console.log(`   ${setupProjectConfig}`);
      return config;
    }
  } catch (error) {
    console.log(`⚠️  Failed to update Playwright config: ${error}`);
    console.log(
      `📝 You may need to manually add the setup project to your ${config.playwrightConfig} file`
    );
    console.log(`💡 Add this to your projects array:`);
    console.log(
      `   ${createSetupProjectConfig(config.setup.path, setupProjectName)}`
    );
    return config;
  }
}

export async function createEnvFiles(
  config: QADirectorConfig,
  apiKey?: string
): Promise<void> {
  const envPath = config.envDir;
  const examplePath = `${envPath}.example`;

  const envContent = `# QA Director Environment Variables
ANTHROPIC_API_KEY=${apiKey || "your_anthropic_api_key_here"}
`;

  const exampleContent = `# QA Director Environment Variables
ANTHROPIC_API_KEY=your_anthropic_api_key_here
`;

  await fs.writeFile(envPath, envContent);
  await fs.writeFile(examplePath, exampleContent);
}

export async function updateEnvFiles(
  config: QADirectorConfig,
  envVars: string[],
  actualValues?: Record<string, string>
): Promise<void> {
  const envPath = config.envDir;
  const examplePath = `${envPath}.example`;

  let envContent = "";
  let exampleContent = "";

  try {
    envContent = await fs.readFile(envPath, "utf-8");
    exampleContent = await fs.readFile(examplePath, "utf-8");
  } catch {
    // Files don't exist yet
    envContent = `# QA Director Environment Variables
ANTHROPIC_API_KEY=your_anthropic_api_key_here
`;
    exampleContent = `# QA Director Environment Variables
ANTHROPIC_API_KEY=your_anthropic_api_key_here
`;
  }

  for (const envVar of envVars) {
    const actualValue = actualValues?.[envVar];
    const envLine = `${envVar}=${actualValue || `your_${envVar.toLowerCase()}_here`}\n`;
    const exampleLine = `${envVar}=your_${envVar.toLowerCase()}_here\n`;

    if (!envContent.includes(envVar)) {
      envContent += envLine;
    }
    if (!exampleContent.includes(envVar)) {
      exampleContent += exampleLine;
    }
  }

  await fs.writeFile(envPath, envContent);
  await fs.writeFile(examplePath, exampleContent);
}

export async function createRoleFolder(
  config: QADirectorConfig,
  role: Role
): Promise<void> {
  if (!role.folder) return;

  const folderPath = path.join(process.cwd(), role.folder);
  await fs.mkdir(folderPath, { recursive: true });

  const readmePath = path.join(folderPath, "README.md");
  const readmeContent = `# ${role.name} Role Tests

This directory contains tests that run with the "${role.name}" role authentication.

## Auth State
- Storage state: \`${role.storagePath}\`
- Test match: \`${role.testMatch?.join(", ") || "default"}\`

## Usage
Tests in this directory will automatically use the "${role.name}" authentication state.
`;

  await fs.writeFile(readmePath, readmeContent);
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function copyFile(
  source: string,
  destination: string
): Promise<void> {
  const destDir = path.dirname(destination);
  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(source, destination);
}

export async function appendToFile(
  filePath: string,
  content: string
): Promise<void> {
  try {
    await fs.appendFile(filePath, content);
  } catch (error) {
    throw new Error(`Failed to append to file ${filePath}: ${error}`);
  }
}

export async function readFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error}`);
  }
}

export async function writeFileContent(
  filePath: string,
  content: string
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
}
