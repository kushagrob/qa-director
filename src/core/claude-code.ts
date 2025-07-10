import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import chalk from "chalk";
import fs from "fs";
import inquirer from "inquirer";
import path from "path";
import { ClaudeCodeResult } from "../types/index.js";
import { loggers } from "../utils/logger.js";

export async function callClaudeCode(
  prompt: string,
  options: {
    maxTurns?: number;
    allowedTools?: string[];
    disallowedTools?: string[];
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan";
    cwd?: string;
    model?: string;
    fallbackModel?: string;
  } = {}
): Promise<ClaudeCodeResult> {
  const {
    maxTurns = 10,
    allowedTools,
    disallowedTools,
    permissionMode = "default",
    cwd = process.cwd(),
    model,
    fallbackModel,
  } = options;

  // Ensure we're working in the user's project directory
  const workingDir = path.resolve(cwd);

  // Verify the working directory exists and is accessible
  if (!fs.existsSync(workingDir)) {
    return {
      success: false,
      duration: 0,
      cost: 0,
      turns: 0,
      error: `Working directory does not exist: ${workingDir}`,
      messages: [],
    };
  }

  // Log the working directory for debugging
  loggers.debug(`Working directory: ${workingDir}`);

  // Check for API key and prompt if missing
  if (!process.env.ANTHROPIC_API_KEY) {
    loggers.warn("ANTHROPIC_API_KEY environment variable is not set");

    const { shouldProvideKey } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldProvideKey",
        message: "Would you like to provide your Anthropic API key now?",
        default: true,
      },
    ]);

    if (!shouldProvideKey) {
      return {
        success: false,
        duration: 0,
        cost: 0,
        turns: 0,
        error: "ANTHROPIC_API_KEY environment variable is not set",
        messages: [],
      };
    }

    const { apiKey } = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "Enter your Anthropic API key:",
        mask: "*",
        validate: (input) => {
          if (!input.trim()) {
            return "API key cannot be empty";
          }
          if (!input.startsWith("sk-ant-")) {
            return 'API key should start with "sk-ant-"';
          }
          return true;
        },
      },
    ]);

    // Set the API key for this session
    process.env.ANTHROPIC_API_KEY = apiKey.trim();
    loggers.success("API key set successfully");
  }

  const messages: SDKMessage[] = [];

  try {
    const queryOptions: any = {
      maxTurns,
      permissionMode,
      cwd: workingDir,
    };

    if (allowedTools) queryOptions.allowedTools = allowedTools;
    if (disallowedTools) queryOptions.disallowedTools = disallowedTools;
    if (model) queryOptions.model = model;
    if (fallbackModel) queryOptions.fallbackModel = fallbackModel;

    for await (const message of query({
      prompt,
      abortController: new AbortController(),
      options: queryOptions,
    })) {
      messages.push(message);

      if (message.type === "assistant") {
        const content = message.message.content[0];
        if (content?.type === "text") {
          process.stdout.write(chalk.cyan(content.text));
        }
      }
    }

    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.type === "result" && lastMessage.subtype === "success") {
      return {
        success: true,
        duration: lastMessage.duration_ms,
        cost: lastMessage.total_cost_usd,
        turns: lastMessage.num_turns,
        messages,
      };
    } else {
      // Get more detailed error information
      let errorMessage = "Claude Code execution failed";

      if (lastMessage?.type === "result") {
        if (lastMessage.subtype === "error_max_turns") {
          errorMessage = `Maximum turns (${maxTurns}) reached without completion`;
        } else if (lastMessage.subtype === "error_during_execution") {
          errorMessage = "Error occurred during execution";
        }
      }

      // Look for assistant messages that might contain error details
      const assistantMessages = messages.filter((m) => m.type === "assistant");
      if (assistantMessages.length > 0) {
        const lastAssistant = assistantMessages[assistantMessages.length - 1];
        const content = lastAssistant.message.content[0];
        if (content?.type === "text" && content.text) {
          errorMessage += `: ${content.text.slice(0, 200)}...`;
        }
      }

      return {
        success: false,
        duration: lastMessage?.type === "result" ? lastMessage.duration_ms : 0,
        cost: lastMessage?.type === "result" ? lastMessage.total_cost_usd : 0,
        turns: lastMessage?.type === "result" ? lastMessage.num_turns : 0,
        error: errorMessage,
        messages,
      };
    }
  } catch (error) {
    return {
      success: false,
      duration: 0,
      cost: 0,
      turns: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      messages,
    };
  }
}
