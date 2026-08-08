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

test("command policy returns the frozen descriptor snapshot it validated", () => {
  const invocation = new Proxy(
    { command: "formal-promote", dry_run: true },
    {
      get: (target, property, receiver) =>
        property === "dry_run" ? false : Reflect.get(target, property, receiver),
    },
  );

  const validated = assertCommandPolicy(invocation);

  assert.deepEqual(validated, { command: "formal-promote", dry_run: true });
  assert.ok(Object.isFrozen(validated));
});

test("command policy rejects malformed runtime invocations and non-boolean dry-run values", () => {
  const accessorInvocation = Object.create(Object.prototype, {
    command: { enumerable: true, get: () => "formal-promote" },
    dry_run: { enumerable: true, value: true },
  });

  for (const invocation of [
    null,
    {},
    { command: "formal-promote" },
    { command: "formal-promote", dry_run: "false" },
    { command: "formal-promote", dry_run: 1 },
    { command: "formal-promote", dry_run: {} },
    { command: "formal-promote", dry_run: [] },
    { command: "formal-promote", dry_run: true, extra: true },
    accessorInvocation,
  ]) {
    assert.throws(
      () => assertCommandPolicy(invocation),
      /invocation|dry.run|boolean|command|policy/i,
    );
  }
});

test("command policy rejects hidden and Symbol command data", () => {
  const hidden = { command: "formal-promote", dry_run: true };
  Object.defineProperty(hidden, "audit", { enumerable: false, value: true });
  const symbolKeyed = { command: "formal-promote", dry_run: true };
  Object.defineProperty(symbolKeyed, Symbol("audit"), { enumerable: true, value: true });

  for (const invocation of [hidden, symbolKeyed]) {
    assert.throws(() => assertCommandPolicy(invocation), /enumerable|symbol|json|invocation/i);
  }
});
