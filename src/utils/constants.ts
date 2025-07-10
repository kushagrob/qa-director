import fs from "fs";
import path from "path";
import { loggers } from "./logger.js";

export const SETUP_SCAFFOLD = `
import { test as setup } from '@playwright/test';
import { Page, BrowserContext } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import qa from '../qa-director.config.js';

dotenv.config({ path: qa.envDir });

type RoleConfig = {
  /** Absolute path for the storageState JSON this role will write */
  stateFile: string;
  /** The actual login routine */
  login: (page: Page, context: BrowserContext) => Promise<void>;
};

/* --------------------------------------------------------------------- */
/* 1 · Central dictionary.  Add new roles by appending one more entry.   */
/* --------------------------------------------------------------------- */
const roleSetups: Record<string, RoleConfig> = {
  /*
  Example (feel free to remove this):
  admin: {
    stateFile: path.join(qa.authDir, 'storageState.admin.json'),
    login: async (page: Page, context: BrowserContext) => {
      // Login flow for admin role
      await page.goto(qa.baseURL);
      await page.fill('[data-testid="email"]', process.env.QA_ADMIN_EMAIL || '');
      await page.fill('[data-testid="password"]', process.env.QA_ADMIN_PASSWORD || '');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL(/.*\\/dashboard/);
    }
  },
  */
  // ← qa-director will append the next role block right here
};

/* --------------------------------------------------------------------- */
/* 2 · Sets up login flow for each role       */
/* --------------------------------------------------------------------- */
for (const [role, { stateFile, login }] of Object.entries(roleSetups)) {
  setup(\`record \${role} state\`, async ({ page, context }) => {
    // Ensure folder exists
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    
    // Perform login
    await login(page, context);
    
    // Save authentication state
    await page.context().storageState({ path: stateFile });
  });
}

`;

export const createSetupProjectConfig = (
  setupPath: string,
  projectName: string = "setup"
) => `{
  name: '${projectName}',
  testMatch: '${setupPath}'
}`;

export const DEFAULT_QA_CONFIG = {
  baseURL: "http://localhost:3000",
  testDir: "./tests",
  roles: [],
  authDir: "playwright/.auth",
  githubActions: {
    enabled: false,
    path: ".github/workflows/qa-director.yml",
  },
  setup: {
    path: "./tests/auth.setup.ts",
    enabled: true,
    projectName: "setup",
  },
  envDir: ".env.qa",
  playwrightConfig: "playwright.config.ts",
};

export const CLI_MESSAGES = {
  INIT: {
    START: "🚀 Initializing qa-director...",
    SUCCESS: "✅ qa-director initialized successfully!",
    ALREADY_INITIALIZED:
      "⚠️  qa-director is already initialized in this directory",
    PLAYWRIGHT_NOT_FOUND: "⚠️  Playwright not detected in this project",
    NO_PLAYWRIGHT: "❌ No playwright.config.ts found.",
    PLAYWRIGHT_REQUIRED: "Playwright config is required. Exiting.",
    DETECTED_CONFIG: "✅ Found Playwright config:",
    MULTIPLE_CONFIGS: "Multiple Playwright configs found. Choose one:",
    GITHUB_ACTIONS_SETUP: "📋 Setting up GitHub Actions...",
    GITHUB_ACTIONS_CREATED: "✅ GitHub Actions workflow created",
    GITHUB_ACTIONS_SKIPPED: "⏭️  GitHub Actions setup skipped",
    ROLE_CREATION: "👤 Creating your first role...",
    ROLE_CREATED: "✅ Role created successfully!",
  },
  LOGIN: {
    START: "🔑 Logging in as role:",
    SUCCESS: "✅ Login successful!",
    FAILED: "❌ Login failed:",
    ROLE_CREATED: "✅ Role created and authentication saved:",
    ROLE_REFRESHED: "✅ Role authentication refreshed:",
    BROWSER_LAUNCH: "🌐 Launching browser for authentication...",
    RECORD_FLOW: "📹 Recording login flow...",
    FLOW_COMPLETE: "✅ Login flow recorded successfully!",
    SETUP_UPDATE: "📝 Updating setup files...",
    CONFIG_UPDATE: "⚙️  Updating configurations...",
    CODEGEN_START: "🌐 Starting Playwright codegen...",
    CODEGEN_INSTRUCTION:
      "Complete your login process in the browser, then close the browser window.",
    ENV_VARS_DETECTED: "🔍 Detected potential environment variables:",
  },
  GENERATE: {
    START: "🤖 Generating test for role",
    SUCCESS: "✅ Test generated successfully!",
    FAILED: "❌ Test generation failed:",
    BROWSER_AUTOMATION: "🌐 Running browser automation...",
    CODE_GENERATION: "📝 Generating test code...",
    VALIDATION: "🔍 Validating generated test...",
  },
  EJECT: {
    START: "🗑️  Ejecting qa-director...",
    SUCCESS: "✅ qa-director ejected successfully!",
    CANCELLED: "⏹️  Eject cancelled.",
    DRY_RUN: "🔍 Dry run - showing what would be removed:",
    REMOVING: "🗑️  Removing:",
    CLEANUP: "🧹 Cleaning up empty directories...",
  },
  ERRORS: {
    NO_CONFIG:
      "❌ No qa-director configuration found. Run `qa-director init` first.",
    MISSING_ANTHROPIC_KEY:
      "❌ ANTHROPIC_API_KEY environment variable is not set.",
    ROLE_NOT_FOUND: "❌ Role not found. Available roles:",
    INVALID_CONFIG: "❌ Invalid configuration file.",
    BROWSER_FAILED: "❌ Browser automation failed.",
    FILE_NOT_FOUND: "❌ File not found:",
    PERMISSION_DENIED: "❌ Permission denied:",
    NETWORK_ERROR: "❌ Network error:",
    TIMEOUT: "❌ Operation timed out.",
  },
};

