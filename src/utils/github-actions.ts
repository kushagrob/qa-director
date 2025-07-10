import fs from "fs/promises";
import path from "path";
import yaml from "yaml";
import inquirer from "inquirer";
import chalk from "chalk";
import { detectGithubActions } from "../core/detection.js";

export async function setupGithubActions(): Promise<{
  enabled: boolean;
  path: string;
}> {
  const existingActions = await detectGithubActions();

  if (existingActions.length > 0) {
    console.log(chalk.yellow("🔍 Found existing GitHub Actions workflows:"));
    existingActions.forEach((f) => console.log(chalk.cyan(`  - ${f}`)));

    const { useExisting } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useExisting",
        message: "Use existing workflow?",
        default: true,
      },
    ]);

    if (useExisting) {
      const { selectedWorkflow } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedWorkflow",
          message: "Select workflow to update:",
          choices: existingActions,
        },
      ]);

      return {
        enabled: true,
        path: `.github/workflows/${selectedWorkflow}`,
      };
    }
  }

  const { createNew } = await inquirer.prompt([
    {
      type: "confirm",
      name: "createNew",
      message: "Create new GitHub Actions workflow?",
      default: true,
    },
  ]);

  if (createNew) {
    const { workflowPath } = await inquirer.prompt([
      {
        type: "input",
        name: "workflowPath",
        message: "Enter workflow path:",
        default: ".github/workflows/qa-director.yml",
        validate: (input) => {
          if (!input.trim()) {
            return "Workflow path cannot be empty";
          }
          if (!input.endsWith(".yml") && !input.endsWith(".yaml")) {
            return "Workflow file must end with .yml or .yaml";
          }
          if (!input.includes(".github/workflows/")) {
            return "Workflow path must be in .github/workflows/ directory";
          }
          return true;
        },
      },
    ]);

    await createWorkflowFile(workflowPath);

    return {
      enabled: true,
      path: workflowPath,
    };
  }

  return { enabled: false, path: "" };
}

async function createWorkflowFile(workflowPath: string): Promise<void> {
  const workflow = {
    name: "QA Director E2E Tests",
    on: {
      push: { branches: ["main", "develop"] },
      pull_request: { branches: ["main", "develop"] },
    },
    jobs: {
      test: {
        "timeout-minutes": 60,
        "runs-on": "ubuntu-latest",
        steps: [
          {
            uses: "actions/checkout@v4",
          },
          {
            uses: "actions/setup-node@v4",
            with: {
              "node-version": "lts/*",
            },
          },
          {
            name: "Install dependencies",
            run: "npm ci",
          },
          {
            name: "Install Playwright Browsers",
            run: "npx playwright install --with-deps chromium",
          },
          {
            name: "Run Playwright tests",
            run: "npx playwright test",
            env: {
              ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}",
            },
          },
          {
            uses: "actions/upload-artifact@v4",
            if: "always()",
            with: {
              name: "playwright-report",
              path: "playwright-report/",
              "retention-days": 30,
            },
          },
        ],
      },
    },
  };

  const workflowDir = path.dirname(workflowPath);
  await fs.mkdir(workflowDir, { recursive: true });
  await fs.writeFile(workflowPath, yaml.stringify(workflow));

  console.log(
    chalk.green(`✅ Created GitHub Actions workflow: ${workflowPath}`)
  );
}

export async function updateWorkflowWithEnvVars(
  workflowPath: string,
  envVars: string[]
): Promise<void> {
  try {
    const content = await fs.readFile(workflowPath, "utf-8");
    const workflow = yaml.parse(content);

    // Find the Playwright test step
    const testJob = workflow.jobs?.test;
    if (!testJob) {
      console.warn(chalk.yellow("⚠️  Could not find test job in workflow"));
      return;
    }

    const playwrightStep = testJob.steps?.find(
      (step: any) =>
        step.name === "Run Playwright tests" ||
        step.run?.includes("playwright test")
    );

    if (!playwrightStep) {
      console.warn(
        chalk.yellow("⚠️  Could not find Playwright test step in workflow")
      );
      return;
    }

    // Add environment variables
    if (!playwrightStep.env) {
      playwrightStep.env = {};
    }

    envVars.forEach((envVar) => {
      playwrightStep.env[envVar] = `\${{ secrets.${envVar} }}`;
    });

    // Write back to file
    await fs.writeFile(workflowPath, yaml.stringify(workflow));

    console.log(chalk.green(`✅ Updated workflow with environment variables`));
    console.log(
      chalk.yellow(
        "⚠️  Don't forget to add these secrets to your GitHub repository:"
      )
    );
    envVars.forEach((envVar) => {
      console.log(chalk.cyan(`  - ${envVar}`));
    });
  } catch (error) {
    console.error(chalk.red("❌ Failed to update workflow:"), error);
  }
}

