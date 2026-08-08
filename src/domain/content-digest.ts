import { createHash } from "node:crypto";

import {
  canonicalizeJson,
  snapshotJsonValue,
  type JsonValue,
} from "./canonical-json.ts";
import { isPlainRecord, type UnknownRecord } from "./value-guards.ts";

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export type Sha256Digest = `sha256:${string}`;

export function digestJson(value: unknown): Sha256Digest {
  const canonicalBytes = Buffer.from(canonicalizeJson(value), "utf8");
  const digest = createHash("sha256").update(canonicalBytes).digest("hex");
  return `sha256:${digest}`;
}

export function assertDigestMatches(value: unknown, expectedDigest: string): void {
  if (!SHA256_DIGEST_PATTERN.test(expectedDigest)) {
    throw new TypeError("Unsupported or malformed digest algorithm");
  }

  const actualDigest = digestJson(value);
  if (actualDigest !== expectedDigest) {
    throw new Error(`Digest mismatch: expected ${expectedDigest}, received ${actualDigest}`);
  }
}

export function projectForDigest(
  value: unknown,
  excludedFields: readonly string[],
): UnknownRecord {
  const snapshot = snapshotJsonValue(value);
  if (!isPlainRecord(snapshot)) {
    throw new TypeError("Digest projection requires a plain object");
  }

  if (excludedFields.length === 0 || new Set(excludedFields).size !== excludedFields.length) {
    throw new TypeError("Digest projection requires unique excluded fields");
  }

  const excluded = new Set(excludedFields);
  for (const field of excluded) {
    if (field.length === 0 || !Object.hasOwn(snapshot, field)) {
      throw new TypeError(`Digest projection field is missing: ${field}`);
    }
  }

  const projection = Object.create(null) as Record<string, JsonValue>;
  for (const [field, fieldValue] of Object.entries(snapshot)) {
    if (!excluded.has(field)) {
      Object.defineProperty(projection, field, {
        configurable: false,
        enumerable: true,
        value: fieldValue,
        writable: false,
      });
    }
  }
  return Object.freeze(projection);
}
