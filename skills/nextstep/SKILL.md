---
name: nextstep
description: Validate NextStep requirement, freeze, Product Definition 2.0 in `V1 / M1.1 / S1.3`, S1.4 prototype/profile in `V1 / M1.2 / S1.4`, and S1.5 candidate-write contracts in `V1 / M1.2 / S1.5` after explicit project/stage inspection. S1.5 permits dry-run preview and a narrowly injected integration-agent write transaction only after explicit confirmation; the main conversation never reads or writes project files.
---

# NextStep

Operate only within the current `V1 / M1.1 / S1.1`, `V1 / M1.1 / S1.2`, `V1 / M1.1 / S1.3`, `V1 / M1.2 / S1.4`, or `V1 / M1.2 / S1.5` boundary shown by project truth.

## Inspect The Stage

1. Resolve the project root explicitly.
2. Read `PROJECT_ROUTE_LOCK.md` and `docs/PLANS.md`.
3. Confirm the active milestone is `V1 / M1.1 / S1.1` before running requirement intake, `V1 / M1.1 / S1.2` before preparing a freeze record, `V1 / M1.1 / S1.3` before validating a product-definition candidate, `V1 / M1.2 / S1.4` before validating a carrier-free prototype, carrier decision, or Acceptance Profile candidate, or `V1 / M1.2 / S1.5` before previewing or applying a candidate write.
4. Report the current stage, active gate, blocking reason, and permitted next action from those sources.

Do not infer stage state from chat history or task titles.

## Build An Evidence-Backed Candidate

The host AI may organize one user sentence into a candidate. The TypeScript kernel only validates that candidate; it does not parse natural language or replace the host AI.

For every ordinary `identified` fact:

- Preserve the exact fact text as `value`.
- Add exactly one UTF-16 `[start,end)` evidence span into `raw_expression`.
- Set `quote` to the exact source substring. `value` and `quote` must match.

For an intent summary, set `source` to `quoted` when it is verbatim or `derived` when it is a synthesis. A derived summary must still carry every supporting source span and must never be presented as the user's exact words.

When the sentence does not support a goal, scenario, constraint, expected output, non-goal, or clarification fact, use `status: missing`, an empty `items` array, and one user-facing `clarification_question`. Never prefill an unsupported value.

The candidate contains only `schema_version` and `candidate`. The candidate fields are `raw_expression`, `intent_summary`, `goals`, `scenarios`, `constraints`, `expected_outputs`, `non_goal_gaps`, and `clarification_gaps`. Never include development tasks, implementation plans, credentials, or extra fields.

## Validate And Present

Build the local tool before invoking it:

```bash
corepack pnpm install --frozen-lockfile
pnpm build
```

Pass one RFC 8785 canonical JSON candidate through standard input and invoke:

```bash
node dist/src/cli/requirement-intake.js
```

Treat stdout as one JCS machine receipt and stderr as diagnostics only. Reject malformed JSON, unsupported versions, missing or unknown fields, non-canonical bytes, sensitive fields, mismatched evidence, unsupported prefilled facts, and embedded development tasks.

On success, present `data.user_output` to the user. It contains the candidate summary, evidence-backed facts, every missing field, and the next clarification questions. Ask the clarification questions, but do not freeze or write the candidate.

## Freeze A Completed Requirement Set

Only at S1.2, combine the validated S1.1 candidate with the user's supplemental resolutions into a Requirement Set. Preserve every field as exactly one of `identified`, explicit `none`, `unresolved`, `rejected`, or `deferred`. Do not invent a resolution for an unsupported fact.

Readiness is field-specific and fail closed. For `non_goal_gaps`, only `identified` or explicit `none` may proceed; `rejected`, `deferred`, and `unresolved` block confirmation and freezing. For `clarification_gaps`, only explicit `none` may proceed; `identified`, `rejected`, `deferred`, and `unresolved` all block. Every other field keeps the existing unresolved rule. State every blocking field and return to requirement completion. A rejected or deferred item remains explicit in the immutable Requirement Set; changing any frozen content enters `PC-17` Change Intake rather than modifying it in place.

Before asking for confirmation, create a confirmation challenge with an expiry. Its strict confirmation view must contain the complete Requirement Set summary and items, the action, repository identity, formal baseline, Requirement Set ID/version/generation/content digest, confirmation ID, challenge creation time, and expiry.

Record the host interaction as four separately bound records:

1. The challenge.
2. A complete confirmation view display after challenge creation and before expiry.
3. An independent user action event that binds the display, view, challenge, project, baseline, Requirement Set generation and expiry. Its time must be strictly after display and strictly before expiry.
4. The confirmation envelope derived only from a valid `confirm` action. Its `confirmed_at` is the user action time, never a caller-provided label or timestamp.

