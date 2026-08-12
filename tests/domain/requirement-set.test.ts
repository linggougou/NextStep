import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildRequirementSet,
  listUnresolvedRequirementFields,
  parseRequirementSet,
  RequirementSetError,
} from "../../src/domain/requirement-set.ts";
import {
  createConfirmationChallenge,
  createConfirmationEnvelope,
  createConfirmationInteractionSession,
  createUnverifiedConfirmationViewDisplay,
  createUnverifiedUserConfirmationAction,
  reduceConfirmationInteractionState,
  verifyConfirmationInteraction,
} from "../../src/domain/requirement-confirmation.ts";
import { freezeRequirementSet, recoverFrozenRequirement } from "../../src/domain/requirement-freeze.ts";
import { canonicalizeJson } from "../../src/domain/canonical-json.ts";
import { digestJson } from "../../src/domain/content-digest.ts";

const freezeFixtureDirectory = resolve(process.cwd(), "tests/fixtures/requirement-freeze");
const intakeFixtureDirectory = resolve(process.cwd(), "tests/fixtures/requirement-intake");

interface FreezeFixture {
  readonly intake_fixture: string;
  readonly project: { readonly repository_id: string; readonly formal_baseline: string };
  readonly requirement_set_id: string;
  readonly version: number;
  readonly confirmation_id: string;
  readonly host_replay: {
    readonly evidence_scope: "consumer-contract-only";
    readonly challenge_created_at: string;
    readonly expires_at: string;
    readonly display_id: string;
    readonly displayed_at: string;
    readonly user_action_id: string;
    readonly occurred_at: string;
  };
  readonly user_resolutions: readonly unknown[];
  readonly known_frozen_records?: readonly unknown[];
}

async function readFixture(name: string): Promise<FreezeFixture> {
  return JSON.parse(await readFile(resolve(freezeFixtureDirectory, name), "utf8")) as FreezeFixture;
}

async function createSet(name = "project-delivery-tool.json") {
  const fixture = await readFixture(name);
  const candidate = JSON.parse(
    await readFile(resolve(intakeFixtureDirectory, fixture.intake_fixture), "utf8"),
  ) as unknown;
  return buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: fixture.requirement_set_id,
    project: fixture.project,
    version: fixture.version,
    candidate,
    user_resolutions: fixture.user_resolutions,
  });
}

test("Requirement Set replays the new target-project versions with complete frozen identities", async () => {
  for (const fixture of [
    "project-delivery-tool.json",
    "community-workshop.json",
    "expense-reminder.json",
  ]) {
    const requirementSet = await createSet(fixture);
    const parsed = parseRequirementSet(requirementSet);
    const fixtureInput = await readFixture(fixture);

    assert.equal(parsed.status, "ready-for-confirmation");
    assert.equal(parsed.requirement_set_id, (await readFixture(fixture)).requirement_set_id);
    assert.ok(parsed.items.some((item) => item.status === "identified"));
    assert.ok(Object.isFrozen(parsed));
    assert.equal(Object.getPrototypeOf(parsed), null);
    assert.deepEqual(listUnresolvedRequirementFields(parsed), []);

    const challenge = createConfirmationChallenge(parsed, {
      confirmation_id: fixtureInput.confirmation_id,
      created_at: fixtureInput.host_replay.challenge_created_at,
      expires_at: fixtureInput.host_replay.expires_at,
    });
    const display = createUnverifiedConfirmationViewDisplay(challenge, {
      display_id: fixtureInput.host_replay.display_id,
      displayed_at: fixtureInput.host_replay.displayed_at,
    });
    const userAction = createUnverifiedUserConfirmationAction(display, {
      user_action_id: fixtureInput.host_replay.user_action_id,
      action: "confirm",
      occurred_at: fixtureInput.host_replay.occurred_at,
    });
    const verifier = {
      verifier_kind: "manual-isolated-fixture" as const,
      verify: () => true,
    };
    const verified = verifyConfirmationInteraction({ display, user_action: userAction }, verifier);
    const interactionSession = createConfirmationInteractionSession(verified);
    reduceConfirmationInteractionState(
      interactionSession,
      { type: "user-action", verified_interaction: verified, evaluated_at: fixtureInput.host_replay.occurred_at },
    );
    const frozen = freezeRequirementSet({
      schema_version: "1.0",
      action: "freeze-requirement-set",
      requirement_set: parsed,
      confirmation: createConfirmationEnvelope(verified),
      ...(fixtureInput.known_frozen_records === undefined ? {} : { known_frozen_records: fixtureInput.known_frozen_records }),
    }, undefined, {
      verifier,
      verified_interaction: verified,
      interaction_session: interactionSession,
      now: () => new Date(new Date(fixtureInput.host_replay.occurred_at).valueOf() + 1),
    });
    assert.equal(fixtureInput.host_replay.evidence_scope, "consumer-contract-only");
    assert.equal(recoverFrozenRequirement(JSON.parse(JSON.stringify(frozen))).frozen_requirement_id, frozen.frozen_requirement_id);
    assert.equal(frozen.requirement_set_version, fixtureInput.version);
    assert.equal(canonicalizeJson(JSON.parse(canonicalizeJson(frozen))), canonicalizeJson(frozen));
    assert.equal(frozen.requirement_set.content_digest, frozen.requirement_content_digest);
    if (fixtureInput.version > 1) {
      assert.ok(fixtureInput.known_frozen_records);
      const predecessor = recoverFrozenRequirement(fixtureInput.known_frozen_records.at(-1));
      assert.equal(frozen.requirement_set_version, predecessor.requirement_set_version + 1);
      assert.notEqual(frozen.frozen_requirement_id, predecessor.frozen_requirement_id);
      assert.notEqual(frozen.confirmation.confirmation_id, predecessor.confirmation.confirmation_id);
      assert.notEqual(frozen.confirmation.display.display_id, predecessor.confirmation.display.display_id);
      assert.notEqual(frozen.confirmation.user_action.user_action_id, predecessor.confirmation.user_action.user_action_id);
    }
  }

  const explicitNone = await createSet();
  assert.equal(
    explicitNone.items.find((item) => item.field === "non_goal_gaps")?.status,
    "none",
  );
  const community = await createSet("community-workshop.json");
  assert.equal(
    community.items.find((item) => item.field === "clarification_gaps")?.status,
    "none",
  );
  const expense = await createSet("expense-reminder.json");
  assert.deepEqual(
    expense.items.find((item) => item.field === "constraints")?.values,
    ["仅保存本地数据", "工作日早上提醒"],
  );
});

