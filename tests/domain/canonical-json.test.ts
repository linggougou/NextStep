import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeJson,
  parseCanonicalJsonBytes,
  snapshotJsonValue,
} from "../../src/domain/canonical-json.ts";

test("canonicalizeJson sorts object keys recursively", () => {
  const actual = canonicalizeJson({
    zebra: 3,
    alpha: { later: true, earlier: false },
  });

  assert.equal(
    actual,
    '{"alpha":{"earlier":false,"later":true},"zebra":3}',
  );
});

test("canonicalizeJson preserves array order", () => {
  assert.equal(
    canonicalizeJson({ items: [{ id: "second" }, { id: "first" }] }),
    '{"items":[{"id":"second"},{"id":"first"}]}',
  );
});

test("canonicalizeJson treats root and nested toJSON names as ordinary data fields", () => {
  assert.equal(
    canonicalizeJson({ z: 1, toJSON: "metadata", a: 2 }),
    '{"a":2,"toJSON":"metadata","z":1}',
  );
  assert.equal(
    canonicalizeJson({ subject: { z: 1, toJSON: "metadata", a: 2 } }),
    '{"subject":{"a":2,"toJSON":"metadata","z":1}}',
  );
});

test("canonicalizeJson serializes one descriptor snapshot instead of rereading a Proxy", () => {
  const value = new Proxy(
    { stable: "target-value" },
    {
      get: (_target, property, receiver) =>
        property === "stable" ? "consumer-value" : Reflect.get(_target, property, receiver),
      getOwnPropertyDescriptor: (_target, property) =>
        property === "stable"
          ? {
              configurable: true,
              enumerable: true,
              value: "descriptor-value",
              writable: true,
            }
          : Reflect.getOwnPropertyDescriptor(_target, property),
    },
  );

  assert.equal(canonicalizeJson(value), '{"stable":"descriptor-value"}');
});

test("snapshotJsonValue reads a shared input object only once and deeply freezes it", () => {
  let descriptorReads = 0;
  const shared = new Proxy(
    { stable: true },
    {
      getOwnPropertyDescriptor: (target, property) => {
        descriptorReads += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    },
  );

  const snapshot = snapshotJsonValue({ left: shared, right: shared });

  assert.equal(descriptorReads, 1);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen((snapshot as { left: unknown }).left));
  assert.equal(Object.getPrototypeOf(snapshot), null);
  assert.equal(Object.getPrototypeOf((snapshot as { left: object }).left), null);
  assert.equal(
    canonicalizeJson(snapshot),
    '{"left":{"stable":true},"right":{"stable":true}}',
  );
});

test("canonicalizeJson rejects every non-data array shape without invoking accessors", () => {
  const sparse = new Array<unknown>(1);
  const extra = [1];
  Object.defineProperty(extra, "extra", { enumerable: true, value: 2 });
  const hidden = [1];
  Object.defineProperty(hidden, "hidden", { enumerable: false, value: 2 });
  const symbolKeyed = [1];
  Object.defineProperty(symbolKeyed, Symbol("extra"), { enumerable: true, value: 2 });
  let getterReads = 0;
  const accessor = [1];
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    get: () => {
      getterReads += 1;
      return 1;
    },
  });
  const invalidLength = new Proxy([], {
    getOwnPropertyDescriptor: (target, property) =>
      property === "length"
        ? { configurable: true, enumerable: true, value: 0, writable: true }
        : Reflect.getOwnPropertyDescriptor(target, property),
  });

  for (const value of [sparse, extra, hidden, symbolKeyed, accessor, invalidLength]) {
    assert.throws(
      () => canonicalizeJson(value),
      /array|sparse|symbol|data propert|descriptor|invariant|proxy/i,
    );
  }
  assert.equal(getterReads, 0);
});

test("canonicalizeJson matches the RFC 8785 serialization and UTF-16 sorting vectors", () => {
  assert.equal(
    canonicalizeJson({
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
      string: "€$\u000f\nA'B\"\\\\\"/",
      literals: [null, true, false],
    }),
    "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}",
  );

  assert.equal(
    canonicalizeJson({
      "€": "Euro Sign",
      "\r": "Carriage Return",
      "דּ": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "\u0080": "Control",
      "ö": "Latin Small Letter O With Diaeresis",
    }),
    "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji: Grinning Face\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}",
  );
});

test("canonicalizeJson rejects isolated Unicode surrogates in keys and values", () => {
  for (const value of ["\ud800", "\udc00", "\ud800x", { ["\ud800"]: true }]) {
    assert.throws(() => canonicalizeJson(value), /unicode|surrogate/i);
  }
});

test("canonicalizeJson preserves __proto__ as data and follows ECMAScript number serialization", () => {
  const value = JSON.parse('{"__proto__":{"safe":true}}') as unknown;

  assert.equal(canonicalizeJson(value), '{"__proto__":{"safe":true}}');
  assert.equal(
    canonicalizeJson([333333333.33333329, 1e30, 4.5, 2e-3, 1e-27, -0]),
    "[333333333.3333333,1e+30,4.5,0.002,1e-27,0]",
  );
});

test("canonicalizeJson rejects undefined values instead of silently dropping or coercing them", () => {
  assert.throws(
    () => canonicalizeJson({ allowed: true, omitted: undefined }),
    /undefined/i,
  );
  assert.throws(() => canonicalizeJson(["known", undefined]), /undefined/i);
});

test("canonicalizeJson rejects non-finite numbers", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalizeJson({ value }), /finite|number/i);
  }
});

test("canonicalizeJson rejects cyclic values", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;

  assert.throws(() => canonicalizeJson(cyclic), /cyclic|circular/i);
});

test("canonicalizeJson rejects accessor properties", () => {
  const value = Object.create(Object.prototype, {
    stable: {
      configurable: true,
      enumerable: true,
      get: () => "changes-on-read",
    },
  });

  assert.throws(
    () => canonicalizeJson(value),
    /accessor|data propert|plain json/i,
  );
});

test("parseCanonicalJsonBytes accepts only original JCS UTF-8 bytes", () => {
  const bytes = Buffer.from('{"alpha":1,"zebra":3}', "utf8");

  const parsed = parseCanonicalJsonBytes(bytes);
  assert.equal(canonicalizeJson(parsed), bytes.toString("utf8"));
  assert.ok(Object.isFrozen(parsed));
  assert.equal(Object.getPrototypeOf(parsed), null);
});

test("parseCanonicalJsonBytes rejects non-canonical encodings and invalid UTF-8", () => {
  for (const bytes of [
    Buffer.from('{"zebra":3,"alpha":1}', "utf8"),
    Buffer.from(' {"alpha":1}', "utf8"),
    Buffer.from('{"alpha":1}\n', "utf8"),
    Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
    Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
    Buffer.from('{"alpha":1,"alpha":2}', "utf8"),
  ]) {
    assert.throws(() => parseCanonicalJsonBytes(bytes), /canonical|utf|bom|duplicate|json/i);
  }
});

test("parseCanonicalJsonBytes preserves Unicode code points without normalization", () => {
  const decomposed = "e\u0301";
  const normalized = decomposed.normalize("NFC");
  const bytes = Buffer.from(JSON.stringify({ label: decomposed }), "utf8");

  const parsed = parseCanonicalJsonBytes(bytes);

  assert.notEqual((parsed as { label: string }).label, normalized);
  assert.equal((parsed as { label: string }).label, decomposed);
  assert.equal(canonicalizeJson(parsed), bytes.toString("utf8"));
});