Only a structured independent user action with `user_action: confirm` can form a confirmation envelope. A bare boolean, a normal text response such as "确认", a direct self-described envelope, a machine receipt, or a caller-provided `explicit-user-confirmation` label is not a confirmation and must be rejected. A `reject`, `cancel`, expired action, time-reversed action, changed confirmation view, changed challenge, project/baseline/content change, or mismatched binding must not freeze.

The display and action builders only assemble unverified replay data; their fields, including `event_source`, are not proof. Freezing requires a narrow trusted confirmation interaction verifier, its in-process verified result, the module-private session capability holding the current `confirmed` state bound to the Requirement Set generation/challenge/display digests, and a trusted execution clock. The clock must be no earlier than the action and current-state evaluation times and strictly before expiry. Without that context, including through the stdin-only CLI, fail closed. A confirmed generation is terminally invalidated by reject, cancel, expiry, or a view change and cannot be revived by passing a saved state snapshot, recreating the same session, or reusing its envelope.

Build the local tool. Use the direct stdin entry only as a fail-closed probe; a host that holds the verifier capability must call the exported runner in process with one RFC 8785 canonical JSON freeze command:

```bash
pnpm build
node dist/src/cli/requirement-freeze.js
```

The CLI writes exactly one JCS machine receipt to stdout. Diagnostics go only to stderr. A host adapter may call the exported in-process freeze runner only after it injects the verifier capability, the module-private interaction session capability, and the execution clock it already holds; none of that context may be accepted from stdin, arguments, or environment variables. Direct shell stdin execution has no such context and must fail closed. This runner is a narrow integration boundary, not an implemented real host adapter, real user-action probe, or `full` host support.

On success, retain the complete `data.frozen_requirement` record as the persistent recovery input. It has a stable frozen ID, the Requirement Set content identity, confirmation binding, `frozen` status, and only the next entry `S1.3.product-definition`. Recovery consumes that record alone; it does not depend on chat history. Scan every historical record with the same confirmation ID before deciding: all exact matches are idempotent, while any different content or confirmation binding is an identity conflict regardless of record order. A new version `1` must have no frozen record in its repository and Requirement Set series. A new version greater than `1` must include exactly one valid frozen predecessor at version minus `1` from that same repository and Requirement Set ID. Missing, cross-project, skipped, duplicate, or same-version conflicting history fails closed; a historical record can be recovered independently but cannot replace a new freeze identity.

## Replay The Contract Handoff

`tests/fixtures/requirement-intake/skill-replay.json` records one user sentence and one host-AI candidate. The replay proves that the evidence-bearing candidate, deterministic validation, and user output connect correctly. It does not prove model quality and must not be described as a rule-based natural-language parser.

Run `pnpm test` to replay it. Requirement-freeze fixtures use only the `manual-isolated-fixture` verifier and prove the consumer contract for the challenge, confirmation view display, and independent user action records. They do not prove a real user action occurred, do not provide a trusted host adapter or real host probe, and must never be described as `full` host support.

## Enforce The Boundary

- Do not freeze a requirement at S1.1, write project truth sources, create an Execution Packet, or generate development tasks.
- Do not initialize or move `refs/nextstep/formal` or `refs/nextstep/control`.
- Do not modify project sources through requirement intake.
- Do not claim any `PC-01..PC-20` capability, gate, version, or project is complete.
- Do not claim host mode is `full`, `manual-isolated`, or supported.
- Do not enter S1.2 until the required independent gates are complete, do not enter S1.3 until a valid frozen record exists, and do not enter S1.4 until S1.3 has been formally promoted and the active milestone is `V1 / M1.2 / S1.4`.

## S1.3 Product Definition Signoff

At S1.3, enter only after Inspect The Stage confirms `V1 / M1.1 / S1.3` and the Frozen Requirement has `next_step: S1.3.product-definition`. The host AI may propose a PRD, 用户旅程, and 能力映射 candidate. The deterministic kernel requires every product fact to use a Frozen Requirement JSON Pointer and matching value digest; do not copy product facts from example documents or chat.

S1.3 generates and validates only Product Definition 2.0 candidates (`schema_version: "2.0"`). The S1.2 readiness gate is a precondition for entry: for `non_goal_gaps`, only `identified` with at least one user-confirmed value, or explicit `none`, satisfies readiness; `rejected`, `deferred`, and `unresolved` are blocked upstream and never reach S1.3. For `clarification_gaps`, only explicit `none` may proceed; every other state is blocked upstream, and S1.3 never consumes clarification values. In 2.0, `prd.non_goals` is a status object with exactly `status`, `items`, and `source`: `status` is `identified` or `none`; `identified` requires one or more items bound only to `non_goal_gaps` values; `none` requires `items` to be exactly empty. Its `source` carries a field-level pointer to the complete `non_goal_gaps` Requirement Set item plus that item's RFC 8785 `item_digest`, so an explicit `none` keeps auditable field, status, and user-confirmation evidence instead of degrading into a bare empty array. Constraints can never act as non-goals; a constraint value may only stay in the constraint role or fill scope. Legacy 1.0 product candidates are rejected with `PRODUCT_DEFINITION_REJECTED`: no automatic migration, no 1.0 -> 2.0 converter, no dual reading, no guessing, and no reuse of old 1.0 signatures or evidence.

