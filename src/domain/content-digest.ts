import { createHash } from "node:crypto";

import { canonicalizeJson } from "./canonical-json.ts";
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
  if (!isPlainRecord(value)) {
    throw new TypeError("Digest projection requires a plain object");
  }

  if (excludedFields.length === 0 || new Set(excludedFields).size !== excludedFields.length) {
    throw new TypeError("Digest projection requires unique excluded fields");
  }

  const excluded = new Set(excludedFields);
  for (const field of excluded) {
    if (field.length === 0 || !Object.hasOwn(value, field)) {
      throw new TypeError(`Digest projection field is missing: ${field}`);
    }
  }

  return Object.fromEntries(
    Object.entries(value).filter(([field]) => !excluded.has(field)),
  );
}