test("Requirement Set rejects all non-ready non-goal and clarification states during parsing", async () => {
  const communityFixture = await readFixture("community-workshop.json");
  const expenseFixture = await readFixture("expense-reminder.json");
  const communityCandidate = JSON.parse(
    await readFile(resolve(intakeFixtureDirectory, communityFixture.intake_fixture), "utf8"),
  ) as unknown;
  const expenseCandidate = JSON.parse(
    await readFile(resolve(intakeFixtureDirectory, expenseFixture.intake_fixture), "utf8"),
  ) as unknown;
  const community = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: communityFixture.requirement_set_id,
    project: communityFixture.project,
    version: 2,
    candidate: communityCandidate,
    user_resolutions: [
      { field: "expected_outputs", status: "identified", values: ["活动报名清单"] },
      { field: "non_goal_gaps", status: "rejected", values: [] },
      { field: "clarification_gaps", status: "deferred", values: [] },
    ],
  });
  const expense = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: expenseFixture.requirement_set_id,
    project: expenseFixture.project,
    version: 1,
    candidate: expenseCandidate,
    user_resolutions: [
      { field: "constraints", status: "identified", values: ["仅保存本地数据"] },
      { field: "non_goal_gaps", status: "none", values: [] },
      { field: "clarification_gaps", status: "identified", values: ["工作日早上提醒"] },
    ],
  });

  for (const requirementSet of [community, expense]) {
    assert.equal(requirementSet.status, "incomplete");
    assert.throws(
      () => createConfirmationChallenge(requirementSet, {
        confirmation_id: "confirm-blocked-readiness",
        created_at: "2026-08-10T01:00:00.000Z",
        expires_at: "2026-08-10T01:05:00.000Z",
      }),
      /unresolved|incomplete/i,
    );
  }
});

test("Requirement Set retains unresolved facts and rejects forged or duplicate user resolutions", async () => {
  const fixture = await readFixture("project-delivery-tool.json");
  const candidate = JSON.parse(
    await readFile(resolve(intakeFixtureDirectory, fixture.intake_fixture), "utf8"),
  ) as unknown;
  const incomplete = buildRequirementSet({
    schema_version: "1.0",
    requirement_set_id: fixture.requirement_set_id,
    project: fixture.project,
    version: fixture.version,
    candidate,
    user_resolutions: fixture.user_resolutions.slice(0, -1),
  });

  assert.equal(incomplete.status, "incomplete");
  assert.deepEqual(listUnresolvedRequirementFields(incomplete), ["clarification_gaps"]);

  assert.throws(
    () => buildRequirementSet({
      schema_version: "1.0",
      requirement_set_id: fixture.requirement_set_id,
      project: fixture.project,
      version: fixture.version,
      candidate,
      user_resolutions: [
        ...fixture.user_resolutions,
        fixture.user_resolutions[0],
      ],
    }),
    (error: unknown) => error instanceof RequirementSetError && error.code === "INVALID_REQUIREMENT_SET",
  );
});
