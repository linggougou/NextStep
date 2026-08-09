import assert from "node:assert/strict";
import test from "node:test";

import { assertNoSensitiveContent, assertNoSensitiveFields } from "../../src/domain/sensitive-fields.ts";

test("sensitive field names remain blocked without returning their values", () => {
  assert.throws(() => assertNoSensitiveFields({ nested: { authorization: "Bearer redacted" } }), /sensitive/i);
});

test("sensitive persisted string content blocks common token, Authorization, and private-key samples", () => {
  for (const value of [
    "token: ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "access_token=abcdefghijk",
    "Authorization: Bearer sensitive-value-not-to-echo",
    "-----BEGIN PRIVATE KEY-----\\nnot-a-real-key",
  ]) {
    assert.throws(() => assertNoSensitiveContent({ description: value }), /sensitive/i);
  }
  assert.doesNotThrow(() => assertNoSensitiveContent({ description: "Authorization header is required by an external API." }));
});
