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

Before asking for confirmation, create a confirmation challenge that binds all of the following to the exact user-visible confirmation view:

- `freeze-requirement-set` action.
- Repository identity and formal baseline.
- Requirement Set ID, version, content digest, and confirmation-view digest.
- Confirmation ID and challenge creation time.

Accept only a structured confirmation envelope with `confirmation_kind: explicit-user-confirmation` and a confirmation time. A bare boolean, a normal text response such as "确认", or an envelope with any mismatched binding is not a confirmation and must be rejected.

Build the local tool and send one RFC 8785 canonical JSON freeze command through standard input:

```bash
pnpm build
node dist/src/cli/requirement-freeze.js
```

The CLI writes exactly one JCS machine receipt to stdout. Diagnostics go only to stderr. It scans the content that would be persisted and blocks common token, Authorization, and private-key samples without echoing values.

On success, retain the complete `data.frozen_requirement` record as the persistent recovery input. It has a stable frozen ID, the Requirement Set content identity, confirmation binding, `frozen` status, and only the next entry `S1.3.product-definition`. Recovery consumes that record alone; it does not depend on chat history. Reuse of the same confirmation ID returns the same frozen identity only when content and confirmation binding are identical; otherwise it is an identity conflict.

## Replay The Contract Handoff

`tests/fixtures/requirement-intake/skill-replay.json` records one user sentence and one host-AI candidate. The replay proves that the evidence-bearing candidate, deterministic validation, and user output connect correctly. It does not prove model quality and must not be described as a rule-based natural-language parser.

Run `pnpm test` to replay it. The fixture is contract evidence, not a substitute for future host interaction evaluation.

## Enforce The Boundary

- Do not freeze a requirement at S1.1, write project truth sources, create an Execution Packet, or generate development tasks.
- Do not initialize or move `refs/nextstep/formal` or `refs/nextstep/control`.
- Do not modify project sources through requirement intake.
- Do not claim any `PC-01..PC-20` capability, gate, version, or project is complete.
- Do not claim host mode is `full`, `manual-isolated`, or supported.
- Do not enter S1.2 until the required independent gates are complete, and do not enter S1.3 until a valid frozen record exists.
