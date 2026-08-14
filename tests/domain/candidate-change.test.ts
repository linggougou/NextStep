import assert from "node:assert/strict";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";
import {
  projectContextDigest,
  resolveProjectContext,
  type ProjectContext,
  type ProjectRootProbe,
} from "../../src/domain/project-context.ts";
import {
  CandidateChangeError,
  deriveWorkingBaselineDigest,
  digestFileContent,
  evaluateCandidateChange,
  parseCandidateChange,
  parseCandidateChangeDecision,
  type CandidateChange,
  type CandidateChangeDecision,
  type CandidateChangeRejectionCode,
} from "../../src/domain/candidate-change.ts";

// ---------------------------------------------------------------------------
// 内存探针（与 project-context 测试同构）：候选评估只允许通过端口获得
// 目标项目工作树的基线证据，dry-run 评估本身绝不落盘。
// ---------------------------------------------------------------------------

interface MemoryNode {
  readonly kind: "directory" | "file" | "symlink";
  readonly target?: string;
  readonly content?: string;
  readonly readable?: boolean;
  readonly writable?: boolean;
}

function normalizeFakePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

function createMemoryProbe(nodes: Record<string, MemoryNode>): ProjectRootProbe {
  const rawLookup = (path: string): MemoryNode | undefined => nodes[normalizeFakePath(path)];

  const realpath = (path: string): string => {
    let current = normalizeFakePath(path);
    let hops = 0;
    for (;;) {
      const segments = current.split("/").filter((segment) => segment.length > 0);
      let prefix = "";
      let rewritten: string | null = null;
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment === undefined) {
          continue;
        }
        prefix = `${prefix}/${segment}`;
        const node = nodes[prefix];
        if (node !== undefined && node.kind === "symlink") {
          hops += 1;
          if (hops > 8) {
            throw new Error(`symlink loop at ${prefix}`);
          }
          const target = normalizeFakePath(node.target ?? "");
          const rest = segments.slice(index + 1).join("/");
          rewritten = rest.length > 0 ? `${target}/${rest}` : target;
          break;
        }
      }
      if (rewritten === null) {
        if (nodes[current] === undefined) {
          throw new Error(`no such path: ${current}`);
        }
        return current;
      }
      current = normalizeFakePath(rewritten);
    }
  };

  const resolvedNode = (path: string): MemoryNode => {
    const node = rawLookup(realpath(path));
    if (node === undefined) {
      throw new Error(`no such path: ${path}`);
    }
    return node;
  };

  return {
    exists: (path: string): boolean => {
      try {
        realpath(path);
        return true;
      } catch {
        return false;
      }
    },
    isDirectory: (path: string): boolean => {
      try {
        return resolvedNode(path).kind === "directory";
      } catch {
        return false;
      }
    },
    isSymbolicLink: (path: string): boolean => {
      const node = rawLookup(path);
      return node !== undefined && node.kind === "symlink";
    },
    isReadable: (path: string): boolean => {
      try {
        return resolvedNode(path).readable !== false;
      } catch {
        return false;
      }
    },
    isWritable: (path: string): boolean => {
      try {
        return resolvedNode(path).writable !== false;
      } catch {
        return false;
      }
    },
    realpath,
    readFileUtf8: (path: string): string => {
      const node = resolvedNode(path);
      if (node.kind !== "file" || node.readable === false) {
        throw new Error(`unreadable file: ${path}`);
      }
      return node.content ?? "";
    },
  };
}

// ---------------------------------------------------------------------------
// 基线与候选构造
// ---------------------------------------------------------------------------

const REPOSITORY_ID = `sha256:${"ab".repeat(32)}` as const;
const FORMAL_BASELINE = "a".repeat(40);
const HEAD_OID = "b".repeat(40);
const NOW = "2026-08-15T00:00:00Z";
const EXPIRES_AT = "2026-08-16T00:00:00Z";
const ORIGINAL_CONTENT = "original content\n";
const UPDATED_CONTENT = "updated content\n";

