# QA Director

AI-powered E2E test generation and management for Playwright projects.

## Features

- 🤖 **AI-Powered Test Generation**: Generate Playwright tests using natural language descriptions
- 🔐 **Role-Based Authentication**: Manage multiple user roles with separate authentication states
- ⚡ **Browser Automation**: Record login flows with Playwright codegen
- 🔒 **Environment Variable Detection**: Automatically detect and replace sensitive data
- 🔄 **GitHub Actions Integration**: Built-in CI/CD setup for E2E testing
- 📁 **Project Organization**: Role-specific test folders and configurations
- 🛠️ **Claude Code Integration**: Uses Anthropic's Claude Code for intelligent test generation

## Installation

```bash
npm install qa-director
```

## Quick Start

### 1. Initialize QA Director

```bash
npx qa-director init
```

This will:

- Detect your Playwright configuration
- Set up authentication directories
- Create environment files
- Configure GitHub Actions (optional)
- Generate initial setup files

### 2. Set up a login role

```bash
npx qa-director login user
```

This will:

- Launch Playwright codegen to record your login flow
- Detect and replace sensitive data with environment variables
- Update setup files and Playwright configuration
- Create role-specific test folders (optional)

### 3. Generate tests

```bash
npx qa-director generate --role user "Test user can create a new post"
```

This will:

- Run browser automation with your specified role
- Use AI to generate a complete Playwright test
- Add the test to your codebase in the appropriate location

## Commands

### `qa-director init`

Initialize qa-director in your current project.

**Options:**

- `--playwright-config <path>` - Path to Playwright config file
- `--test-dir <path>` - Test directory path
- `--base-url <url>` - Base URL for tests
- `--auth-dir <path>` - Authentication directory path
- `--env-dir <path>` - Environment file path
- `--skip-github-actions` - Skip GitHub Actions setup

### `qa-director login <role>` or `qa-director login --role <role>`

Set up authentication for a specific role.

**Arguments:**

- `<role>` - Role name (when using positional argument)

**Options:**

- `--role <role>` - Role name (when using flag option)
- `--refresh` - Refresh existing role authentication

**Examples:**

```bash
qa-director login admin
qa-director login user --refresh
qa-director login --role admin
qa-director login --role user --refresh
```

### `qa-director generate --role <role> "<description>"`

Generate an E2E test using AI.

**Arguments:**

- `<description>` - Natural language description of what to test

**Options:**

- `--role <role>` - Role to use for test generation (required)

**Examples:**

```bash
qa-director generate --role user "Test user can update their profile"
qa-director generate --role admin "Test admin can delete a user account"
```

### `qa-director eject`

Remove qa-director files and configurations from your project.

**Options:**

- `--dry-run` - Show what would be removed without actually removing
- `--force` - Skip confirmation prompt
- `--role <role>` - Remove only the specified role instead of everything

**Examples:**

```bash
qa-director eject                    # Remove all qa-director files
qa-director eject --role user        # Remove only the 'user' role
qa-director eject --dry-run          # Preview what would be removed
qa-director eject --force            # Skip confirmation prompt
```

**Role-specific ejection includes:**

- Role files (storage state, test folders)
- Role entry from qa-director.config.ts
- Role configuration from Playwright config (with AI assistance)
- Role login flow from auth.setup.ts (with AI assistance)
- Role-specific environment variables
- Role secrets from GitHub Actions workflow

## Configuration

QA Director creates a `qa-director.config.ts` file in your project root:

```typescript
import { QADirectorConfig } from "qa-director";

const config: QADirectorConfig = {
  baseURL: "http://localhost:3000",
  testDir: "./tests",
  roles: [
    {
      name: "user",
      storagePath: "./playwright/.auth/storageState.user.json",
      testMatch: ["./tests/user/**/*.{test,spec}.{js,ts}"],
      envVars: ["QA_USER_EMAIL", "QA_USER_PASSWORD"],
    },
  ],
  authDir: "playwright/.auth",
  githubActions: {
    enabled: true,
    path: ".github/workflows/qa-director.yml",
  },
  setup: {
    path: "./tests/auth.setup.ts",
    enabled: true,
  },
  envDir: ".env.qa",
  playwrightConfig: "playwright.config.ts",
};

export default config;
```

## Environment Variables

Create a `.env.qa` file with your configuration:

```bash
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Auto-generated based on detected login flows
QA_USER_EMAIL=user@example.com
QA_USER_PASSWORD=your_password_here
QA_ADMIN_EMAIL=admin@example.com
QA_ADMIN_PASSWORD=admin_password_here
```

## Project Structure

After initialization, your project will have:

```
your-project/
├── qa-director.config.ts       # QA Director configuration
├── .env.qa                     # Environment variables
├── .env.qa.example            # Environment template
├── tests/
│   ├── auth.setup.ts          # Authentication setup
│   ├── user/                  # User role tests (optional)
│   └── admin/                 # Admin role tests (optional)
├── playwright/.auth/          # Authentication states
│   ├── storageState.user.json
│   └── storageState.admin.json
└── .github/workflows/
    └── qa-director.yml        # GitHub Actions workflow
```

## Role Management

QA Director supports multiple roles with separate authentication states:

- **Role Isolation**: Each role has its own storage state and test folder
- **Environment Variables**: Automatically detected and managed per role
- **Test Organization**: Optional role-specific folders for better organization
- **Playwright Integration**: Automatic project configuration for each role

## GitHub Actions

QA Director automatically sets up GitHub Actions for E2E testing:

```yaml
name: QA Director E2E Tests
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          QA_USER_EMAIL: ${{ secrets.QA_USER_EMAIL }}
          QA_USER_PASSWORD: ${{ secrets.QA_USER_PASSWORD }}
```

## Requirements

- Node.js 18 or later
- Playwright project
- Anthropic API key

## Browser Support

QA Director focuses on Chromium for consistent and reliable testing across environments.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: Report bugs and request features
- Documentation: See inline help with `qa-director <command> --help`
