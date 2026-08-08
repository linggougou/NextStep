import { isPlainRecord } from "./value-guards.ts";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

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

function defineSnapshotProperty(
  target: Record<string, JsonValue>,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false,
  });
}

function snapshotValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  snapshots: WeakMap<object, JsonValue>,
): JsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    assertValidUnicode(value, path);
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`JSON number at ${path} must be finite`);
    }
    return value;
  }

  if (typeof value !== "object") {
    throw new TypeError(`Unsupported JSON value ${typeof value} at ${path}`);
  }

  const cached = snapshots.get(value);
  if (cached !== undefined) {
    return cached;
  }

  if (ancestors.has(value)) {
    throw new TypeError(`Cyclic JSON value detected at ${path}`);
  }

  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const descriptorKeys = Reflect.ownKeys(descriptors);
    if (descriptorKeys.some((key) => typeof key === "symbol")) {
      throw new TypeError(`Symbol keys are not allowed at ${path}`);
    }

    if (Array.isArray(value)) {
      const lengthDescriptor = descriptors.length;
      if (
        !lengthDescriptor ||
        !("value" in lengthDescriptor) ||
        lengthDescriptor.enumerable ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0
      ) {
        throw new TypeError(`Invalid JSON array length at ${path}`);
      }

      const length = lengthDescriptor.value as number;
      if (descriptorKeys.length !== length + 1) {
        throw new TypeError(`Only indexed array data properties are allowed at ${path}`);
      }

      const snapshot: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) {
          throw new TypeError(`Sparse JSON array is not allowed at ${path}[${index}]`);
        }
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(`Only array data properties are allowed at ${path}[${index}]`);
        }
        snapshot.push(
          snapshotValue(descriptor.value, `${path}[${index}]`, ancestors, snapshots),
        );
      }
      const frozenSnapshot = Object.freeze(snapshot);
      snapshots.set(value, frozenSnapshot);
      return frozenSnapshot;
    }

    if (!isPlainRecord(value)) {
      throw new TypeError(`Only plain JSON objects are allowed at ${path}`);
    }

    const snapshot: Record<string, JsonValue> = {};
    for (const key of descriptorKeys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new TypeError(`Only enumerable data properties are allowed at ${path}.${key}`);
      }
      assertValidUnicode(key, `${path} key`);
      defineSnapshotProperty(
        snapshot,
        key,
        snapshotValue(descriptor.value, `${path}.${key}`, ancestors, snapshots),
      );
    }
    const frozenSnapshot = Object.freeze(snapshot);
    snapshots.set(value, frozenSnapshot);
    return frozenSnapshot;
  } finally {
    ancestors.delete(value);
  }
}

export function snapshotJsonValue(value: unknown): JsonValue {
  return snapshotValue(value, "$", new Set<object>(), new WeakMap<object, JsonValue>());
}

function serializeSnapshot(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeSnapshot(item)).join(",")}]`;
  }

  const record = value as { readonly [key: string]: JsonValue };
  const members = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeSnapshot(record[key] as JsonValue)}`);
  return `{${members.join(",")}}`;
}

export function canonicalizeJson(value: unknown): string {
  return serializeSnapshot(snapshotJsonValue(value));
}

export function parseCanonicalJsonBytes(bytes: Uint8Array): JsonValue {
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError("Invalid canonical JSON input");
  }

  const snapshot = snapshotJsonValue(parsed);
  if (text !== serializeSnapshot(snapshot)) {
    throw new TypeError("Input bytes are not canonical JSON");
  }

  return snapshot;
}
