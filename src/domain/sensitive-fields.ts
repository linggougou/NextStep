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
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.getOwnPropertyNames(value).length !== value.length + 1
      ) {
        throw new TypeError(`Sensitive field scan requires plain array data at ${path}`);
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(`Sensitive field scan requires array data at ${path}[${index}]`);
        }
        scanValue(descriptor.value, `${path}[${index}]`, ancestors);
      }
      return;
    }

    if (!isPlainRecord(value)) {
      throw new TypeError(`Sensitive field scan requires plain data at ${path}`);
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`Sensitive field scan requires string-keyed data at ${path}`);
    }

    for (const [field, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`Sensitive field scan requires data properties at ${path}.${field}`);
      }
      if (isSensitiveField(field)) {
        throw new Error(`Sensitive field detected at ${path}.${field}`);
      }
      scanValue(descriptor.value, `${path}.${field}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function assertNoSensitiveFields(value: unknown): void {
  scanValue(value, "$", new Set<object>());
}
