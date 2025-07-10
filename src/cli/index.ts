#!/usr/bin/env node

process.env.NODE_NO_WARNINGS = "1";
process.env.NODE_OPTIONS = "--no-deprecation";

import { Command } from "commander";
import dotenv from "dotenv";
import { loggers } from "../utils/logger.js";
import { ejectCommand } from "./commands/eject.js";
import { generateCommand } from "./commands/generate.js";
import { initCommand } from "./commands/init.js";
import { loginCommand } from "./commands/login.js";

// Load environment variables
dotenv.config({ path: ".env.qa" });

const program = new Command();

program
  .name("qa-director")
  .description("AI-powered E2E test generation and management")
  .version("1.0.0");

// Global error handler
process.on("uncaughtException", (error) => {
  loggers.error("Unexpected error:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  loggers.error("Unhandled promise rejection:", reason);
  process.exit(1);
});

// Init command
program
  .command("init")
  .description("Initialize qa-director in current project")
  .option("--skip-github-actions", "Skip GitHub Actions setup")
  .option("--playwright-config <path>", "Path to Playwright config file")
  .option("--test-dir <path>", "Test directory path")
  .option("--base-url <url>", "Base URL for tests")
  .option("--auth-dir <path>", "Authentication directory path")
  .option("--env-dir <path>", "Environment file path")
  .action(initCommand);

// Login command
program
  .command("login")
  .description("Login and save authentication state for a role")
  .argument("[role]", "Role name to login as")
  .option("--role <role>", "Role name to login as")
  .option("--refresh", "Refresh existing role authentication")
  .action((positionalRole, options) => {
    const role = positionalRole || options.role;
    if (!role) {
      loggers.error("Role name is required. Use either 'qa-director login <role>' or 'qa-director login --role <role>'");
      process.exit(1);
    }
    loginCommand({ role, refresh: options.refresh });
  });

// Generate command
program
  .command("generate")
  .description("Generate E2E test using AI")
  .option("--role <role>", "Role to use for test generation")
  .option("--debug", "Show the full prompt sent to Claude")
  .argument("[description]", "Test description")
  .action(generateCommand);

// Eject command
program
  .command("eject")
  .description("Remove qa-director files and configurations")
  .option("--dry-run", "Show what would be removed without actually removing")
  .option("--force", "Skip confirmation prompt")
  .option(
    "--role <role>",
    "Remove only the specified role instead of everything"
  )
  .action(ejectCommand);

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