const ROUTE_LOCK_CONTENT = [
  "# PROJECT_ROUTE_LOCK",
  "",
  "- 生命周期阶段：S5 开发落地",
  "- 阶段名称：产品落地",
  "",
].join("\n");

function baseNodes(): Record<string, MemoryNode> {
  return {
    "/ws/alpha": { kind: "directory" },
    "/ws/alpha/PROJECT_ROUTE_LOCK.md": { kind: "file", content: ROUTE_LOCK_CONTENT },
    "/ws/alpha/docs": { kind: "directory" },
    "/ws/alpha/docs/spec.md": { kind: "file", content: ORIGINAL_CONTENT },
    "/ws/alpha/docs/obsolete.md": { kind: "file", content: "obsolete\n" },
  };
}

function buildContext(nodes: Record<string, MemoryNode>): ProjectContext {
  return resolveProjectContext(
    { workspace_roots: ["/ws/alpha"], requested_project: "alpha" },
    createMemoryProbe(nodes),
  );
}

interface CandidateOverrides {
  readonly project?: { repository_id?: string; formal_baseline?: string };
  readonly project_context_digest?: string;
  readonly working_baseline?: { head_oid?: string; dirty?: boolean; baseline_digest?: string };
  readonly targets?: unknown;
  readonly expires_at?: string;
  readonly extra?: Record<string, unknown>;
}

function buildCandidate(context: ProjectContext, overrides: CandidateOverrides = {}): Record<string, unknown> {
  const workingBaseline = {
    head_oid: overrides.working_baseline?.head_oid ?? HEAD_OID,
    dirty: overrides.working_baseline?.dirty ?? false,
  };
  return {
    schema_version: "1.0",
    record_type: "candidate-change",
    candidate_change_id: "candidate-change-s1-5-w2-demo-001",
    project: {
      repository_id: overrides.project?.repository_id ?? REPOSITORY_ID,
      formal_baseline: overrides.project?.formal_baseline ?? FORMAL_BASELINE,
    },
    project_context_digest: overrides.project_context_digest ?? projectContextDigest(context),
    working_baseline: {
      ...workingBaseline,
      baseline_digest:
        overrides.working_baseline?.baseline_digest ?? deriveWorkingBaselineDigest(workingBaseline),
    },
    targets: overrides.targets ?? [
      {
        path: "docs/spec.md",
        kind: "update",
        before_digest: digestFileContent(ORIGINAL_CONTENT),
        after_digest: digestFileContent(UPDATED_CONTENT),
        after_content: UPDATED_CONTENT,
      },
    ],
    impact_summary: "更新目标项目 fixture 的规格文档",
    signoff_consequence: "本次写入只影响目标项目工作树，不触达 NextStep formal/control",
    expires_at: overrides.expires_at ?? EXPIRES_AT,
    ...(overrides.extra ?? {}),
  };
}

function evaluate(
  candidate: unknown,
  options: {
    context?: ProjectContext;
    nodes?: Record<string, MemoryNode>;
    workingBaseline?: { head_oid: string; dirty: boolean };
    now?: string;
    dryRun?: boolean;
  } = {},
): CandidateChangeDecision {
  const nodes = options.nodes ?? baseNodes();
  const context = options.context ?? buildContext(nodes);
  return evaluateCandidateChange(
    {
      candidate,
      project_context: context,
      working_baseline: options.workingBaseline ?? { head_oid: HEAD_OID, dirty: false },
      now: options.now ?? NOW,
      dry_run: options.dryRun ?? true,
    },
    createMemoryProbe(nodes),
  );
}

