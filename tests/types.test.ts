import { describe, expect, it } from "vitest";
import { QADirectorConfigSchema, RoleSchema } from "../src/types/index.js";

describe("Type Validation", () => {
  describe("RoleSchema", () => {
    it("should validate valid role object", () => {
      const validRole = {
        name: "user",
        storagePath: "./playwright/.auth/user.json",
        testMatch: ["./tests/user/**/*.test.ts"],
        envVars: ["QA_USER_EMAIL", "QA_USER_PASSWORD"],
        folder: "./tests/user",
      };

      const result = RoleSchema.safeParse(validRole);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual(validRole);
      }
    });

    it("should validate minimal role object", () => {
      const minimalRole = {
        name: "admin",
        storagePath: "./playwright/.auth/admin.json",
      };

      const result = RoleSchema.safeParse(minimalRole);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.name).toBe("admin");
        expect(result.data.storagePath).toBe("./playwright/.auth/admin.json");
      }
    });

    it("should reject invalid role object", () => {
      const invalidRole = {
        name: "user",
        // Missing required storagePath
        testMatch: ["./tests/user/**/*.test.ts"],
      };

      const result = RoleSchema.safeParse(invalidRole);
      expect(result.success).toBe(false);
    });
  });

  describe("QADirectorConfigSchema", () => {
    it("should validate valid config object", () => {
      const validConfig = {
        baseURL: "http://localhost:3000",
        testDir: "./tests",
        roles: [
          {
            name: "user",
            storagePath: "./playwright/.auth/user.json",
            testMatch: ["./tests/user/**/*.test.ts"],
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
          projectName: "setup",
        },
        envDir: ".env.qa",
        playwrightConfig: "playwright.config.ts",
      };

      const result = QADirectorConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    it("should reject config with missing required fields", () => {
      const invalidConfig = {
        baseURL: "http://localhost:3000",
        // Missing required testDir
        roles: [],
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

      const result = QADirectorConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });
});
