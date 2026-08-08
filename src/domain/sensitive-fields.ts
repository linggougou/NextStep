import { isPlainRecord } from "./value-guards.ts";

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
  return SENSITIVE_FIELD_PARTS.some(
    (part) =>
      normalized === part ||
      normalized.startsWith(`${part}_`) ||
      normalized.endsWith(`_${part}`) ||
      normalized.includes(`_${part}_`) ||
      (part === "credential" && normalized.includes("credentials")),
  );
}

function scanValue(value: unknown, path: string, ancestors: Set<object>): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Cyclic value is not allowed during sensitive field scan at ${path}`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((item, index) => scanValue(item, `${path}[${index}]`, ancestors));
      return;
    }

    if (!isPlainRecord(value)) {
      throw new TypeError(`Sensitive field scan requires plain data at ${path}`);
    }

    for (const [field, child] of Object.entries(value)) {
      if (isSensitiveField(field)) {
        throw new Error(`Sensitive field detected at ${path}.${field}`);
      }
      scanValue(child, `${path}.${field}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function assertNoSensitiveFields(value: unknown): void {
  scanValue(value, "$", new Set<object>());
}