export async function addWorkflowStep(
  workflowPath: string,
  step: any,
  position: "before" | "after" = "before",
  targetStepName: string = "Run Playwright tests"
): Promise<void> {
  try {
    const content = await fs.readFile(workflowPath, "utf-8");
    const workflow = yaml.parse(content);

    const testJob = workflow.jobs?.test;
    if (!testJob || !testJob.steps) {
      throw new Error("Could not find test job or steps in workflow");
    }

    const targetIndex = testJob.steps.findIndex(
      (s: any) =>
        s.name === targetStepName || s.run?.includes("playwright test")
    );

    if (targetIndex === -1) {
      throw new Error(`Could not find target step: ${targetStepName}`);
    }

    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    testJob.steps.splice(insertIndex, 0, step);

    await fs.writeFile(workflowPath, yaml.stringify(workflow));

    console.log(chalk.green(`✅ Added step to workflow: ${step.name}`));
  } catch (error) {
    console.error(chalk.red("❌ Failed to add step to workflow:"), error);
  }
}

export async function createSecretsInfo(envVars: string[]): Promise<void> {
  if (envVars.length === 0) return;

  const secretsPath = ".github/SECRETS.md";
  const secretsContent = `# GitHub Secrets Configuration

This file lists the secrets that need to be configured in your GitHub repository for the QA Director workflow to work properly.

## Required Secrets

| Secret Name | Description | Example |
|-------------|-------------|---------|
| ANTHROPIC_API_KEY | Anthropic API key for Claude Code | \`sk-ant-api03-...\` |
${envVars.map((envVar) => `| ${envVar} | Environment variable for tests | \`your_${envVar.toLowerCase()}_here\` |`).join("\n")}

## How to Add Secrets

1. Go to your GitHub repository
2. Click on "Settings" tab
3. Click on "Secrets and variables" > "Actions"
4. Click "New repository secret"
5. Add each secret from the table above

## Security Notes

- Never commit actual secret values to your repository
- Use different values for different environments (staging, production)
- Rotate secrets regularly for security
- Use least-privilege access for service accounts
`;

  const secretsDir = path.dirname(secretsPath);
  await fs.mkdir(secretsDir, { recursive: true });
  await fs.writeFile(secretsPath, secretsContent);

  console.log(chalk.green(`✅ Created secrets documentation: ${secretsPath}`));
}

export async function validateWorkflow(workflowPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(workflowPath, "utf-8");
    const workflow = yaml.parse(content);

    // Basic validation
    if (!workflow.jobs) {
      console.error(chalk.red("❌ Workflow missing jobs"));
      return false;
    }

    if (!workflow.jobs.test) {
      console.error(chalk.red("❌ Workflow missing test job"));
      return false;
    }

    if (!workflow.jobs.test.steps) {
      console.error(chalk.red("❌ Test job missing steps"));
      return false;
    }

    const hasPlaywrightStep = workflow.jobs.test.steps.some((step: any) =>
      step.run?.includes("playwright test")
    );

    if (!hasPlaywrightStep) {
      console.error(chalk.red("❌ Workflow missing Playwright test step"));
      return false;
    }

    console.log(chalk.green("✅ Workflow validation passed"));
    return true;
  } catch (error) {
    console.error(chalk.red("❌ Workflow validation failed:"), error);
    return false;
  }
}

export async function getWorkflowTemplate(
  type: "basic" | "advanced" = "basic"
): Promise<any> {
  const basicTemplate = {
    name: "QA Director E2E Tests",
    on: {
      push: { branches: ["main", "develop"] },
      pull_request: { branches: ["main", "develop"] },
    },
    jobs: {
      test: {
        "timeout-minutes": 60,
        "runs-on": "ubuntu-latest",
        steps: [
          { uses: "actions/checkout@v4" },
          {
            uses: "actions/setup-node@v4",
            with: { "node-version": "lts/*" },
          },
          { name: "Install dependencies", run: "npm ci" },
          {
            name: "Install Playwright Browsers",
            run: "npx playwright install --with-deps chromium",
          },
          {
            name: "Run Playwright tests",
            run: "npx playwright test",
            env: { ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}" },
          },
          {
            uses: "actions/upload-artifact@v4",
            if: "always()",
            with: {
              name: "playwright-report",
              path: "playwright-report/",
              "retention-days": 30,
            },
          },
        ],
      },
    },
  };

  const advancedTemplate = {
    ...basicTemplate,
    jobs: {
      ...basicTemplate.jobs,
      test: {
        ...basicTemplate.jobs.test,
        strategy: {
          "fail-fast": false,
          matrix: {
            shard: ["1/4", "2/4", "3/4", "4/4"],
          },
        },
        steps: [
          ...basicTemplate.jobs.test.steps.slice(0, -2),
          {
            name: "Run Playwright tests",
            run: "npx playwright test --shard=${{ matrix.shard }}",
            env: { ANTHROPIC_API_KEY: "${{ secrets.ANTHROPIC_API_KEY }}" },
          },
          {
            uses: "actions/upload-artifact@v4",
            if: "always()",
            with: {
              name: "playwright-report-${{ matrix.shard }}",
              path: "playwright-report/",
              "retention-days": 30,
            },
          },
        ],
      },
    },
  };

  return type === "advanced" ? advancedTemplate : basicTemplate;
}
