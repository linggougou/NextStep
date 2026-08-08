import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDigestMatches,
  digestJson,
} from "../../src/domain/content-digest.ts";

test("digestJson is stable for semantically identical objects", () => {
  const first = digestJson({ b: 2, a: { y: false, x: true } });
  const second = digestJson({ a: { x: true, y: false }, b: 2 });

  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
});

test("digestJson is based on canonical JSON bytes", () => {
  assert.equal(
    digestJson({ b: 2, a: 1 }),
    "sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
  );
});

test("assertDigestMatches rejects mismatched and unsupported digests", () => {
  const subject = { packet_id: "packet-001", required_outputs: ["receipt"] };

  assert.doesNotThrow(() => assertDigestMatches(subject, digestJson(subject)));
  assert.throws(
    () => assertDigestMatches(subject, `sha256:${"0".repeat(64)}`),
    /digest|hash|mismatch/i,
  );
  assert.throws(
    () => assertDigestMatches(subject, "sha1:deadbeef"),
    /algorithm|digest|hash/i,
  );
});
