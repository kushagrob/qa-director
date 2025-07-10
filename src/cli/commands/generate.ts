import inquirer from "inquirer";
import path from "path";
import { runBrowserAgent } from "../../core/browser-agent.js";
import { callClaudeCode } from "../../core/claude-code.js";
import { getRole, loadConfig } from "../../core/config.js";
import { CLI_MESSAGES, ensureProjectDirectory } from "../../utils/constants.js";
import { loggers } from "../../utils/logger.js";
import { createCodeGenerationPrompt } from "../../utils/prompts.js";

interface GenerateCommandOptions {
  role?: string;
  debug?: boolean;
}

export async function generateCommand(
  description: string,
  options: GenerateCommandOptions = {}
) {
  try {
    ensureProjectDirectory();

    // Check for Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      loggers.error(CLI_MESSAGES.ERRORS.MISSING_ANTHROPIC_KEY);
      loggers.console.yellow("Add it to your .env.qa file:");
      loggers.console.cyan("ANTHROPIC_API_KEY=your_api_key_here");
      process.exit(1);
    }

    // If description is not provided, prompt for it
    if (!description || description.trim().length === 0) {
      const { promptedDescription } = await inquirer.prompt([
        {
          type: "input",
          name: "promptedDescription",
          message: "Enter a description for the test to generate:",
          validate: (input) => {
            if (input.trim().length === 0) {
              return "Please enter a description for the test.";
            }
            return true;
          },
        },
      ]);
      description = promptedDescription;
    }

    const config = await loadConfig();
    if (!config) {
      loggers.error(CLI_MESSAGES.ERRORS.NO_CONFIG);
      process.exit(1);
    }

    let { role } = options;

    // If role is not provided, prompt for it
    if (!role) {
      const availableRoles = config.roles.map((r) => r.name);

      if (availableRoles.length === 0) {
        loggers.error(
          "No roles found. Create a role first using `qa-director login <role>`"
        );
        process.exit(1);
      }

      const { selectedRole } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedRole",
          message: "Select a role for test generation:",
          choices: availableRoles,
        },
      ]);

      role = selectedRole;
    }

    // At this point, role is definitely defined
    const roleConfig = await getRole(role!);

    if (!roleConfig) {
      const availableRoles = config.roles.map((r) => r.name).join(", ");
      loggers.error(
        `${CLI_MESSAGES.ERRORS.ROLE_NOT_FOUND} ${availableRoles || "none"}`
      );
      process.exit(1);
    }

    loggers.console.blue(
      `${CLI_MESSAGES.GENERATE.START} '${role}': ${description}`
    );

    // Step 1: Run browser agent
    loggers.console.yellow(CLI_MESSAGES.GENERATE.BROWSER_AUTOMATION);

    const browserResult = await runBrowserAgent(
      description,
      roleConfig.storagePath,
      config.baseURL
    );

    if (!browserResult.success) {
      loggers.error("Browser automation failed:", browserResult.error);
      process.exit(1);
    }

    loggers.success("Browser automation completed successfully!");

    // Ask user if they want to proceed with test generation
    const { shouldGenerateTest } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldGenerateTest",
        message:
          "Browser automation completed. Do you want to generate the test code?",
        default: true,
      },
    ]);

    if (!shouldGenerateTest) {
      loggers.console.yellow("Test generation cancelled.");
      process.exit(0);
    }

    // Ask for additional specific instructions
    const { hasAdditionalInstructions } = await inquirer.prompt([
      {
        type: "confirm",
        name: "hasAdditionalInstructions",
        message:
          "Do you want to provide additional specific instructions for the test generation?",
        default: false,
      },
    ]);

    let additionalInstructions = "";
    if (hasAdditionalInstructions) {
      const { instructions } = await inquirer.prompt([
        {
          type: "input",
          name: "instructions",
          message: "Enter additional instructions for the test generation:",
          validate: (input) => {
            if (input.trim().length === 0) {
              return "Please enter some instructions or press Ctrl+C to cancel.";
            }
            return true;
          },
        },
      ]);
      additionalInstructions = instructions;
    }

    // Ask for filename
    const { hasCustomFilename } = await inquirer.prompt([
      {
        type: "confirm",
        name: "hasCustomFilename",
        message: "Do you want to specify a filename for the generated test?",
        default: false,
      },
    ]);

    let customFilename = "";
    if (hasCustomFilename) {
      const { filename } = await inquirer.prompt([
        {
          type: "input",
          name: "filename",
          message: "Enter the filename (without extension):",
          validate: (input) => {
            if (input.trim().length === 0) {
              return "Please enter a filename or press Ctrl+C to cancel.";
            }
            // Basic validation for filename
            if (!/^[a-zA-Z0-9_.-]+$/.test(input.trim())) {
              return "Filename can only contain letters, numbers, dots, hyphens, and underscores.";
            }
            return true;
          },
        },
      ]);
      customFilename = filename.trim();
    }

    // Step 2: Generate test with Claude Code
    loggers.console.yellow(CLI_MESSAGES.GENERATE.CODE_GENERATION);

    // Combine original description with additional instructions and filename
    let finalDescription = additionalInstructions
      ? `${description}\n\nAdditional instructions: ${additionalInstructions}`
      : description;

    if (customFilename) {
      finalDescription += `\n\nFilename: Please name the generated test file "${customFilename}".`;
    }

    const codeGenPrompt = createCodeGenerationPrompt(
      browserResult.output,
      finalDescription,
      role
    );

    // Debug mode: show the full prompt
    if (options.debug) {
      loggers.console.magenta(
        "🐛 DEBUG MODE: Full prompt being sent to Claude:"
      );
      loggers.console.gray("=" + "=".repeat(80));
      loggers.console.log(codeGenPrompt);
      loggers.console.gray("=" + "=".repeat(80));
      loggers.console.log("");
    }

    const result = await callClaudeCode(codeGenPrompt, {
      maxTurns: 25,
      allowedTools: ["Write", "Edit", "ReadFile"],
      cwd: process.cwd(),
    });

    if (result.success) {
      loggers.success(CLI_MESSAGES.GENERATE.SUCCESS);
      loggers.console.cyan(`💰 Cost: $${result.cost.toFixed(4)}`);
      loggers.console.cyan(`🔄 Turns: ${result.turns}`);
      loggers.console.cyan(
        `⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`
      );

      // Ask if they want to run the generated test
      const { shouldRun } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldRun",
          message: "Would you like to run the generated test now?",
          default: false,
        },
      ]);

      if (shouldRun) {
        await runGeneratedTest(config, roleConfig);
      }
    } else {
      loggers.error(CLI_MESSAGES.GENERATE.FAILED, result.error);
      process.exit(1);
    }
  } catch (error) {
    loggers.error("An error occurred:", error);
    process.exit(1);
  }
}

