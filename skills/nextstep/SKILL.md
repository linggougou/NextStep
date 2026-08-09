---
name: nextstep
description: Validate a NextStep S1.1 evidence-backed requirement-intake candidate and present its candidate facts and clarification questions. Use when a user explicitly invokes NextStep with one fuzzy project idea; do not use it for freezing, writing sources, task dispatch, or stage approval.
---

# NextStep

Operate only within the current `V1 / M1.1 / S1.1` requirement-intake boundary.

## Inspect The Stage

1. Resolve the project root explicitly.
2. Read `PROJECT_ROUTE_LOCK.md` and `docs/PLANS.md`.
3. Confirm the active milestone is `V1 / M1.1 / S1.1` before running requirement intake.
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

## Replay The Contract Handoff

`tests/fixtures/requirement-intake/skill-replay.json` records one user sentence and one host-AI candidate. The replay proves that the evidence-bearing candidate, deterministic validation, and user output connect correctly. It does not prove model quality and must not be described as a rule-based natural-language parser.

Run `pnpm test` to replay it. The fixture is contract evidence, not a substitute for future host interaction evaluation.

## Enforce The Boundary

- Do not freeze a requirement, write project truth sources, create an Execution Packet, or generate development tasks.
- Do not initialize or move `refs/nextstep/formal` or `refs/nextstep/control`.
- Do not modify project sources through requirement intake.
- Do not claim any `PC-01..PC-20` capability, gate, version, or project is complete.
- Do not claim host mode is `full`, `manual-isolated`, or supported.
- Do not enter S1.2 or later until the required independent gates and user confirmation are complete.
