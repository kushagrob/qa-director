import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDir, createTempDir } from "./setup.js";

vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(),
}));

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("../src/utils/logger.js", () => ({
  loggers: {
    debug: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("chalk", () => ({
  default: {
    cyan: (str: string) => str,
    red: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
  },
}));

describe("Claude Code Integration", () => {
  let tempDir: string;
  let originalCwd: string;
  let originalApiKey: string | undefined;
  let mockQuery: any;
  let mockInquirer: any;

  beforeEach(async () => {
    tempDir = await createTempDir(`claude-code-test-${Date.now()}`);
    originalCwd = process.cwd();
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.chdir(tempDir);

    const { query } = await import("@anthropic-ai/claude-code");
    const inquirer = await import("inquirer");

    mockQuery = vi.mocked(query);
    mockInquirer = vi.mocked(inquirer.default);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
    process.env.ANTHROPIC_API_KEY = originalApiKey;
    vi.clearAllMocks();
  });

  describe("callClaudeCode", () => {
    it("should successfully execute Claude Code query", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const mockMessages = [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Creating test file..." }],
          },
        },
        {
          type: "result",
          subtype: "success",
          duration_ms: 5000,
          total_cost_usd: 0.05,
          num_turns: 3,
        },
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const { callClaudeCode } = await import("../src/core/claude-code.js");

      const result = await callClaudeCode("Create a test file", {
        maxTurns: 5,
        cwd: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.duration).toBe(5000);
      expect(result.cost).toBe(0.05);
      expect(result.turns).toBe(3);
      expect(result.messages).toEqual(mockMessages);
    });

    it("should handle missing API key", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      mockInquirer.prompt.mockResolvedValueOnce({ shouldProvideKey: false });

      const { callClaudeCode } = await import("../src/core/claude-code.js");

      const result = await callClaudeCode("Test prompt");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "ANTHROPIC_API_KEY environment variable is not set"
      );
    });

    it("should handle execution errors", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const mockMessages = [
        {
          type: "result",
          subtype: "error_during_execution",
          duration_ms: 2000,
          total_cost_usd: 0.02,
          num_turns: 1,
        },
      ];

      mockQuery.mockImplementation(async function* () {
        for (const message of mockMessages) {
          yield message;
        }
      });

      const { callClaudeCode } = await import("../src/core/claude-code.js");

      const result = await callClaudeCode("Failing task");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Error occurred during execution");
    });

    it("should handle query exceptions", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const error = new Error("Network error");
      mockQuery.mockImplementation(() => {
        throw error;
      });

      const { callClaudeCode } = await import("../src/core/claude-code.js");

      const result = await callClaudeCode("Test prompt");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });
});