The PRD requires product name, problem, target users, goals, scenarios, scope, non-goals, and success metrics. The journey and capability map both reference the same product definition ID. Missing fields, unknown fields, broken source binding, stdin-injected signoff claims, or a bare boolean must fail closed.

The signoff challenge binds repository identity, formal baseline, Frozen Requirement identity, product definition digest, and full display digest. Only a trusted product-definition interaction verifier can issue an in-process session capability for an independent user action. The module-private session state is `pending`, `confirmed`, `rejected`, `cancelled`, `expired`, or `superseded`; a monotonic reducer handles verified user actions, expiry evaluation, and view changes. The host must route every accepted user action, expiry evaluation, and replacement display through that reducer before signoff; constructing a display alone does not mutate an outstanding session. Signoff consumes only the current confirmed state for its exact display. Reject, cancel, expiry, changed display, cloned session, old session, or a cross-definition capability fail closed and cannot revive an old confirm.

`product_definition_id` is deterministically derived from the Frozen Requirement identity; callers cannot select or reuse it. Facts declare `kind: direct` or `kind: derived`: direct facts exactly equal one source value, while derived facts require a role-specific `derivation_summary` beginning `role:<role>;` and one or more legitimate source refs. One direct source cannot fill different core product roles such as problem, target_users, scenarios, actor, activity, result, or capability; a shared source must use a role-specific derived fact. Target users use scenarios; a journey step uses a scenario-bound actor and a goal/expected-output `semantic_source`; capabilities use goals or expected outputs; non-goals use only the `non_goal_gaps` field-status object, while constraints may fill scope but can never serve as non-goals.

Success metrics are controlled `measurement`, `target`, and `evidence` records. The only measurement is `completion-transition`; the target binds a goal/expected-output `semantic_source` and requires `completed`; evidence carries a `journey_sequence` plus the exact `transition_digest` of that product definition's completion step. Metric evidence proves the complete start/complete chain in the same semantic_source partition, not an isolated completed step. Free-form metric, target, evidence, or display text cannot satisfy this contract. A user journey is an ordered `sequence` of steps with source-bound `actor`, `activity`, `result`, `semantic_source`, enumerated `action`, `state_change` (`from` and `to`), and `outcome`. The state machine permits only `not-started -> in-progress -> completed`: `start` makes the first transition, `complete` makes the second, each semantic_source partition is continuous, and `outcome` equals `to`. The transition_digest covers actor, activity, result, semantic source, action, state change, and outcome. Each target-project fixture must carry and replay its own complete Frozen Requirement and candidate. S1.3 fixtures establish only the `manual-isolated consumer contract`; they do not prove a real host adapter, real user action probe, or `full` support.

Build the local tool before validating a product-definition candidate:

```bash
pnpm build
node dist/src/cli/product-definition.js
```

The stdin command only validates and receipts the candidate. It cannot receive a verifier, session, state, or clock and therefore cannot sign. A host holding the in-process verifier and current session may use the exported domain boundary for the manual-isolated consumer contract; this does not implement a real host adapter, a real user-action probe, or `full` support.

## S1.4 Prototype And Profile Adjudication

At S1.4, enter only after Inspect The Stage confirms `V1 / M1.2 / S1.4`, S1.3 has been formally promoted, and the signed Product Definition 2.0 is replayable. The host AI organizes every candidate; the deterministic kernel only validates it (kernel 只校验候选). The kernel never parses natural language, never writes truth sources back (不回写真源), never signs (不签认), and never declares `full` host support.

A carrier-free interaction prototype (载体无关原型) candidate carries inputs, responses, confirmation nodes, stage transitions, exceptions, recovery entries, and the items that must never be deviated from, each bound to evidence. It must not be narrowed into a Codex chat script and must not carry any Web/UI mainline claim. Validate one RFC 8785 canonical JSON candidate through stdin:

```bash
node dist/src/cli/interaction-prototype.js
```

A carrier decision (载体裁决) candidate fixes the main carrier (`skill-chat`), the truth-source carrier (project documents plus `PROJECT_ROUTE_LOCK.md` plus stage truth sources), auxiliary entries, and candidate branch conditions. Web/UI materials stay candidate branches (候选分支) with checkable recovery conditions; they must not be treated as the current mainline or as formal truth sources. A carrier decision requires an explicit user confirmation (显式确认) before any S3 write-back mapping records it; without that write-back it is not a formal truth source. Validate the candidate with:

