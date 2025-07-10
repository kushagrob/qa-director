// Main exports for programmatic usage
export { initCommand } from "./src/cli/commands/init.js";
export { loginCommand } from "./src/cli/commands/login.js";
export { generateCommand } from "./src/cli/commands/generate.js";

// Core functionality exports
export {
  loadConfig,
  saveConfig,
  addRole,
  removeRole,
} from "./src/core/config.js";
export { runBrowserAgent } from "./src/core/browser-agent.js";
export { callClaudeCode } from "./src/core/claude-code.js";

// Type exports
export type {
  QADirectorConfig,
  Role,
  InitOptions,
  LoginOptions,
  GenerateOptions,
} from "./src/types/index.js";
