import assert from "node:assert/strict";
import test from "node:test";

import { assertCommandPolicy } from "../../src/domain/command-policy.ts";

test("command policy rejects every mutating command without dry-run", () => {
  for (const command of [
    "candidate-build",
    "formal-promote",
    "packet-build",
    "registry-transition",
    "snapshot-materialize",
  ]) {
    assert.throws(
      () => assertCommandPolicy({ command, dry_run: false }),
      /dry.run|mutating|command|policy/i,
    );
  }
});

test("command policy covers all eight P4 logical commands", () => {
  for (const command of [
    "candidate-build",
    "formal-promote",
    "packet-build",
    "registry-transition",
    "snapshot-materialize",
  ]) {
    assert.doesNotThrow(() => assertCommandPolicy({ command, dry_run: true }));
  }

  for (const command of ["gate-evaluate", "project-resolve", "source-validate"]) {
    assert.doesNotThrow(() => assertCommandPolicy({ command, dry_run: false }));
  }
});