```bash
node dist/src/cli/carrier-decision.js
```

An Acceptance Profile candidate is derived from the target project route. A headless route requires integration, interaction, and product acceptance and disables UI restoration (UI 还原); a missing UI report on a headless route must not fail the project. A route with UI additionally requires a signed UI design source and UI restoration evidence references. A route/Profile conflict must fail closed with `PROFILE_CONFLICT_REJECTED`: the configuration is rejected and progress is blocked; there is no downgrade to headless and no degraded Profile output. Independent tasks only provide evidence (只提供证据); they never change Profile applicability. For NextStep itself the route is Skill-only; any candidate Profile that enables UI acceptance for this repository is rejected. Validate with:

```bash
node dist/src/cli/acceptance-profile.js
```

Every S1.4 stdin command follows the existing discipline: one RFC 8785 canonical JSON candidate in, one JCS machine receipt out (`INTERACTION_PROTOTYPE_ACCEPTED`, `CARRIER_DECISION_ACCEPTED`, or `ACCEPTANCE_PROFILE_ACCEPTED` on success), stderr diagnostics only, and exit code 1 on failure. Missing fields, unknown fields, unknown versions, non-canonical bytes, sensitive fields, mismatched digests, and stdin-injected signoff claims fail closed.

Prototype signoff, carrier decision, and Profile configuration each require an explicit user confirmation node recorded in the four-state gate record: 通过 (passed), 退回 (returned), 需讨论 (needs discussion), or 阻塞 (blocked).

The S1.4 receipts are evidence for S1.5, S1.6, and the M1.2 I/X/P gates. S1.4 does not complete M1.2, does not generate execution packets, does not dispatch tasks, and does not move `refs/nextstep/formal` or `refs/nextstep/control`.

## S1.5 Candidate Write Consistency

Enter only after project truth explicitly reports `V1 / M1.2 / S1.5`. Resolve one canonical absolute project root and read its `PROJECT_ROUTE_LOCK.md`; same-name roots, nested roots, symlinks, path escape, missing stage sources, and inaccessible paths fail closed. Never infer the project or stage from the main conversation.

The main conversation Agent is only the user communication, decision, and flat-dispatch entry. It must not read or modify project files and cannot obtain the write capability by placing `actor_role`, a confirmation envelope, or an approval claim in stdin, arguments, or environment variables. An execution Agent may produce a dry-run preview. Only an integration Agent holding the in-process file-system port, trusted clock, and explicit confirmation envelope may request `--commit`.

Preview the candidate through one RFC 8785 canonical JSON command:

```bash
node dist/src/cli/write-consistency.js
```

The exported `runCandidateChangePreview` composition root resolves the project/stage and calls the deterministic candidate evaluator with `dry_run: true`. A preview never calls `atomicWrite` or `removeCreated`, never creates a commit, and never changes the target worktree or its formal/control refs.

After the complete challenge/view/display/independent-user-action chain has been verified and an explicit confirmation envelope exists, the integration Agent may call exported `runWriteTransaction` in process. `--dry-run` rechecks every baseline and returns `WRITE_PREVIEWED` without writing. `--commit` rechecks the same project, stage, project-context digest, confirmation view, expiry, formal/working baseline, target paths, before/after digests, and permissions before returning `WRITE_COMMITTED`.

Direct shell execution has no integration capability and must fail closed. stdout contains exactly one JCS machine receipt; diagnostics use stderr only; every failure sets exit code 1. `WRITE_CONFLICT_REJECTED` means the confirmed baseline or target changed and must never overwrite newer work. `WRITE_ACCESS_BLOCKED` covers access, project, stage, path, or symlink refusal. `WRITE_PARTIAL_BLOCKED` means a write or safe rollback could not complete and requires recovery. `WRITE_CONFIRMATION_REJECTED` means the explicit confirmation is absent, expired, changed, or mismatched. These codes do not replace or downgrade the existing `PROFILE_CONFLICT_REJECTED` route/Profile code.

On any failed target, readback mismatch, unsafe rollback, or validation failure, keep state promotion at `none`: do not update signoff, stage, `refs/nextstep/formal`, `refs/nextstep/control`, registry, Final Snapshot, or Audit Anchor. Never use destructive Git recovery. The three write-consistency fixture replays prove only a `manual-isolated consumer contract`; they do not prove a real host adapter, real user event, `full` support, S1.5 completion, M1.2 completion, or permission to enter S1.6.

不得推进 formal/control；候选写入成功也不等于阶段正式提升。
