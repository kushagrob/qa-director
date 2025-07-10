import { z } from "zod";

export const RoleSchema = z.object({
  name: z.string(),
  storagePath: z.string(),
  testMatch: z.array(z.string()).optional(),
  envVars: z.array(z.string()).optional(),
  folder: z.string().optional(),
});

export const QADirectorConfigSchema = z.object({
  baseURL: z.string(),
  testDir: z.string(),
  roles: z.array(RoleSchema),
  authDir: z.string(),
  githubActions: z.object({
    enabled: z.boolean(),
    path: z.string(),
  }),
  setup: z.object({
    path: z.string(),
    enabled: z.boolean(),
    projectName: z.string().optional(),
  }),
  envDir: z.string(),
  playwrightConfig: z.string(),
});

export type Role = z.infer<typeof RoleSchema>;
export type QADirectorConfig = z.infer<typeof QADirectorConfigSchema>;

export interface InitOptions {
  playwrightConfig?: string;
  testDir?: string;
  baseURL?: string;
  authDir?: string;
  envDir?: string;
  skipGithubActions?: boolean;
}

export interface LoginOptions {
  role: string;
  refresh?: boolean;
}

export interface GenerateOptions {
  role?: string;
  description: string;
}

export interface EjectOptions {
  dryRun?: boolean;
  force?: boolean;
  role?: string;
}

export interface EnvVar {
  name: string;
  value: string;
  type: "email" | "password";
}

export interface BrowserAgentResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ClaudeCodeResult {
  success: boolean;
  duration: number;
  cost: number;
  turns: number;
  error?: string;
  messages?: any[];
}
