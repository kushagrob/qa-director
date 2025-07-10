import chalk from "chalk";

// Log levels
type LogLevel = "debug" | "info" | "warn" | "error";

// Simple logger interface
interface Logger {
  debug: (message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
}

// Get current log level from environment
const getLogLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level && ["debug", "info", "warn", "error"].includes(level)) {
    return level as LogLevel;
  }
  return "info";
};

// Check if a message should be logged based on level
const shouldLog = (messageLevel: LogLevel): boolean => {
  const currentLevel = getLogLevel();
  const levels = ["debug", "info", "warn", "error"];
  return levels.indexOf(messageLevel) >= levels.indexOf(currentLevel);
};

// Create a simple logger implementation
const logger: Logger = {
  debug: (message: string, meta?: any) => {
    if (shouldLog("debug")) {
      console.log(
        chalk.gray(`🔍 DEBUG: ${message}`),
        meta ? chalk.dim(JSON.stringify(meta)) : ""
      );
    }
  },
  info: (message: string, meta?: any) => {
    if (shouldLog("info")) {
      console.log(
        chalk.blue(`ℹ️  INFO: ${message}`),
        meta ? chalk.dim(JSON.stringify(meta)) : ""
      );
    }
  },
  warn: (message: string, meta?: any) => {
    if (shouldLog("warn")) {
      console.log(
        chalk.yellow(`⚠️  WARN: ${message}`),
        meta ? chalk.dim(JSON.stringify(meta)) : ""
      );
    }
  },
  error: (message: string, meta?: any) => {
    console.error(
      chalk.red(`❌ ERROR: ${message}`),
      meta ? chalk.dim(JSON.stringify(meta)) : ""
    );
  },
};

// Helper functions for common CLI patterns
export const loggers = {
  // Success messages
  success: (message: string, meta?: any) => {
    console.log(chalk.green(`✅ ${message}`));
    if (meta) logger.info(message, meta);
  },

  // Error messages
  error: (message: string, error?: Error | any, meta?: any) => {
    console.error(chalk.red(`❌ ${message}`));
    if (error instanceof Error) {
      logger.error(message, {
        error: error.message,
        stack: error.stack,
        ...meta,
      });
    } else if (error) {
      logger.error(message, { error, ...meta });
    } else {
      logger.error(message, meta);
    }
  },

  // Warning messages
  warn: (message: string, meta?: any) => {
    console.log(chalk.yellow(`⚠️  ${message}`));
    if (meta) logger.warn(message, meta);
  },

  // Info messages
  info: (message: string, meta?: any) => {
    console.log(chalk.blue(`ℹ️  ${message}`));
    if (meta) logger.info(message, meta);
  },

  // Debug messages (only shown if LOG_LEVEL=debug)
  debug: (message: string, meta?: any) => {
    if (shouldLog("debug")) {
      console.log(chalk.gray(`🔍 ${message}`));
    }
    logger.debug(message, meta);
  },

  // Colored console output for CLI
  console: {
    log: (message: string, color: string = "white") => {
      const colorFn = (chalk as any)[color] || chalk.white;
      console.log(colorFn(message));
    },

    dim: (message: string) => {
      console.log(chalk.dim(message));
    },

    cyan: (message: string) => {
      console.log(chalk.cyan(message));
    },

    yellow: (message: string) => {
      console.log(chalk.yellow(message));
    },

    green: (message: string) => {
      console.log(chalk.green(message));
    },

    red: (message: string) => {
      console.log(chalk.red(message));
    },

    blue: (message: string) => {
      console.log(chalk.blue(message));
    },

    magenta: (message: string) => {
      console.log(chalk.magenta(message));
    },

    gray: (message: string) => {
      console.log(chalk.gray(message));
    },
  },
};

export default logger;
