---
name: nextstep
description: Validate the NextStep P5-M0 contract kernel and current project-stage boundary. Use when a user explicitly invokes NextStep during implementation-readiness work to inspect the active route or run the read-only contract probe; do not use it yet for requirement generation, task dispatch, source mutation, or stage approval.
---

# NextStep

Operate only within the current `P5-M0` readiness boundary.

## Inspect The Stage

1. Resolve the project root explicitly.
2. Read `PROJECT_ROUTE_LOCK.md` and `docs/PLANS.md`.
3. Confirm the active milestone is `P5-M0` before running the probe.
4. Report the current stage, active gate, blocking reason, and permitted next action from those sources.

Do not infer stage state from chat history or task titles.

## Run The Contract Probe

Build the local tool before invoking it:

```bash
corepack pnpm install --frozen-lockfile
pnpm build
```

Pass one RFC 8785 canonical JSON object through standard input:

```json
{"schema_version":"1.0","subject":{"example":"value"}}
```

Invoke `node dist/src/cli/contract-probe.js --dry-run`. Treat standard output as one machine-readable receipt. Treat standard error as diagnostic text only.

Reject malformed JSON, unsupported contract versions, sensitive fields, and non-JSON values. Never echo sensitive input in either output channel.

## Enforce The Boundary

- Do not create or dispatch an Execution Packet.
- Do not initialize or move `refs/nextstep/formal` or `refs/nextstep/control`.
- Do not modify project sources through the probe.
- Do not claim any `PC-01..PC-20` capability is complete.
- Do not claim host mode is `full`, `manual-isolated`, or supported.
- Do not enter S1.1 until the P5-M0 gate is independently closed in project truth sources.
