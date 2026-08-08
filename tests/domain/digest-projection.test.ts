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

  assert.deepEqual(projectForDigest(subject, ["packet_digest"]), {
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
