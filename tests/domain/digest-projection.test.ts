import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDigestMatches,
  digestJson,
  projectForDigest,
} from "../../src/domain/content-digest.ts";

test("digest projection excludes only the explicitly named digest field", () => {
  const subject = {
    packet_digest: "sha256:self-reference-is-excluded",
    result_digest: "sha256:must-remain-in-projection",
    task_id: "task-001",
  };

  assert.deepEqual({ ...projectForDigest(subject, ["packet_digest"]) }, {
    result_digest: "sha256:must-remain-in-projection",
    task_id: "task-001",
  });
});

test("digest projection detects changes to fields that were not explicitly excluded", () => {
  const subject = {
    packet_digest: "sha256:self-reference-is-excluded",
    result_digest: "sha256:must-remain-in-projection",
    task_id: "task-001",
  };
  const expectedDigest = digestJson(projectForDigest(subject, ["packet_digest"]));
  const changedResultDigest = projectForDigest(
    { ...subject, result_digest: "sha256:changed" },
    ["packet_digest"],
  );
  const changedTask = projectForDigest(
    { ...subject, task_id: "task-002" },
    ["packet_digest"],
  );

  assert.doesNotThrow(() =>
    assertDigestMatches(projectForDigest(subject, ["packet_digest"]), expectedDigest),
  );
  assert.throws(() => assertDigestMatches(changedResultDigest, expectedDigest), /digest|mismatch/i);
  assert.throws(() => assertDigestMatches(changedTask, expectedDigest), /digest|mismatch/i);
});

test("digest projection rejects properties that cannot be represented as explicit JSON data", () => {
  const nonEnumerable = { packet_digest: "excluded", task_id: "task-001" };
  Object.defineProperty(nonEnumerable, "hidden", {
    enumerable: false,
    value: "must-not-disappear",
  });

  const symbolKeyed = { packet_digest: "excluded", task_id: "task-001" };
  Object.defineProperty(symbolKeyed, Symbol("hidden"), {
    enumerable: true,
    value: "must-not-disappear",
  });

  let getterReads = 0;
  const accessorBacked = Object.create(Object.prototype, {
    packet_digest: { enumerable: true, value: "excluded" },
    changing: {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return getterReads;
      },
    },
  });

  for (const subject of [nonEnumerable, symbolKeyed, accessorBacked]) {
    assert.throws(
      () => projectForDigest(subject, ["packet_digest"]),
      /enumerable|symbol|accessor|data propert|json/i,
    );
  }
  assert.equal(getterReads, 0, "digest projection must not execute accessors");
});

test("digest projection returns a frozen projection from one descriptor snapshot", () => {
  const subject = new Proxy(
    { packet_digest: "excluded", task_id: "target-value" },
    {
      get: (target, property, receiver) =>
        property === "task_id" ? "consumer-value" : Reflect.get(target, property, receiver),
      getOwnPropertyDescriptor: (target, property) =>
        property === "task_id"
          ? {
              configurable: true,
              enumerable: true,
              value: "descriptor-value",
              writable: true,
            }
          : Reflect.getOwnPropertyDescriptor(target, property),
    },
  );

  const projection = projectForDigest(subject, ["packet_digest"]);

  assert.deepEqual({ ...projection }, { task_id: "descriptor-value" });
  assert.ok(Object.isFrozen(projection));
  assert.equal(Object.getPrototypeOf(projection), null);
});