export const FILE_TEMPLATES = {
  ENV_FILE: `# QA Director Environment Variables
ANTHROPIC_API_KEY=your_anthropic_api_key_here
`,
  ENV_EXAMPLE: `# QA Director Environment Variables
ANTHROPIC_API_KEY=your_anthropic_api_key_here
`,
  GITIGNORE_ADDITIONS: `
# QA Director
.env.qa
playwright/.auth/
playwright-report/
test-results/
`,
  README_SECTION: `## QA Director

This project uses [QA Director](https://github.com/your-org/qa-director) for AI-powered E2E test generation.

### Getting Started

1. Initialize QA Director:
   \`\`\`bash
   npx qa-director init
   \`\`\`

2. Set up authentication for a role:
   \`\`\`bash
   npx qa-director login user
   \`\`\`

3. Generate tests:
   \`\`\`bash
   npx qa-director generate --role user "Test user can create a post"
   \`\`\`

### Configuration

See \`qa-director.config.ts\` for configuration options.
`,
};

export const VALIDATION_RULES = {
  REQUIRED_FIELDS: [
    "baseURL",
    "testDir",
    "roles",
    "authDir",
    "setup",
    "envDir",
  ],
  VALID_BROWSERS: ["chromium", "firefox", "webkit"],
  FILE_EXTENSIONS: {
    CONFIG: [".ts", ".js"],
    SETUP: [".ts", ".js"],
    ENV: [".env", ".env.local", ".env.qa"],
  },
};

export const DEFAULT_PROMPTS = {
  CONFIRM_INIT: "Would you like to initialize QA Director in this project?",
  CONFIRM_LOGIN: "Would you like to set up a login role now?",
  CONFIRM_GITHUB_ACTIONS:
    "Would you like to set up GitHub Actions for E2E testing?",
  CONFIRM_ROLE_FOLDER:
    "Create role-specific test folder? (Recommended for multiple roles)",
  CONFIRM_ENV_VARS: "Replace sensitive data with environment variables?",
  CONFIRM_CODEGEN: "Record login flow with Playwright codegen?",
  SELECT_PLAYWRIGHT_CONFIG: "Select Playwright config to use:",
  SELECT_WORKFLOW: "Select workflow to update:",
  ENTER_ROLE_NAME: "Enter role name:",
  ENTER_BASE_URL: "Enter base URL:",
  ENTER_TEST_DIR: "Enter test directory:",
};

export const SUPPORTED_FRAMEWORKS = [
  "react",
  "vue",
  "angular",
  "svelte",
  "next",
  "nuxt",
  "remix",
  "gatsby",
  "astro",
];

export const COMMON_SELECTORS = {
  EMAIL: [
    '[data-testid="email"]',
    '[name="email"]',
    '[type="email"]',
    "#email",
  ],
  PASSWORD: [
    '[data-testid="password"]',
    '[name="password"]',
    '[type="password"]',
    "#password",
  ],
  LOGIN_BUTTON: [
    '[data-testid="login"]',
    '[data-testid="submit"]',
    'button[type="submit"]',
    ".login-btn",
  ],
  NAVIGATION: ["nav", '[role="navigation"]', ".navbar", ".nav"],
  MODAL: ['[role="dialog"]', ".modal", '[data-testid="modal"]'],
};

/**
 * Validates that we're in a qa-director project directory
 */
export function validateProjectDirectory(): {
  valid: boolean;
  workingDir: string;
  error?: string;
} {
  const workingDir = process.cwd();
  const configPath = path.join(workingDir, "qa-director.config.ts");

  if (!fs.existsSync(configPath)) {
    return {
      valid: false,
      workingDir,
      error: `Not in a qa-director project directory. Expected to find 'qa-director.config.ts' in: ${workingDir}`,
    };
  }

  return {
    valid: true,
    workingDir,
  };
}

/**
 * Ensures we're in a qa-director project or exits with error
 */
export function ensureProjectDirectory(): string {
  const validation = validateProjectDirectory();

  if (!validation.valid) {
    loggers.error(`${validation.error}`);
    loggers.console.yellow(
      "💡 Make sure you're running this command from your project root directory where qa-director.config.ts exists."
    );
    process.exit(1);
  }

  loggers.debug(`Project directory: ${validation.workingDir}`);
  return validation.workingDir;
}
