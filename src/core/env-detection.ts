import { EnvVar } from "../types/index.js";

interface FillPattern {
  pattern: RegExp;
  type: "email" | "password";
}

export async function detectEnvVars(playwrightCode: string, roleName?: string): Promise<EnvVar[]> {
  const envVars: EnvVar[] = [];

  // Field-name-based patterns only (no content fallbacks)
  const fillPatterns: FillPattern[] = [
    // Email/Username fields - match field name
    {
      pattern: /\.getByRole\(['"`]textbox['"`],\s*\{\s*name:\s*['"`]([^'"`]*(?:[eE]mail|[uU]sername|[uU]ser)[^'"`]*)['"`]\s*\}\)[\s\S]*?\.fill\(['"`]([^'"`]+)['"`]\)/g,
      type: "email" as const,
    },
    // Password fields - match field name
    {
      pattern: /\.getByRole\(['"`]textbox['"`],\s*\{\s*name:\s*['"`]([^'"`]*[pP]assword[^'"`]*)['"`]\s*\}\)[\s\S]*?\.fill\(['"`]([^'"`]+)['"`]\)/g,
      type: "password" as const,
    },
  ];

  fillPatterns.forEach(({ pattern, type }) => {
    let match;
    while ((match = pattern.exec(playwrightCode)) !== null) {
      const fieldContext = match[1];
      const value = match[2];

      // Skip if value looks like a selector or common test data
      if (isLikelySelector(value) || isCommonTestData(value)) {
        continue;
      }

      const name = generateEnvVarName(value, type, fieldContext, roleName);

      envVars.push({ name, value, type });
    }
  });

  return deduplicateEnvVars(envVars);
}

function isLikelySelector(value: string): boolean {
  const selectorPatterns = [
    /^#[a-zA-Z]/, // ID selector
    /^\.[a-zA-Z]/, // Class selector
    /^\[.*\]$/, // Attribute selector
    /^[a-zA-Z][a-zA-Z0-9]*$/, // Element selector
    /data-testid/i,
    /data-cy/i,
    /class=/i,
    /id=/i,
  ];

  return selectorPatterns.some((pattern) => pattern.test(value));
}

function isCommonTestData(value: string): boolean {
  const commonTestData = [
    "test",
    "demo",
    "sample",
    "example",
    "placeholder",
    "lorem",
    "ipsum",
    "john",
    "jane",
    "doe",
    "admin",
    "user",
    "guest",
    "test123",
    "password123",
  ];

  const lowerValue = value.toLowerCase();
  return commonTestData.some((data) => lowerValue.includes(data));
}



function generateEnvVarName(value: string, type: EnvVar["type"], fieldContext?: string, roleName?: string): string {
  // Use role name if provided, otherwise default to USER
  const rolePrefix = roleName ? roleName.toUpperCase() : "USER";

  switch (type) {
    case "email":
      // Check if admin context from field name or value
      if (fieldContext?.toLowerCase().includes("admin") || value.toLowerCase().includes("admin")) {
        return "QA_ADMIN_EMAIL";
      } else {
        return `QA_${rolePrefix}_EMAIL`;
      }
    case "password":
      // Check if admin context from field name or value
      if (fieldContext?.toLowerCase().includes("admin") || value.toLowerCase().includes("admin")) {
        return "QA_ADMIN_PASSWORD";
      } else {
        return `QA_${rolePrefix}_PASSWORD`;
      }
    default:
      // Fallback - shouldn't happen with current patterns
      return `QA_${rolePrefix}_VALUE`;
  }
}

export function replaceWithEnvVars(code: string, envVars: EnvVar[]): string {
  let processedCode = code;

  envVars.forEach((envVar) => {
    const escapedValue = escapeRegex(envVar.value);
    const regex = new RegExp(`(['"\`])${escapedValue}\\1`, "g");
    processedCode = processedCode.replace(regex, `process.env.${envVar.name}`);
  });

  return processedCode;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deduplicateEnvVars(envVars: EnvVar[]): EnvVar[] {
  const seenNames = new Set<string>();
  const seenValues = new Set<string>();
  const uniqueVars: EnvVar[] = [];

  envVars.forEach((envVar) => {
    // Skip if we've already seen this variable name or value
    if (!seenNames.has(envVar.name) && !seenValues.has(envVar.value)) {
      seenNames.add(envVar.name);
      seenValues.add(envVar.value);
      uniqueVars.push(envVar);
    }
  });

  return uniqueVars;
}

export function extractEnvVarNames(envVars: EnvVar[]): string[] {
  return envVars.map((envVar) => envVar.name);
}

export function formatEnvVarForDisplay(envVar: EnvVar): string {
  const typeIcon = {
    email: "📧",
    password: "🔒",
  };

  const maskedValue =
    envVar.type === "password"
      ? "*".repeat(Math.min(envVar.value.length, 8))
      : envVar.value.length > 20
        ? envVar.value.substring(0, 20) + "..."
        : envVar.value;

  return `${typeIcon[envVar.type]} ${envVar.name}: ${maskedValue}`;
}

export function validateEnvVars(envVars: EnvVar[]): {
  valid: EnvVar[];
  invalid: EnvVar[];
} {
  const valid: EnvVar[] = [];
  const invalid: EnvVar[] = [];

  envVars.forEach((envVar) => {
    if (envVar.name && envVar.value && envVar.type) {
      valid.push(envVar);
    } else {
      invalid.push(envVar);
    }
  });

  return { valid, invalid };
}
