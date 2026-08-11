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

test("Requirement Set combines three target-project candidates with explicit none, rejected, and deferred facts", async () => {
  for (const fixture of [
    "project-delivery-tool.json",
    "community-workshop.json",
    "expense-reminder.json",
  ]) {
    const requirementSet = await createSet(fixture);
    const parsed = parseRequirementSet(requirementSet);

    assert.equal(parsed.status, "ready-for-confirmation");
    assert.equal(parsed.requirement_set_id, (await readFixture(fixture)).requirement_set_id);
    assert.ok(parsed.items.some((item) => item.status === "identified"));
    assert.ok(Object.isFrozen(parsed));
    assert.equal(Object.getPrototypeOf(parsed), null);
    assert.equal(listUnresolvedRequirementFields(parsed).length, 0);

    const fixtureInput = await readFixture(fixture);
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
      { type: "user-action", user_action: userAction, evaluated_at: fixtureInput.host_replay.occurred_at },
    );
    const frozen = freezeRequirementSet({
      schema_version: "1.0",
      action: "freeze-requirement-set",
      requirement_set: parsed,
      confirmation: createConfirmationEnvelope(verified),
    }, undefined, {
      verifier,
      verified_interaction: verified,
      interaction_session: interactionSession,
      now: () => new Date(new Date(fixtureInput.host_replay.occurred_at).valueOf() + 1),
    });
    assert.equal(fixtureInput.host_replay.evidence_scope, "consumer-contract-only");
    assert.equal(recoverFrozenRequirement(JSON.parse(JSON.stringify(frozen))).frozen_requirement_id, frozen.frozen_requirement_id);
  }

  const explicitNone = await createSet();
  assert.equal(
    explicitNone.items.find((item) => item.field === "non_goal_gaps")?.status,
    "none",
  );
  const deferred = await createSet("community-workshop.json");
  assert.equal(
    deferred.items.find((item) => item.field === "clarification_gaps")?.status,
    "deferred",
  );
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
