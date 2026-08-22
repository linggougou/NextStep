import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";
import { runRequirementFreeze } from "../../src/cli/requirement-freeze.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";
import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  createConfirmationInteractionSession,
  createUnverifiedConfirmationViewDisplay,
  createUnverifiedUserConfirmationAction,
  reduceConfirmationInteractionState,
  verifyConfirmationInteraction,
} from "../../src/domain/requirement-confirmation.ts";
import { buildRequirementSet } from "../../src/domain/requirement-set.ts";

test("NextStep Skill 固定 S1.5 阶段、职责、确认与失败不提升边界", async () => {
  const skill = await readFile(resolve(process.cwd(), "skills/nextstep/SKILL.md"), "utf8");
  for (const expected of [
    /V1\s*\/\s*M1\.2\s*\/\s*S1\.5/,
    /main conversation|主对话/i,
    /integration agent|集成 Agent/i,
    /dry-run/i,
    /explicit confirmation|显式确认/i,
    /WRITE_CONFLICT_REJECTED/,
    /WRITE_PARTIAL_BLOCKED/,
    /WRITE_ACCESS_BLOCKED/,
    /不得.*formal|formal.*不得/i,
    /fixture.*manual-isolated consumer contract/is,
  ]) assert.match(skill, expected);
});

test("S1.5 集成通过当前 freeze runner 回放保持既有 S1.2 Frozen Requirement 的 RFC8785 字节与 digest", async () => {
  const freezeFixture = JSON.parse(await readFile(
    resolve(process.cwd(), "tests/fixtures/requirement-freeze/community-workshop.json"),
    "utf8",
  )) as {
    readonly intake_fixture: string;
    readonly project: { readonly repository_id: string; readonly formal_baseline: string };
    readonly requirement_set_id: string;
    readonly version: number;
    readonly confirmation_id: string;
    readonly known_frozen_records?: readonly unknown[];
    readonly user_resolutions: readonly unknown[];
    readonly host_replay: {
      readonly challenge_created_at: string;
      readonly expires_at: string;
      readonly display_id: string;
      readonly displayed_at: string;
      readonly user_action_id: string;
      readonly occurred_at: string;
    };
  };
  const intake = JSON.parse(await readFile(
    resolve(process.cwd(), `tests/fixtures/requirement-intake/${freezeFixture.intake_fixture}`),
    "utf8",
  )) as unknown;
  const requirementSet = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: freezeFixture.requirement_set_id,
    project: freezeFixture.project,
    version: freezeFixture.version,
    candidate: intake,
    user_resolutions: freezeFixture.user_resolutions,
  });
  const challenge = createConfirmationChallenge(requirementSet, {
    confirmation_id: freezeFixture.confirmation_id,
    created_at: freezeFixture.host_replay.challenge_created_at,
    expires_at: freezeFixture.host_replay.expires_at,
  });
  const display = createUnverifiedConfirmationViewDisplay(challenge, {
    display_id: freezeFixture.host_replay.display_id,
    displayed_at: freezeFixture.host_replay.displayed_at,
  });
  const action = createUnverifiedUserConfirmationAction(display, {
    user_action_id: freezeFixture.host_replay.user_action_id,
    action: "confirm",
    occurred_at: freezeFixture.host_replay.occurred_at,
  });
  const verifier = { verifier_kind: "manual-isolated-fixture", verify: () => true } as const;
  const verified = verifyConfirmationInteraction({ display, user_action: action }, verifier);
  const session = createConfirmationInteractionSession(verified);
  reduceConfirmationInteractionState(session, {
    type: "user-action",
    verified_interaction: verified,
    evaluated_at: freezeFixture.host_replay.occurred_at,
  });
  const command = {
    schema_version: "1.0",
    action: "freeze-requirement-set",
    requirement_set: requirementSet,
    confirmation: createConfirmationEnvelope(verified),
    known_frozen_records: freezeFixture.known_frozen_records ?? [],
  };
  const output: string[] = [];
  const io: ProcessIoAdapter = {
    args: [],
    async readInput() { return Buffer.from(canonicalizeJson(command), "utf8"); },
    writeOutput(value) { output.push(value); },
    writeDiagnostic() { assert.fail("freeze replay 不应产生诊断"); },
    setExitCode() { assert.fail("freeze replay 不应设置失败码"); },
  };
  await runRequirementFreeze(io, {
    verifier,
    verified_interaction: verified,
    interaction_session: session,
    now: () => new Date(new Date(freezeFixture.host_replay.occurred_at).valueOf() + 1),
  });
  assert.equal(output.length, 1);
  const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as {
    readonly code: string;
    readonly data: { readonly frozen_requirement: unknown };
  };
  assert.equal(receipt.code, "REQUIREMENT_FREEZE_ACCEPTED");

  const fixture = JSON.parse(await readFile(
    resolve(process.cwd(), "tests/fixtures/product-definition/community-workshop.json"),
    "utf8",
  )) as {
    readonly frozen_requirement: unknown;
    readonly product_definition: { readonly frozen_requirement: unknown };
  };
  assert.equal(
    canonicalizeJson(receipt.data.frozen_requirement),
    canonicalizeJson(fixture.frozen_requirement),
  );
  assert.equal(
    canonicalizeJson(receipt.data.frozen_requirement),
    canonicalizeJson(fixture.product_definition.frozen_requirement),
  );
  assert.equal(
    digestJson(receipt.data.frozen_requirement),
    "sha256:21a0f7ce08ed8cbd5a4d7a8dbc1d21629c6c77b6927e66bd27c128d22532f58a",
  );
});
