import { anthropic } from "@ai-sdk/anthropic";
import { experimental_createMCPClient, LanguageModel, streamText } from "ai";
import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";
import { BrowserAgentResult } from "../types/index.js";
import { loggers } from "../utils/logger.js";
import { BROWSER_AGENT_PROMPT } from "../utils/prompts.js";

let mcpClient: any = null;

async function initializeMcpClient(storageStatePath?: string) {
  if (mcpClient) return mcpClient;

  const args = ["@playwright/mcp", "--isolated"];
  if (storageStatePath) {
    args.push(`--storage-state=${storageStatePath}`);
  }

  const transport = new Experimental_StdioMCPTransport({
    command: "npx",
    args,
  });

  mcpClient = await experimental_createMCPClient({
    transport,
  });

  return mcpClient;
}

export async function getTools(storageStatePath?: string) {
  const client = await initializeMcpClient(storageStatePath);
  const mcpTools: { [key: string]: any } = await client.tools();

  if (mcpTools.browser_take_screenshot) {
    const originalScreenshotTool = mcpTools.browser_take_screenshot;
    mcpTools.browser_take_screenshot = {
      ...originalScreenshotTool,
      description: "Takes a screenshot of the current page.",

      experimental_toToolResultContent: (result: any) => {
        if (result && result.content && Array.isArray(result.content)) {
          return result.content;
        }

        // Otherwise treat as base64 string
        return [
          {
            type: "image",
            source: {
              base64: {
                data: result || "",
              },
            },
          },
        ];
      },
    };
  }

  return mcpTools;
}

export async function cleanup() {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}

export async function runBrowserAgent(
  query: string,
  storageStatePath?: string,
  baseURL?: string,
  config: {
    trajectoryModel?: LanguageModel;
    maxSteps?: number;
  } = {}
): Promise<BrowserAgentResult> {
  const {
    trajectoryModel = anthropic("claude-3-7-sonnet-latest"),
    maxSteps = 50,
  } = config;

  try {
    const tools = await getTools(storageStatePath);

    const fullQuery = baseURL ? `${query}. Start at ${baseURL}` : query;

    let output = "";

    const result = streamText({
      model: trajectoryModel,
      tools,
      system: BROWSER_AGENT_PROMPT,
      prompt: fullQuery,
      maxSteps,
      onStepFinish: (step) => {
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((toolCall) => {
            loggers.info(`\n🔧   Tool: ${toolCall.toolName}`);

            // Add tool call details to output
            output += `Tool Call: ${toolCall.toolName}\n`;
            if (toolCall.args) {
              output += `Arguments: ${JSON.stringify(toolCall.args, null, 2)}\n`;
            }
          });
        }

        if (step.toolResults && step.toolResults.length > 0) {
          step.toolResults.forEach((toolResult) => {
            // Skip screenshot tool results entirely
            if (
              toolResult &&
              toolResult.toolName === "browser_take_screenshot"
            ) {
              return;
            }

            if (toolResult && toolResult.result) {
              // Handle string results
              if (typeof toolResult.result === "string") {
                output += `Tool Result: ${toolResult.result}\n`;
              } else if (typeof toolResult.result === "object") {
                output += `Tool Result: ${JSON.stringify(toolResult.result, null, 2)}\n`;
              }
            }
          });
        }
      },
    });

    for await (const textPart of result.textStream) {
      // Only process string text parts, skip objects to avoid [object Object]
      if (typeof textPart === "string") {
        process.stdout.write(textPart);
        output += textPart;
      }
    }

    await cleanup();

    return {
      success: true,
      output,
    };
  } catch (error) {
    await cleanup();
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Legacy export for backward compatibility
export async function main(
  query: string,
  storageStatePath?: string,
  schema?: any,
  config?: any
): Promise<BrowserAgentResult> {
  return runBrowserAgent(query, storageStatePath, undefined, config);
}
