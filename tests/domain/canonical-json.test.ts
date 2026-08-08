import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeJson,
  parseCanonicalJsonBytes,
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

test("parseCanonicalJsonBytes accepts only original JCS UTF-8 bytes", () => {
  const bytes = Buffer.from('{"alpha":1,"zebra":3}', "utf8");

  assert.deepEqual(parseCanonicalJsonBytes(bytes), { alpha: 1, zebra: 3 });
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

  assert.deepEqual(parsed, { label: decomposed });
  assert.notEqual((parsed as { label: string }).label, normalized);
  assert.equal(canonicalizeJson(parsed), bytes.toString("utf8"));
});