async function runGeneratedTest(config: any, roleConfig: any): Promise<void> {
  const { spawn } = await import("child_process");
  const fs = await import("fs/promises");
  const { glob } = await import("glob");

  loggers.console.yellow("🧪 Running generated test...");

  try {
    // Find the most recently created test file for this role
    const testPatterns = roleConfig.testMatch || [
      "tests/**/*.{test,spec}.{js,ts}",
    ];
    const allTestFiles: string[] = [];

    for (const pattern of testPatterns) {
      const files = await glob(pattern);
      allTestFiles.push(...files);
    }

    if (allTestFiles.length === 0) {
      loggers.console.red("No test files found for this role");
      return;
    }

    // Get file stats and find the most recently modified file
    const filesWithStats = await Promise.all(
      allTestFiles.map(async (file) => {
        const stats = await fs.stat(file);
        return { file, mtime: stats.mtime };
      })
    );

    const mostRecentFile = filesWithStats.reduce((latest, current) =>
      current.mtime > latest.mtime ? current : latest
    ).file;

    loggers.console.cyan(`Running test: ${mostRecentFile}`);

    const testArgs = [
      "playwright",
      "test",
      mostRecentFile,
      "--project",
      roleConfig.name,
    ];

    const testProcess = spawn("npx", testArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        // Ensure the test runs with the correct storage state
        STORAGE_STATE: path.resolve(roleConfig.storagePath),
      },
    });

    testProcess.on("close", (code) => {
      if (code === 0) {
        loggers.success("✅ Test passed!");
      } else {
        loggers.error(`❌ Test failed with exit code ${code}`);
      }
    });

    testProcess.on("error", (error) => {
      loggers.error("Failed to run test:", error);
    });
  } catch (error) {
    loggers.error("Error finding test file:", error);
  }
}

// Utility function to validate test description
function validateDescription(description: string): boolean {
  return description.trim().length > 0;
}

// Utility function to suggest improvements for test descriptions
function suggestDescriptionImprovement(description: string): string[] {
  const suggestions = [];

  if (description.length < 10) {
    suggestions.push("Consider making the description more detailed");
  }

  if (!description.toLowerCase().includes("test")) {
    suggestions.push('Consider starting with "Test that..." for clarity');
  }

  if (!/[.!?]$/.test(description)) {
    suggestions.push("Consider ending with proper punctuation");
  }

  return suggestions;
}

// Export utilities for testing
export { suggestDescriptionImprovement, validateDescription };
