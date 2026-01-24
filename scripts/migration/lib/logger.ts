import { pino, type Logger } from "pino";
import fs from "node:fs";
import path from "node:path";

// Get log file path from environment or use default
const logFilePath = process.env.LOG_FILE_PATH || "./migration.log";

// Ensure log directory exists
const logDir = path.dirname(logFilePath);
if (logDir !== "." && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create file write stream for logging
const fileStream = fs.createWriteStream(logFilePath, { flags: "a" });

// Create a JSON logger for file output
const fileLogger: Logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  fileStream
);

// Create a pretty logger for console output using pino-pretty transport
const consoleLogger: Logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});

// Type for log methods
type LogMethod = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
const LOG_METHODS: LogMethod[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

// Create a wrapper logger that writes to both console and file
function createDualLogger(): Logger {
  // We use the console logger as the primary and intercept to also write to file
  const proxy = new Proxy(consoleLogger, {
    get(target, prop: string | symbol) {
      const value = Reflect.get(target, prop);

      // Intercept log methods to write to both loggers
      if (
        typeof prop === "string" &&
        LOG_METHODS.includes(prop as LogMethod) &&
        typeof value === "function"
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (...args: any[]) => {
          // Call console logger
          value.apply(target, args);
          // Call file logger
          const fileMethod = Reflect.get(fileLogger, prop);
          if (typeof fileMethod === "function") {
            fileMethod.apply(fileLogger, args);
          }
        };
      }

      // For child loggers, create a new dual logger
      if (prop === "child" && typeof value === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (bindings: any) => {
          const childConsole = consoleLogger.child(bindings);
          const childFile = fileLogger.child(bindings);
          return createChildDualLogger(childConsole, childFile);
        };
      }

      return value;
    },
  });

  return proxy as Logger;
}

// Helper to create child dual loggers
function createChildDualLogger(
  consoleChild: Logger,
  fileChild: Logger
): Logger {
  const proxy = new Proxy(consoleChild, {
    get(target, prop: string | symbol) {
      const value = Reflect.get(target, prop);

      if (
        typeof prop === "string" &&
        LOG_METHODS.includes(prop as LogMethod) &&
        typeof value === "function"
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (...args: any[]) => {
          value.apply(target, args);
          const fileMethod = Reflect.get(fileChild, prop);
          if (typeof fileMethod === "function") {
            fileMethod.apply(fileChild, args);
          }
        };
      }

      if (prop === "child" && typeof value === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (bindings: any) => {
          return createChildDualLogger(
            consoleChild.child(bindings),
            fileChild.child(bindings)
          );
        };
      }

      return value;
    },
  });

  return proxy as Logger;
}

// Export the dual logger
export const logger: Logger = createDualLogger();

// Log startup info
logger.info({ logFile: logFilePath }, "Migration logger initialized");

// Export helper functions for common log patterns
export function logMigrationStart(
  operation: string,
  details: Record<string, unknown> = {}
): void {
  logger.info({ operation, ...details }, `Starting ${operation}`);
}

export function logMigrationProgress(
  operation: string,
  current: number,
  total: number,
  details: Record<string, unknown> = {}
): void {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  logger.info(
    { operation, current, total, percent, ...details },
    `${operation}: ${current}/${total} (${percent}%)`
  );
}

export function logMigrationComplete(
  operation: string,
  duration: number,
  details: Record<string, unknown> = {}
): void {
  logger.info(
    { operation, durationMs: duration, ...details },
    `Completed ${operation} in ${duration}ms`
  );
}

export function logMigrationError(
  operation: string,
  error: unknown,
  details: Record<string, unknown> = {}
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error(
    { operation, error: errorMessage, stack: errorStack, ...details },
    `Error in ${operation}: ${errorMessage}`
  );
}

// Graceful shutdown helper
export function closeLogger(): Promise<void> {
  return new Promise((resolve) => {
    fileStream.end(() => {
      resolve();
    });
  });
}
