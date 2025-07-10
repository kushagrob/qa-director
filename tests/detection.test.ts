import fs from 'fs/promises';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupTempDir, createTempDir, createTempFile } from './setup.js';

// Mock glob
vi.mock('glob', () => ({
  glob: vi.fn(),
}));

describe('Detection Utilities', () => {
  let tempDir: string;
  let originalCwd: string;
  let mockGlob: any;

  beforeEach(async () => {
    tempDir = await createTempDir(`detection-test-${Date.now()}`);
    originalCwd = process.cwd();
    process.chdir(tempDir);

    const { glob } = await import('glob');
    mockGlob = vi.mocked(glob);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
    vi.clearAllMocks();
  });

  describe('detectPlaywrightConfig', () => {
    it('should detect playwright config files', async () => {
      mockGlob
        .mockResolvedValueOnce(['playwright.config.ts'])
        .mockResolvedValueOnce(['playwright.config.js'])
        .mockResolvedValueOnce(['e2e/playwright.config.ts'])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { detectPlaywrightConfig } = await import('../src/core/detection.js');
      const configs = await detectPlaywrightConfig();

      expect(configs).toEqual([
        'playwright.config.ts',
        'playwright.config.js',
        'e2e/playwright.config.ts',
      ]);
    });

    it('should handle glob errors gracefully', async () => {
      mockGlob
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(['playwright.config.ts'])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const { detectPlaywrightConfig } = await import('../src/core/detection.js');
      const configs = await detectPlaywrightConfig();

      expect(configs).toEqual(['playwright.config.ts']);
    });
  });

  describe('detectTestDir', () => {
    it('should extract test directory from config', async () => {
      const configContent = `
        import { defineConfig } from '@playwright/test';
        
        export default defineConfig({
          testDir: './e2e',
          timeout: 30000,
        });
      `;
      
      const configPath = path.join(tempDir, 'playwright.config.ts');
      await createTempFile(configPath, configContent);

      const { detectTestDir } = await import('../src/core/detection.js');
      const testDir = await detectTestDir(configPath);

      expect(testDir).toBe('./e2e');
    });

    it('should return null when test directory not found', async () => {
      const configContent = `
        export default defineConfig({
          timeout: 30000,
        });
      `;
      
      const configPath = path.join(tempDir, 'playwright.config.ts');
      await createTempFile(configPath, configContent);

      const { detectTestDir } = await import('../src/core/detection.js');
      const testDir = await detectTestDir(configPath);

      expect(testDir).toBeNull();
    });
  });

  describe('detectBaseURL', () => {
    it('should extract base URL from config', async () => {
      const configContent = `
        export default defineConfig({
          baseURL: 'http://localhost:3000',
          testDir: './tests',
        });
      `;
      
      const configPath = path.join(tempDir, 'playwright.config.ts');
      await createTempFile(configPath, configContent);

      const { detectBaseURL } = await import('../src/core/detection.js');
      const baseURL = await detectBaseURL(configPath);

      expect(baseURL).toBe('http://localhost:3000');
    });

    it('should return null when base URL not found', async () => {
      const configContent = `
        export default defineConfig({
          testDir: './tests',
        });
      `;
      
      const configPath = path.join(tempDir, 'playwright.config.ts');
      await createTempFile(configPath, configContent);

      const { detectBaseURL } = await import('../src/core/detection.js');
      const baseURL = await detectBaseURL(configPath);

      expect(baseURL).toBeNull();
    });
  });

  describe('detectGithubActions', () => {
    it('should detect GitHub Actions workflow files', async () => {
      await fs.mkdir(path.join(tempDir, '.github', 'workflows'), { recursive: true });
      await createTempFile(path.join(tempDir, '.github', 'workflows', 'e2e.yml'), 'workflow content');
      await createTempFile(path.join(tempDir, '.github', 'workflows', 'playwright.yaml'), 'workflow content');
      await createTempFile(path.join(tempDir, '.github', 'workflows', 'test.yml'), 'workflow content');
      await createTempFile(path.join(tempDir, '.github', 'workflows', 'deploy.yml'), 'workflow content');

      const { detectGithubActions } = await import('../src/core/detection.js');
      const workflows = await detectGithubActions();

      expect(workflows).toEqual(expect.arrayContaining([
        'e2e.yml',
        'playwright.yaml',
        'test.yml',
      ]));
      expect(workflows).not.toContain('deploy.yml');
    });

    it('should return empty array when directory does not exist', async () => {
      const { detectGithubActions } = await import('../src/core/detection.js');
      const workflows = await detectGithubActions();

      expect(workflows).toEqual([]);
    });
  });

  describe('detectAuthDir', () => {
    it('should detect existing auth directories', async () => {
      await fs.mkdir(path.join(tempDir, 'playwright', '.auth'), { recursive: true });

      const { detectAuthDir } = await import('../src/core/detection.js');
      const authDir = await detectAuthDir();

      expect(authDir).toBe('playwright/.auth');
    });

    it('should return null when no auth directory exists', async () => {
      const { detectAuthDir } = await import('../src/core/detection.js');
      const authDir = await detectAuthDir();

      expect(authDir).toBeNull();
    });
  });

  describe('detectEnvFile', () => {
    it('should detect existing environment files', async () => {
      await createTempFile(path.join(tempDir, '.env.qa'), 'API_KEY=test');

      const { detectEnvFile } = await import('../src/core/detection.js');
      const envFile = await detectEnvFile();

      expect(envFile).toBe('.env.qa');
    });

    it('should return null when no env file exists', async () => {
      const { detectEnvFile } = await import('../src/core/detection.js');
      const envFile = await detectEnvFile();

      expect(envFile).toBeNull();
    });
  });

  describe('detectSetupFile', () => {
    it('should detect existing setup files', async () => {
      const testDir = path.join(tempDir, 'tests');
      await fs.mkdir(testDir, { recursive: true });
      await createTempFile(path.join(testDir, 'auth.setup.ts'), 'setup content');

      const { detectSetupFile } = await import('../src/core/detection.js');
      const setupFile = await detectSetupFile('./tests');

      expect(setupFile).toBe(path.join('./tests', 'auth.setup.ts'));
    });

    it('should return null when no setup file exists', async () => {
      const testDir = path.join(tempDir, 'tests');
      await fs.mkdir(testDir, { recursive: true });

      const { detectSetupFile } = await import('../src/core/detection.js');
      const setupFile = await detectSetupFile('./tests');

      expect(setupFile).toBeNull();
    });
  });

  describe('isPlaywrightProject', () => {
    it('should detect Playwright project by dependencies', async () => {
      const packageJson = {
        name: 'test-project',
        dependencies: {
          '@playwright/test': '^1.53.1',
        },
      };

      await createTempFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const { isPlaywrightProject } = await import('../src/core/detection.js');
      const isPlaywright = await isPlaywrightProject();

      expect(isPlaywright).toBe(true);
    });

    it('should detect Playwright project by config file', async () => {
      mockGlob.mockResolvedValue(['playwright.config.ts']);

      const packageJson = {
        name: 'test-project',
        dependencies: {},
      };

      await createTempFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const { isPlaywrightProject } = await import('../src/core/detection.js');
      const isPlaywright = await isPlaywrightProject();

      expect(isPlaywright).toBe(true);
    });

    it('should return false for non-Playwright projects', async () => {
      mockGlob.mockResolvedValue([]);

      const packageJson = {
        name: 'test-project',
        dependencies: {
          'react': '^18.0.0',
        },
      };

      await createTempFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const { isPlaywrightProject } = await import('../src/core/detection.js');
      const isPlaywright = await isPlaywrightProject();

      expect(isPlaywright).toBe(false);
    });
  });
}); 