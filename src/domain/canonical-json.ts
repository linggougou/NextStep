import { canonicalize } from "json-canonicalize";

import { isPlainRecord } from "./value-guards.ts";

function assertValidUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        throw new TypeError(`Invalid Unicode surrogate at ${path}`);
      }
      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError(`Invalid Unicode surrogate at ${path}`);
    }
  }
}

function assertCanonicalizable(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void {
  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "string") {
    assertValidUnicode(value, path);
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`JSON number at ${path} must be finite`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new TypeError(`Unsupported JSON value ${typeof value} at ${path}`);
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Cyclic JSON value detected at ${path}`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError(`Symbol keys are not allowed at ${path}`);
      }

      const propertyNames = Object.getOwnPropertyNames(value);
      if (propertyNames.length !== value.length + 1) {
        throw new TypeError(`Only indexed array data properties are allowed at ${path}`);
      }

      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) {
          throw new TypeError(`Sparse JSON array is not allowed at ${path}[${index}]`);
        }
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(`Only array data properties are allowed at ${path}[${index}]`);
        }
        assertCanonicalizable(descriptor.value, `${path}[${index}]`, ancestors);
      }
      return;
    }

    if (!isPlainRecord(value)) {
      throw new TypeError(`Only plain JSON objects are allowed at ${path}`);
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`Symbol keys are not allowed at ${path}`);
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`Only enumerable data properties are allowed at ${path}.${key}`);
      }
      assertValidUnicode(key, `${path} key`);
      assertCanonicalizable(descriptor.value, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value: unknown): string {
  assertCanonicalizable(value, "$", new Set<object>());
  return canonicalize(value);
}

export function parseCanonicalJsonBytes(bytes: Uint8Array): unknown {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    throw new TypeError("Canonical JSON must not contain a UTF-8 BOM");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new TypeError("Canonical JSON must use valid UTF-8");
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError("Invalid canonical JSON input");
  }

  const canonicalText = canonicalizeJson(value);
  if (text !== canonicalText) {
    throw new TypeError("Input bytes are not canonical JSON");
  }

  return value;
}
