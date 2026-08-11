---
name: nextstep
description: Validate a NextStep requirement candidate and, only at S1.2, create an explicitly confirmed immutable freeze record that can be recovered without chat history. Use when a user explicitly invokes NextStep for requirement intake or requirement freeze; do not use it for source writing, task dispatch, or stage approval.
---

# NextStep

Operate only within the current `V1 / M1.1 / S1.1` or `V1 / M1.1 / S1.2` boundary shown by project truth.

## Inspect The Stage

1. Resolve the project root explicitly.
2. Read `PROJECT_ROUTE_LOCK.md` and `docs/PLANS.md`.
3. Confirm the active milestone is `V1 / M1.1 / S1.1` before running requirement intake, or `V1 / M1.1 / S1.2` before preparing a freeze record.
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

An unresolved field blocks freezing. State the missing fields and return to requirement completion. A rejected or deferred item remains explicit in the immutable Requirement Set; changing any frozen content enters `PC-17` Change Intake rather than modifying it in place.

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

On success, retain the complete `data.frozen_requirement` record as the persistent recovery input. It has a stable frozen ID, the Requirement Set content identity, confirmation binding, `frozen` status, and only the next entry `S1.3.product-definition`. Recovery consumes that record alone; it does not depend on chat history. Scan every historical record with the same confirmation ID before deciding: all exact matches are idempotent, while any different content or confirmation binding is an identity conflict regardless of record order.

## Replay The Contract Handoff

`tests/fixtures/requirement-intake/skill-replay.json` records one user sentence and one host-AI candidate. The replay proves that the evidence-bearing candidate, deterministic validation, and user output connect correctly. It does not prove model quality and must not be described as a rule-based natural-language parser.

Run `pnpm test` to replay it. Requirement-freeze fixtures use only the `manual-isolated-fixture` verifier and prove the consumer contract for the challenge, confirmation view display, and independent user action records. They do not prove a real user action occurred, do not provide a trusted host adapter or real host probe, and must never be described as `full` host support.

## Enforce The Boundary

- Do not freeze a requirement at S1.1, write project truth sources, create an Execution Packet, or generate development tasks.
- Do not initialize or move `refs/nextstep/formal` or `refs/nextstep/control`.
- Do not modify project sources through requirement intake.
- Do not claim any `PC-01..PC-20` capability, gate, version, or project is complete.
- Do not claim host mode is `full`, `manual-isolated`, or supported.
- Do not enter S1.2 until the required independent gates are complete, and do not enter S1.3 until a valid frozen record exists.

## S1.3 Product Definition Signoff

At S1.3, the host AI may propose a PRD, 用户旅程, and 能力映射 candidate. The deterministic kernel requires every product fact to use a Frozen Requirement JSON Pointer and matching value digest; do not copy product facts from example documents or chat.

The PRD requires product name, problem, target users, goals, scenarios, scope, non-goals, and success metrics. The journey and capability map both reference the same product definition ID. Missing fields, unknown fields, broken source binding, stdin-injected signoff claims, or a bare boolean must fail closed.

The signoff challenge binds repository identity, formal baseline, Frozen Requirement identity, product definition digest, and full display digest. Only a trusted product-definition interaction verifier can issue an in-process session capability for an independent user action. Expiry, reject, cancel, changed display, or a cross-definition capability cannot sign.

`product_definition_id` is deterministically derived from the Frozen Requirement identity; callers cannot select or reuse it. Facts declare `kind: direct` or `kind: derived`: direct facts exactly equal one source value, while derived facts require a derivation summary and one or more legitimate source refs. Target users use scenarios; journey steps use scenarios or goals; capabilities use goals or expected outputs; non-goals use non-goals or constraints.

Success metrics are structured `metric`, `target`, `evidence_method`, and `source_refs` records. Their sources are goals or expected outputs, never constraints. Each target-project fixture must carry and replay its own complete Frozen Requirement and candidate. S1.3 fixtures establish only the `manual-isolated consumer contract`; they do not prove a real host adapter, real user action probe, or `full` support.
