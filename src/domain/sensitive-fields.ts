import { snapshotJsonValue, type JsonValue } from "./canonical-json.ts";

const SENSITIVE_FIELD_PARTS = [
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "credential",
  "password",
  "private_key",
  "secret",
  "session",
  "token",
] as const;

function normalizeFieldName(field: string): string {
  return field
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

function isSensitiveField(field: string): boolean {
  const normalized = normalizeFieldName(field);
  return SENSITIVE_FIELD_PARTS.some((part) =>
    [part, `${part}s`].some(
      (variant) =>
        normalized === variant ||
        normalized.startsWith(`${variant}_`) ||
        normalized.endsWith(`_${variant}`) ||
        normalized.includes(`_${variant}_`),
    ),
  );
}

function scanSnapshot(value: JsonValue, path: string, ancestors: Set<object>): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Cyclic value is not allowed during sensitive field scan at ${path}`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((child, index) => scanSnapshot(child, `${path}[${index}]`, ancestors));
      return;
    }

    for (const [field, child] of Object.entries(value)) {
      if (isSensitiveField(field)) {
        throw new Error(`Sensitive field detected at ${path}.${field}`);
      }
      scanSnapshot(child, `${path}.${field}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

const SENSITIVE_CONTENT_PATTERNS = [
  /\b(?:gh[pousr]_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})\b/,
  /\b(?:access[_-]?token|token)\s*[:=]\s*[A-Za-z0-9._-]{8,}\b/i,
  /\bauthorization\s*:\s*(?:bearer|basic)\s+\S+/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
] as const;

function scanStringContent(value: JsonValue): void {
  if (typeof value === "string") {
    if (SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error("Sensitive content detected");
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(scanStringContent);
    return;
  }
  Object.values(value).forEach(scanStringContent);
}

export function assertNoSensitiveFields(value: unknown): JsonValue {
  const snapshot = snapshotJsonValue(value);
  scanSnapshot(snapshot, "$", new Set<object>());
  return snapshot;
}

export function assertNoSensitiveContent(value: unknown): JsonValue {
  const snapshot = snapshotJsonValue(value);
  scanStringContent(snapshot);
  return snapshot;
}
