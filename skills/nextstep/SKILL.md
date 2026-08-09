---
name: nextstep
description: Validate a NextStep S1.1 requirement-intake candidate and current project-stage boundary. Use when a user explicitly invokes NextStep to structure a fuzzy idea into a candidate requirement record; do not use it for freezing, task dispatch, source mutation, or stage approval.
---

# NextStep

Operate only within the current `V1 / M1.1 / S1.1` requirement-intake boundary.

## Inspect The Stage

1. Resolve the project root explicitly.
2. Read `PROJECT_ROUTE_LOCK.md` and `docs/PLANS.md`.
3. Confirm the active milestone is `V1 / M1.1 / S1.1` before running the intake tool.
4. Report the current stage, active gate, blocking reason, and permitted next action from those sources.

Do not infer stage state from chat history or task titles.

## Prepare A Requirement Candidate

AI may organize the user's wording into a candidate, but TypeScript performs the deterministic validation. Do not invent facts. Every required field must be present: use `identified` with concrete values only when supported by the expression, otherwise use `missing` with an empty `items` array or a concise intent `reason`.

The candidate must contain only `schema_version` and `candidate`; `candidate` must contain `raw_expression`, `intent_summary`, `goals`, `scenarios`, `constraints`, `expected_outputs`, `non_goal_gaps`, and `clarification_gaps`. It must never contain a development task, implementation plan, credentials, or extra fields.

## Run Requirement Intake

Build the local tool before invoking it:

```bash
corepack pnpm install --frozen-lockfile
pnpm build
```

Pass one RFC 8785 canonical JSON object through standard input:

```json
{"candidate":{"clarification_gaps":{"items":[],"status":"missing"},"constraints":{"items":[],"status":"missing"},"expected_outputs":{"items":[],"status":"missing"},"goals":{"items":["帮助用户明确需求"],"status":"identified"},"intent_summary":{"status":"identified","value":"整理项目想法"},"non_goal_gaps":{"items":[],"status":"missing"},"raw_expression":"我想做一个项目规划工具。","scenarios":{"items":[],"status":"missing"}},"schema_version":"1.0"}
```

Invoke `node dist/src/cli/requirement-intake.js`. Treat standard output as one machine-readable receipt. Treat standard error as diagnostic text only.

Reject malformed JSON, unsupported contract versions, missing or unknown fields, non-canonical bytes, sensitive fields, and embedded development tasks. Never echo sensitive input in either output channel.

## Enforce The Boundary

- Do not freeze a requirement, create or dispatch an Execution Packet, or generate development tasks.
- Do not initialize or move `refs/nextstep/formal` or `refs/nextstep/control`.
- Do not modify project sources through the probe.
- Do not claim any `PC-01..PC-20` capability, gate, version, or project is complete.
- Do not claim host mode is `full`, `manual-isolated`, or supported.
- Do not enter S1.2 or later until the required independent gates and user confirmation are complete.