function expectCandidateChangeError(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof CandidateChangeError, `expected CandidateChangeError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.notEqual(error.message, "");
    return true;
  };
}

function assertRejected(decision: CandidateChangeDecision, code: CandidateChangeRejectionCode): void {
  assert.equal(decision.status, "rejected");
  assert.ok(decision.rejection !== null);
  assert.equal(decision.rejection?.code, code);
  assert.ok((decision.rejection?.reasons.length ?? 0) > 0);
  assert.ok(Object.isFrozen(decision));
}

// ---------------------------------------------------------------------------
// 摘要与基线派生工具
// ---------------------------------------------------------------------------

test("digestFileContent 对原始字节计算 sha256 且与已知向量一致", () => {
  assert.equal(
    digestFileContent(""),
    "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    digestFileContent("abc"),
    "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("deriveWorkingBaselineDigest 对工作基线证据派生稳定摘要", () => {
  const evidence = { head_oid: HEAD_OID, dirty: false };
  assert.equal(deriveWorkingBaselineDigest(evidence), digestJson({ head_oid: HEAD_OID, dirty: false }));
  assert.equal(deriveWorkingBaselineDigest(evidence), deriveWorkingBaselineDigest({ ...evidence }));
  assert.notEqual(
    deriveWorkingBaselineDigest(evidence),
    deriveWorkingBaselineDigest({ head_oid: HEAD_OID, dirty: true }),
  );
});

// ---------------------------------------------------------------------------
// dry-run 正例：基线匹配时输出待确认裁决
// ---------------------------------------------------------------------------

test("基线一致的候选在 dry-run 下得到待确认裁决并绑定全部身份", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const candidate = buildCandidate(context, {
    targets: [
      {
        path: "docs/spec.md",
        kind: "update",
        before_digest: digestFileContent(ORIGINAL_CONTENT),
        after_digest: digestFileContent(UPDATED_CONTENT),
        after_content: UPDATED_CONTENT,
      },
      {
        path: "docs/new.md",
        kind: "create",
        before_digest: null,
        after_digest: digestFileContent("new file\n"),
        after_content: "new file\n",
      },
      {
        path: "docs/obsolete.md",
        kind: "delete",
        before_digest: digestFileContent("obsolete\n"),
        after_digest: null,
      },
    ],
  });

  const decision = evaluate(candidate, { context, nodes });

  assert.equal(decision.schema_version, "1.0");
  assert.equal(decision.record_type, "candidate-change-decision");
  assert.equal(decision.status, "ready-for-confirmation");
  assert.equal(decision.dry_run, true);
  assert.equal(decision.rejection, null);
  assert.equal(decision.evaluated_at, NOW);
  assert.equal(decision.candidate_change_id, "candidate-change-s1-5-w2-demo-001");
  assert.equal(decision.candidate_change_digest, digestJson(parseCandidateChange(candidate)));
  assert.equal(decision.project_context_digest, projectContextDigest(context));
  assert.ok(Object.isFrozen(decision));

  // dry-run 不得落盘：评估后工作树内容与基线完全一致。
  const probe = createMemoryProbe(nodes);
  assert.equal(probe.readFileUtf8("/ws/alpha/docs/spec.md"), ORIGINAL_CONTENT);
  assert.equal(probe.exists("/ws/alpha/docs/new.md"), false);
  assert.equal(probe.exists("/ws/alpha/docs/obsolete.md"), true);
});

// ---------------------------------------------------------------------------
// 版本冲突：WRITE_CONFLICT_REJECTED
// ---------------------------------------------------------------------------

test("目标文件内容相对声明基线变化时按版本冲突拒绝且不覆盖", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const decision = evaluate(buildCandidate(context), { context, nodes });
  // 基线一致 → 待确认（对照组）。
  assert.equal(decision.status, "ready-for-confirmation");

  const drifted = baseNodes();
  drifted["/ws/alpha/docs/spec.md"] = { kind: "file", content: "someone else edited it\n" };
  const driftedContext = buildContext(drifted);
  const driftedDecision = evaluate(buildCandidate(driftedContext), {
    context: driftedContext,
    nodes: drifted,
  });
  assertRejected(driftedDecision, "WRITE_CONFLICT_REJECTED");
  assert.match(driftedDecision.rejection?.reasons.join("\n") ?? "", /docs\/spec\.md/);
});

test("update 目标缺失或 create 目标已存在时同样按版本冲突拒绝", () => {
  const missingTarget = baseNodes();
  delete missingTarget["/ws/alpha/docs/spec.md"];
  const missingContext = buildContext(missingTarget);
  assertRejected(
    evaluate(buildCandidate(missingContext), { context: missingContext, nodes: missingTarget }),
    "WRITE_CONFLICT_REJECTED",
  );

  const createTaken = baseNodes();
  createTaken["/ws/alpha/docs/new.md"] = { kind: "file", content: "already here\n" };
  const takenContext = buildContext(createTaken);
  const candidate = buildCandidate(takenContext, {
    targets: [
      {
        path: "docs/new.md",
        kind: "create",
        before_digest: null,
        after_digest: digestFileContent("new file\n"),
        after_content: "new file\n",
      },
    ],
  });
  assertRejected(evaluate(candidate, { context: takenContext, nodes: createTaken }), "WRITE_CONFLICT_REJECTED");
});

test("delete 目标缺失时按版本冲突拒绝", () => {
  const nodes = baseNodes();
  delete nodes["/ws/alpha/docs/obsolete.md"];
  const context = buildContext(nodes);
  const candidate = buildCandidate(context, {
    targets: [
      {
        path: "docs/obsolete.md",
        kind: "delete",
        before_digest: digestFileContent("obsolete\n"),
        after_digest: null,
      },
    ],
  });
  assertRejected(evaluate(candidate, { context, nodes }), "WRITE_CONFLICT_REJECTED");
});

// ---------------------------------------------------------------------------
// 路径越界：WRITE_PATH_ESCAPE_BLOCKED
// ---------------------------------------------------------------------------

test("目标路径出现 ..、绝对路径、空段或反斜杠时按越界阻塞", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  for (const path of ["../escape.md", "/abs.md", "docs//spec.md", "docs\\spec.md", "docs/./spec.md", "docs/\u0000x.md", " ".repeat(3)]) {
    const candidate = buildCandidate(context, {
      targets: [
        {
          path,
          kind: "create",
          before_digest: null,
          after_digest: digestFileContent("x"),
          after_content: "x",
        },
      ],
    });
    const decision = evaluate(candidate, { context, nodes });
    assertRejected(decision, "WRITE_PATH_ESCAPE_BLOCKED");
  }
});

test("经过符号链接解析后落到项目根之外的目标按越界阻塞", () => {
  const nodes = baseNodes();
  nodes["/outside"] = { kind: "directory" };
  nodes["/ws/alpha/outside-link"] = { kind: "symlink", target: "/outside" };
  const context = buildContext(nodes);
  const candidate = buildCandidate(context, {
    targets: [
      {
        path: "outside-link/evil.md",
        kind: "create",
        before_digest: null,
        after_digest: digestFileContent("x"),
        after_content: "x",
      },
    ],
  });
  assertRejected(evaluate(candidate, { context, nodes }), "WRITE_PATH_ESCAPE_BLOCKED");
});

// ---------------------------------------------------------------------------
// 权限：WRITE_ACCESS_BLOCKED
// ---------------------------------------------------------------------------

test("父目录缺失、不可写或基线文件不可读时按权限阻塞", () => {
  const missingParent = baseNodes();
  const missingParentContext = buildContext(missingParent);
  const missingParentCandidate = buildCandidate(missingParentContext, {
    targets: [
      {
        path: "no-such-dir/file.md",
        kind: "create",
        before_digest: null,
        after_digest: digestFileContent("x"),
        after_content: "x",
      },
    ],
  });
  assertRejected(
    evaluate(missingParentCandidate, { context: missingParentContext, nodes: missingParent }),
    "WRITE_ACCESS_BLOCKED",
  );

  const readonlyParent = baseNodes();
  readonlyParent["/ws/alpha/docs"] = { kind: "directory", writable: false };
  const readonlyContext = buildContext(readonlyParent);
  assertRejected(
    evaluate(buildCandidate(readonlyContext), { context: readonlyContext, nodes: readonlyParent }),
    "WRITE_ACCESS_BLOCKED",
  );

  const unreadableBaseline = baseNodes();
  unreadableBaseline["/ws/alpha/docs/spec.md"] = { kind: "file", content: ORIGINAL_CONTENT, readable: false };
  const unreadableContext = buildContext(unreadableBaseline);
  assertRejected(
    evaluate(buildCandidate(unreadableContext), { context: unreadableContext, nodes: unreadableBaseline }),
    "WRITE_ACCESS_BLOCKED",
  );

  const readonlyFile = baseNodes();
  readonlyFile["/ws/alpha/docs/spec.md"] = { kind: "file", content: ORIGINAL_CONTENT, writable: false };
  const readonlyFileContext = buildContext(readonlyFile);
  assertRejected(
    evaluate(buildCandidate(readonlyFileContext), { context: readonlyFileContext, nodes: readonlyFile }),
    "WRITE_ACCESS_BLOCKED",
  );
});

// ---------------------------------------------------------------------------
// 绑定与过期：CANDIDATE_BINDING_MISMATCH / CANDIDATE_EXPIRED_REJECTED
// ---------------------------------------------------------------------------

test("候选绑定的项目上下文摘要与实际解析不一致时按绑定冲突拒绝", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const otherNodes = baseNodes();
  otherNodes["/ws/alpha/PROJECT_ROUTE_LOCK.md"] = {
    kind: "file",
    content: ROUTE_LOCK_CONTENT.replace("产品落地", "其他阶段"),
  };
  const otherContext = buildContext(otherNodes);

  const candidate = buildCandidate(context);
  const decision = evaluate(candidate, { context: otherContext, nodes: otherNodes });
  assertRejected(decision, "CANDIDATE_BINDING_MISMATCH");
});

test("工作基线证据与候选声明不一致时按绑定冲突拒绝", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);

  const driftedHead = evaluate(buildCandidate(context), {
    context,
    nodes,
    workingBaseline: { head_oid: "c".repeat(40), dirty: false },
  });
  assertRejected(driftedHead, "CANDIDATE_BINDING_MISMATCH");

  const driftedDirty = evaluate(buildCandidate(context), {
    context,
    nodes,
    workingBaseline: { head_oid: HEAD_OID, dirty: true },
  });
  assertRejected(driftedDirty, "CANDIDATE_BINDING_MISMATCH");

  const candidate = buildCandidate(context, {
    working_baseline: { baseline_digest: `sha256:${"f".repeat(64)}` },
  });
  assertRejected(evaluate(candidate, { context, nodes }), "CANDIDATE_BINDING_MISMATCH");
});

test("候选过期（含边界相等）时按过期拒绝且优先于目标级检查", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);

  const expired = evaluate(buildCandidate(context, { expires_at: "2026-08-14T00:00:00Z" }), {
    context,
    nodes,
  });
  assertRejected(expired, "CANDIDATE_EXPIRED_REJECTED");

  const boundary = evaluate(buildCandidate(context), { context, nodes, now: EXPIRES_AT });
  assertRejected(boundary, "CANDIDATE_EXPIRED_REJECTED");

  // 即便目标同时存在版本冲突，过期裁决仍然优先，保证恢复入口指向重新生成候选。
  const drifted = baseNodes();
  drifted["/ws/alpha/docs/spec.md"] = { kind: "file", content: "drifted\n" };
  const driftedContext = buildContext(drifted);
  const driftedCandidate = buildCandidate(driftedContext, { expires_at: "2026-08-14T00:00:00Z" });
  assertRejected(
    evaluate(driftedCandidate, { context: driftedContext, nodes: drifted }),
    "CANDIDATE_EXPIRED_REJECTED",
  );
});

// ---------------------------------------------------------------------------
// 拒绝优先级：冲突 > 权限 > 越界
// ---------------------------------------------------------------------------

test("多目标同时失败时按固定优先级汇报且理由只包含对应类别", () => {
  const nodes = baseNodes();
  nodes["/ws/alpha/locked"] = { kind: "directory", writable: false };
  const context = buildContext(nodes);
  const candidate = buildCandidate(context, {
    targets: [
      {
        path: "docs/spec.md",
        kind: "update",
        before_digest: digestFileContent("not the real baseline\n"),
        after_digest: digestFileContent(UPDATED_CONTENT),
        after_content: UPDATED_CONTENT,
      },
      {
        path: "locked/new.md",
        kind: "create",
        before_digest: null,
        after_digest: digestFileContent("x"),
        after_content: "x",
      },
    ],
  });
  const decision = evaluate(candidate, { context, nodes });
  assertRejected(decision, "WRITE_CONFLICT_REJECTED");
  const reasons = decision.rejection?.reasons.join("\n") ?? "";
  assert.match(reasons, /docs\/spec\.md/);
  assert.doesNotMatch(reasons, /locked\/new\.md/);
});

// ---------------------------------------------------------------------------
// 候选契约：未知字段、敏感字段、敏感内容、自洽性 fail closed（抛出）
// ---------------------------------------------------------------------------

test("候选出现未知字段、敏感字段或敏感内容时 fail closed", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);

  assert.throws(
    () => evaluate(buildCandidate(context, { extra: { unknown_field: 1 } }), { context, nodes }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );

  assert.throws(
    () =>
      evaluate(buildCandidate(context, { extra: { session_token: "leak" } }), { context, nodes }),
    expectCandidateChangeError("SENSITIVE_CONTENT_DETECTED"),
  );

  const sensitiveContent = buildCandidate(context);
  sensitiveContent.impact_summary = "-----BEGIN RSA PRIVATE KEY----- abcdef";
  assert.throws(
    () => evaluate(sensitiveContent, { context, nodes }),
    expectCandidateChangeError("SENSITIVE_CONTENT_DETECTED"),
  );
});

test("候选结构或自洽性违反契约时抛出 INVALID_CANDIDATE_CHANGE", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);

  const cases: unknown[] = [
    // 未知目标字段
    buildCandidate(context, {
      targets: [
        {
          path: "docs/spec.md",
          kind: "update",
          before_digest: digestFileContent(ORIGINAL_CONTENT),
          after_digest: digestFileContent(UPDATED_CONTENT),
          after_content: UPDATED_CONTENT,
          surprise: true,
        },
      ],
    }),
    // 空目标列表
    buildCandidate(context, { targets: [] }),
    // create 声明了 before_digest
    buildCandidate(context, {
      targets: [
        {
          path: "docs/new.md",
          kind: "create",
          before_digest: digestFileContent("x"),
          after_digest: digestFileContent("x"),
          after_content: "x",
        },
      ],
    }),
    // update 缺少 before_digest
    buildCandidate(context, {
      targets: [
        {
          path: "docs/spec.md",
          kind: "update",
          before_digest: null,
          after_digest: digestFileContent(UPDATED_CONTENT),
          after_content: UPDATED_CONTENT,
        },
      ],
    }),
    // update 缺少 after_content
    buildCandidate(context, {
      targets: [
        {
          path: "docs/spec.md",
          kind: "update",
          before_digest: digestFileContent(ORIGINAL_CONTENT),
          after_digest: digestFileContent(UPDATED_CONTENT),
        },
      ],
    }),
    // delete 携带 after_digest / after_content
    buildCandidate(context, {
      targets: [
        {
          path: "docs/obsolete.md",
          kind: "delete",
          before_digest: digestFileContent("obsolete\n"),
          after_digest: digestFileContent("x"),
        },
      ],
    }),
    buildCandidate(context, {
      targets: [
        {
          path: "docs/obsolete.md",
          kind: "delete",
          before_digest: digestFileContent("obsolete\n"),
          after_digest: null,
          after_content: "x",
        },
      ],
    }),
    // after_digest 与 after_content 不一致
    buildCandidate(context, {
      targets: [
        {
          path: "docs/new.md",
          kind: "create",
          before_digest: null,
          after_digest: digestFileContent("something else"),
          after_content: "x",
        },
      ],
    }),
    // 非法 expires_at
    buildCandidate(context, { expires_at: "tomorrow" }),
    // 非法 candidate_change_id
    { ...buildCandidate(context), candidate_change_id: "Candidate_Bad" },
    // 非法 formal_baseline
    buildCandidate(context, { project: { formal_baseline: "not-an-oid" } }),
  ];

  for (const candidate of cases) {
    assert.throws(
      () => evaluate(candidate, { context, nodes }),
      expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
    );
  }
});

test("dry_run 不为 true 或评估输入不完整时 fail closed", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const candidate = buildCandidate(context);

  assert.throws(
    () => evaluate(candidate, { context, nodes, dryRun: false }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
  assert.throws(
    () => evaluate(candidate, { context, nodes, now: "2026/08/15" }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
  assert.throws(
    () =>
      evaluateCandidateChange(
        {
          candidate,
          project_context: context,
          working_baseline: { head_oid: "short", dirty: false },
          now: NOW,
          dry_run: true,
        },
        createMemoryProbe(nodes),
      ),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
});

// ---------------------------------------------------------------------------
// 回读契约：parseCandidateChange / parseCandidateChangeDecision
// ---------------------------------------------------------------------------

test("parseCandidateChange 回读合法候选并拒绝篡改", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const candidate = buildCandidate(context);
  const parsed: CandidateChange = parseCandidateChange(candidate);
  assert.equal(parsed.candidate_change_id, "candidate-change-s1-5-w2-demo-001");
  assert.ok(Object.isFrozen(parsed));
  assert.equal(digestJson(parsed), digestJson(parseCandidateChange(JSON.parse(JSON.stringify(candidate)))));

  assert.throws(
    () => parseCandidateChange({ ...candidate, schema_version: "2.0" }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
});

test("parseCandidateChangeDecision 回读裁决并拒绝状态、字段与理由篡改", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const ready = evaluate(buildCandidate(context), { context, nodes });
  const roundTrip = parseCandidateChangeDecision(JSON.parse(JSON.stringify(ready)));
  assert.equal(roundTrip.candidate_change_digest, ready.candidate_change_digest);

  assert.throws(
    () => parseCandidateChangeDecision({ ...ready, status: "accepted" }),
    /decision|status|invalid/i,
  );
  assert.throws(
    () => parseCandidateChangeDecision({ ...ready, unknown_field: 1 }),
    /decision|field|invalid/i,
  );
  assert.throws(
    () => parseCandidateChangeDecision({ ...ready, dry_run: false }),
    /decision|dry/i,
  );

  const rejected = evaluate(buildCandidate(context, { expires_at: "2026-08-14T00:00:00Z" }), { context, nodes });
  const rejectedRoundTrip = parseCandidateChangeDecision(JSON.parse(JSON.stringify(rejected)));
  assert.equal(rejectedRoundTrip.rejection?.code, "CANDIDATE_EXPIRED_REJECTED");

  assert.throws(
    () => parseCandidateChangeDecision({ ...rejected, rejection: { code: "CANDIDATE_EXPIRED_REJECTED", reasons: [] } }),
    /decision|reason/i,
  );
  assert.throws(
    () => parseCandidateChangeDecision({ ...ready, rejection: { code: "WRITE_CONFLICT_REJECTED", reasons: ["x"] } }),
    /decision|rejection|status/i,
  );
});

test("裁决 JSON 序列化字段集恒定且失败不降级", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const ready = evaluate(buildCandidate(context), { context, nodes });
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(ready))).sort(), [
    "candidate_change_digest",
    "candidate_change_id",
    "dry_run",
    "evaluated_at",
    "project_context_digest",
    "record_type",
    "rejection",
    "schema_version",
    "status",
  ]);

  // 被拒绝的裁决绝不降级为更弱状态。
  const drifted = baseNodes();
  drifted["/ws/alpha/docs/spec.md"] = { kind: "file", content: "drifted\n" };
  const driftedContext = buildContext(drifted);
  const rejected = evaluate(buildCandidate(driftedContext), { context: driftedContext, nodes: drifted });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.dry_run, true);
});

// ---------------------------------------------------------------------------
// 补充分支覆盖：契约工具负例、决策解析逐项篡改、超长路径、非 JSON 评估输入
// ---------------------------------------------------------------------------

test("digestFileContent 与 deriveWorkingBaselineDigest 对非法输入 fail closed", () => {
  assert.throws(
    () => digestFileContent(42 as unknown as string),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => deriveWorkingBaselineDigest(cyclic), expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"));
  assert.throws(
    () => deriveWorkingBaselineDigest(["head_oid"]),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
  assert.throws(
    () => deriveWorkingBaselineDigest({ head_oid: HEAD_OID }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
  assert.throws(
    () => deriveWorkingBaselineDigest({ head_oid: HEAD_OID, dirty: "yes" }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
});

test("评估输入非 JSON 或候选非 JSON 时 fail closed", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(
    () => evaluate(cyclic, { context, nodes }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
  assert.throws(
    () => evaluate(buildCandidate(context, { targets: cyclic as never }), { context, nodes }),
    expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
  );
});

test("create 缺 after_content、update 摘要错配与 delete 缺基线均违反自洽性", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const cases: unknown[] = [
    buildCandidate(context, {
      targets: [
        { path: "docs/new.md", kind: "create", before_digest: null, after_digest: digestFileContent("x") },
      ],
    }),
    buildCandidate(context, {
      targets: [
        {
          path: "docs/spec.md",
          kind: "update",
          before_digest: digestFileContent(ORIGINAL_CONTENT),
          after_digest: digestFileContent("something else"),
          after_content: UPDATED_CONTENT,
        },
      ],
    }),
    buildCandidate(context, {
      targets: [
        { path: "docs/obsolete.md", kind: "delete", before_digest: null, after_digest: null },
      ],
    }),
  ];
  for (const candidate of cases) {
    assert.throws(
      () => evaluate(candidate, { context, nodes }),
      expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"),
    );
  }
});

test("超长目标路径按越界阻塞", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const candidate = buildCandidate(context, {
    targets: [
      {
        path: `${"a".repeat(513)}.md`,
        kind: "create",
        before_digest: null,
        after_digest: digestFileContent("x"),
        after_content: "x",
      },
    ],
  });
  assertRejected(evaluate(candidate, { context, nodes }), "WRITE_PATH_ESCAPE_BLOCKED");
});

test("parseCandidateChangeDecision 对结构变体逐项 fail closed", () => {
  const nodes = baseNodes();
  const context = buildContext(nodes);
  const ready = evaluate(buildCandidate(context), { context, nodes });
  const rejected = evaluate(buildCandidate(context, { expires_at: "2026-08-14T00:00:00Z" }), {
    context,
    nodes,
  });

  const withoutEvaluatedAt = { ...ready } as Record<string, unknown>;
  delete withoutEvaluatedAt.evaluated_at;

  const cases: unknown[] = [
    ["decision-as-array"],
    { ...ready, record_type: "other-record" },
    { ...ready, candidate_change_id: "Bad_ID" },
    { ...ready, candidate_change_digest: "sha256:not-hex" },
    { ...ready, project_context_digest: "sha256:zz" },
    { ...ready, evaluated_at: "2026-08-15" },
    withoutEvaluatedAt,
    { ...rejected, rejection: null },
    { ...rejected, rejection: { code: "CANDIDATE_EXPIRED_REJECTED", reasons: ["ok"], extra: 1 } },
    { ...rejected, rejection: { code: "NOT_A_CODE", reasons: ["ok"] } },
    { ...rejected, rejection: { code: "CANDIDATE_EXPIRED_REJECTED", reasons: [123] } },
    { ...rejected, rejection: { code: "CANDIDATE_EXPIRED_REJECTED", reasons: [""] } },
  ];
  for (const value of cases) {
    assert.throws(() => parseCandidateChangeDecision(value), expectCandidateChangeError("INVALID_CANDIDATE_CHANGE"));
  }
});
