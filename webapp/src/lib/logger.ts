export type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;
type LoggerConfig = {
  level?: LogLevel;
  baseMeta?: LogMeta;
};
type SanitizedQuery = Record<string, string | string[]>;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "password",
  "secret",
  "token",
  "tokenValue",
  "accessToken",
  "refreshToken",
  "idToken",
  "clientSecret",
  "set-cookie",
  "apiKey",
  "apiToken",
  "sessionToken",
  "email",
  "userEmail",
  "recipientEmail",
  "senderEmail",
  "displayName",
  "senderDisplayName",
  "recipientName",
  "userName",
]);
const REDACTED_KEYS_NORMALIZED = new Set(
  Array.from(REDACTED_KEYS, (key) => normalizeKeyName(key)),
);
const MAX_LOG_DEPTH = 5;
const MAX_STRING_LENGTH = 4096;
const REDACTED_VALUE = "[REDACTED]";
const TRUNCATED_VALUE = "[Truncated]";

function normalizeKeyName(key: string) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  if (REDACTED_KEYS.has(key) || REDACTED_KEYS.has(key.toLowerCase())) {
    return true;
  }

  const normalized = normalizeKeyName(key);
  return REDACTED_KEYS_NORMALIZED.has(normalized);
}

function getConfiguredLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (
    configured === "debug" ||
    configured === "info" ||
    configured === "warn" ||
    configured === "error"
  ) {
    return configured;
  }

  return "info";
}

function sanitizeString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[Truncated]`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : value.stack,
    };
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= MAX_LOG_DEPTH) {
    return TRUNCATED_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => {
        if (isSensitiveKey(key)) {
          return [key, REDACTED_VALUE];
        }

        return [key, sanitizeValue(entryValue, depth + 1)];
      },
    );

    return Object.fromEntries(entries);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  return value;
}

export function sanitizeLogMeta(meta: LogMeta) {
  return sanitizeValue(meta) as LogMeta;
}

function shouldLog(configuredLevel: LogLevel, level: LogLevel) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

function getConsoleMethod(level: LogLevel) {
  switch (level) {
    case "debug":
      return console.debug;
    case "info":
      return console.info;
    case "warn":
      return console.warn;
    case "error":
      return console.error;
  }
}

function isRequestLoggingEnabled() {
  const value = process.env.ENABLE_REQUEST_LOGGING?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function shouldEmitRequestLog(pathname: string) {
  return (
    isRequestLoggingEnabled() &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/favicon") &&
    !pathname.includes(".")
  );
}

export function sanitizeRequestPath(pathname: string) {
  return pathname || "/";
}

export function sanitizeRequestQuery(
  searchParams: URLSearchParams,
  allowlist: readonly string[] = [],
): SanitizedQuery | undefined {
  const allowed = new Set(allowlist);
  const sanitized: SanitizedQuery = {};

  for (const key of allowed) {
    const values = searchParams.getAll(key).filter((value) => value !== "");
    if (values.length === 0) {
      continue;
    }

    sanitized[key] =
      values.length === 1
        ? sanitizeString(values[0])
        : values.map((value) => sanitizeString(value));
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function createRequestId() {
  const webCrypto = globalThis.crypto;

  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    return `req_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  throw new Error("Secure crypto support is required to create request IDs");
}

export function createLogger(config: LoggerConfig = {}) {
  const configuredLevel = config.level ?? getConfiguredLevel();
  const baseMeta = config.baseMeta ?? {};

  function log(level: LogLevel, event: string, meta: LogMeta = {}) {
    if (!shouldLog(configuredLevel, level)) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...sanitizeLogMeta(baseMeta),
      ...sanitizeLogMeta(meta),
    };

    try {
      getConsoleMethod(level)(JSON.stringify(entry));
    } catch {
      // Logging must not break the primary operation.
    }
  }

  return {
    debug(message: string, meta?: LogMeta) {
      log("debug", message, meta);
    },
    info(message: string, meta?: LogMeta) {
      log("info", message, meta);
    },
    warn(message: string, meta?: LogMeta) {
      log("warn", message, meta);
    },
    error(message: string, meta?: LogMeta) {
      log("error", message, meta);
    },
    child(meta: LogMeta) {
      return createLogger({
        level: configuredLevel,
        baseMeta: {
          ...baseMeta,
          ...meta,
        },
      });
    },
  };
}

export const logger = createLogger({
  baseMeta: {
    app: "business-app-starter",
    environment: process.env.NODE_ENV ?? "development",
  },
});
