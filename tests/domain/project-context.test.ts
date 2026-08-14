import assert from "node:assert/strict";
import test from "node:test";

import { digestJson } from "../../src/domain/content-digest.ts";
import {
  ProjectContextError,
  formatProjectContextConfirmation,
  isWithinPath,
  normalizeAbsolutePath,
  parseProjectContext,
  projectContextDigest,
  resolveProjectContext,
  type ProjectContext,
  type ProjectRootProbe,
} from "../../src/domain/project-context.ts";

// ---------------------------------------------------------------------------
// 内存探针：W2 领域层通过端口注入获得文件系统证据，测试用确定性假文件系统
// 驱动唯一根解析的全部分支（同名/嵌套/符号链接/越界/权限/缺路线锁）。
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

const ROUTE_LOCK_CONTENT = [
  "# PROJECT_ROUTE_LOCK",
  "",
  "## 2. 当前阶段",
  "",
  "- 生命周期阶段：S5 开发落地",
  "- 里程碑编号：P5",
  "- 阶段名称：产品落地",
  "",
].join("\n");

function projectNodes(root: string, routeLock: string = ROUTE_LOCK_CONTENT): Record<string, MemoryNode> {
  return {
    [root]: { kind: "directory" },
    [`${root}/PROJECT_ROUTE_LOCK.md`]: { kind: "file", content: routeLock },
    [`${root}/.codex`]: { kind: "directory" },
    [`${root}/.codex/operations-log.md`]: { kind: "file", content: "# ops\n" },
    [`${root}/.codex/verification-report.md`]: { kind: "file", content: "# report\n" },
  };
}

function expectProjectContextError(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof ProjectContextError, `expected ProjectContextError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.notEqual(error.message, "");
    return true;
  };
}

// ---------------------------------------------------------------------------
// 路径工具
// ---------------------------------------------------------------------------

test("normalizeAbsolutePath 词法规范化绝对路径并拒绝相对、空与非法输入", () => {
  assert.equal(normalizeAbsolutePath("/a/./b/../c//"), "/a/c");
  assert.equal(normalizeAbsolutePath("/"), "/");
  for (const invalid of ["relative/path", "", "  ", "/a/\u0000b", "/a/ /b"]) {
    assert.throws(() => normalizeAbsolutePath(invalid), /absolute|path|路径/i);
  }
});

test("isWithinPath 按路径段前缀判断包含关系", () => {
  assert.equal(isWithinPath("/ws/alpha", "/ws/alpha"), true);
  assert.equal(isWithinPath("/ws/alpha", "/ws/alpha/docs/a.md"), true);
  assert.equal(isWithinPath("/ws/alpha", "/ws/alpha-2"), false);
  assert.equal(isWithinPath("/ws/alpha", "/ws"), false);
  assert.equal(isWithinPath("/ws/alpha", "/other"), false);
});

// ---------------------------------------------------------------------------
// 唯一根与阶段解析（正例链）
// ---------------------------------------------------------------------------

test("唯一候选项目根解析出规范根、路线锁摘要、阶段与留痕标志", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  const context = resolveProjectContext(
    { workspace_roots: ["/ws/alpha"], requested_project: "alpha" },
    probe,
  );

  assert.equal(context.schema_version, "1.0");
  assert.equal(context.record_type, "project-context");
  assert.equal(context.project_name, "alpha");
  assert.equal(context.project_root, "/ws/alpha");
  assert.equal(context.workspace_root, "/ws/alpha");
  assert.equal(context.route_lock.path, "/ws/alpha/PROJECT_ROUTE_LOCK.md");
  assert.equal(context.stage.lifecycle_stage, "S5 开发落地");
  assert.equal(context.stage.stage_name, "产品落地");
  assert.equal(context.stage.milestone_number, "P5");
  assert.equal(context.stage.stage_source, "PROJECT_ROUTE_LOCK.md");
  assert.equal(context.trace.operations_log_present, true);
  assert.equal(context.trace.verification_report_present, true);
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.stage));
  assert.ok(Object.isFrozen(context.confirmation_view));

  // 身份摘要由身份投影派生，重复解析必须恒定；全记录摘要同样恒定。
  const again = resolveProjectContext(
    { workspace_roots: ["/ws/alpha"], requested_project: "alpha" },
    createMemoryProbe(projectNodes("/ws/alpha")),
  );
  assert.equal(context.project_identity_digest, again.project_identity_digest);
  assert.equal(projectContextDigest(context), projectContextDigest(again));

  // S3 §5.3 项目上下文确认块四行齐备。
  const block = formatProjectContextConfirmation(context);
  assert.match(block, /当前项目：alpha/);
  assert.match(block, /项目根：\/ws\/alpha/);
  assert.match(block, /当前阶段：S5 开发落地（产品落地）/);
  assert.match(block, /本次动作：未声明写入动作/);
  assert.equal(context.confirmation_view.current_stage, "S5 开发落地（产品落地）");
});

test("路径请求指向项目根内部时解析到所属项目根且动作摘要进入确认块", () => {
  const nodes = projectNodes("/ws/alpha");
  nodes["/ws/alpha/docs"] = { kind: "directory" };
  const probe = createMemoryProbe(nodes);
  const context = resolveProjectContext(
    {
      workspace_roots: ["/ws/alpha"],
      requested_project: "/ws/alpha/docs",
      action_summary: "修改 S3 交互真源",
    },
    probe,
  );
  assert.equal(context.project_root, "/ws/alpha");
  assert.equal(context.confirmation_view.action, "修改 S3 交互真源");
});

test("显式规范根选择可恢复符号链接、同名与嵌套阻塞并保留其余门禁", () => {
  const nodes: Record<string, MemoryNode> = {
    ...projectNodes("/ws/real"),
    "/ws/link": { kind: "symlink", target: "/ws/real" },
  };
  const probe = createMemoryProbe(nodes);

  // 未显式选择时符号链接根必须阻塞，并给出规范化路径作为恢复入口。
  let symlinkError: unknown;
  try {
    resolveProjectContext({ workspace_roots: ["/ws/link"], requested_project: "link" }, probe);
  } catch (error) {
    symlinkError = error;
  }
  assert.ok(symlinkError instanceof ProjectContextError);
  assert.equal(symlinkError.code, "PROJECT_SYMLINK_BLOCKED");
  assert.match(symlinkError.message, /\/ws\/real/);

  // 显式选择规范根后解析成功。
  const context = resolveProjectContext(
    {
      workspace_roots: ["/ws/link"],
      requested_project: "link",
      explicit_canonical_root: "/ws/real",
    },
    probe,
  );
  assert.equal(context.project_root, "/ws/real");

  // 显式选择落在允许工作区之外仍然按越界阻塞。
  assert.throws(
    () =>
      resolveProjectContext(
        {
          workspace_roots: ["/ws/link"],
          requested_project: "link",
          explicit_canonical_root: "/outside/other",
        },
        probe,
      ),
    expectProjectContextError("PROJECT_PATH_ESCAPE_BLOCKED"),
  );
});

// ---------------------------------------------------------------------------
// 阻塞分支：同名 / 嵌套 / 越界 / 权限 / 缺路线锁 / 缺阶段真源
// ---------------------------------------------------------------------------

test("同名项目候选多于一个时进入项目不明确阻塞", () => {
  const probe = createMemoryProbe({
    ...projectNodes("/ws/a/demo"),
    ...projectNodes("/ws/b/demo"),
  });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/a/demo", "/ws/b/demo"], requested_project: "demo" }, probe),
    expectProjectContextError("PROJECT_AMBIGUOUS_BLOCKED"),
  );
});

test("名称无法匹配任何工作区根时进入项目不明确阻塞", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "ghost" }, probe),
    expectProjectContextError("PROJECT_AMBIGUOUS_BLOCKED"),
  );
});

test("相对路径请求无法唯一解析时 fail closed", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "./alpha" }, probe),
    expectProjectContextError("PROJECT_AMBIGUOUS_BLOCKED"),
  );
});

test("嵌套候选项目根必须阻塞并要求显式选择", () => {
  const probe = createMemoryProbe({
    ...projectNodes("/ws/repo"),
    ...projectNodes("/ws/repo/inner"),
  });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/repo", "/ws/repo/inner"], requested_project: "repo" }, probe),
    expectProjectContextError("PROJECT_ROOT_NESTED_BLOCKED"),
  );
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/repo", "/ws/repo/inner"], requested_project: "inner" }, probe),
    expectProjectContextError("PROJECT_ROOT_NESTED_BLOCKED"),
  );
});

test("路径请求落在允许工作区之外按越界阻塞", () => {
  const probe = createMemoryProbe({
    ...projectNodes("/ws/alpha"),
    ...projectNodes("/elsewhere/beta"),
  });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "/elsewhere/beta" }, probe),
    expectProjectContextError("PROJECT_PATH_ESCAPE_BLOCKED"),
  );
});

test("项目根不可读、不可写或不是目录时按权限阻塞", () => {
  const unreadable = createMemoryProbe({
    ...projectNodes("/ws/alpha"),
    "/ws/alpha": { kind: "directory", readable: false },
  });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "alpha" }, unreadable),
    expectProjectContextError("PROJECT_ACCESS_BLOCKED"),
  );

  const readonly = createMemoryProbe({
    ...projectNodes("/ws/alpha"),
    "/ws/alpha": { kind: "directory", writable: false },
  });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "alpha" }, readonly),
    expectProjectContextError("PROJECT_ACCESS_BLOCKED"),
  );

  const notDirectory = createMemoryProbe({
    "/ws/alpha": { kind: "file", content: "x" },
  });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "alpha" }, notDirectory),
    expectProjectContextError("PROJECT_ACCESS_BLOCKED"),
  );
});

test("路线锁存在但不可读时按权限阻塞，缺失时按路线锁缺失阻塞", () => {
  const unreadableLock = createMemoryProbe({
    ...projectNodes("/ws/alpha"),
    "/ws/alpha/PROJECT_ROUTE_LOCK.md": { kind: "file", content: ROUTE_LOCK_CONTENT, readable: false },
  });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "alpha" }, unreadableLock),
    expectProjectContextError("PROJECT_ACCESS_BLOCKED"),
  );

  const missingLock = createMemoryProbe({ "/ws/alpha": { kind: "directory" } });
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "alpha" }, missingLock),
    expectProjectContextError("PROJECT_ROUTE_LOCK_MISSING"),
  );
});

test("路线锁缺少生命周期阶段或阶段名称时按阶段真源缺失阻塞", () => {
  const withoutLifecycle = createMemoryProbe(
    projectNodes("/ws/alpha", "# lock\n\n- 阶段名称：产品落地\n"),
  );
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "alpha" }, withoutLifecycle),
    expectProjectContextError("PROJECT_STAGE_SOURCE_MISSING"),
  );

  const withoutName = createMemoryProbe(
    projectNodes("/ws/alpha", "# lock\n\n- 生命周期阶段：S5 开发落地\n"),
  );
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "alpha" }, withoutName),
    expectProjectContextError("PROJECT_STAGE_SOURCE_MISSING"),
  );
});

// ---------------------------------------------------------------------------
// 输入契约：未知字段、敏感内容、结构错误 fail closed
// ---------------------------------------------------------------------------

test("解析输入出现未知字段、敏感内容或结构错误时 fail closed", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));

  assert.throws(
    () =>
      resolveProjectContext(
        { workspace_roots: ["/ws/alpha"], requested_project: "alpha", extra_field: 1 },
        probe,
      ),
    expectProjectContextError("INVALID_PROJECT_CONTEXT"),
  );

  assert.throws(
    () =>
      resolveProjectContext(
        { workspace_roots: ["/ws/alpha"], requested_project: "token=abcd1234abcd1234" },
        probe,
      ),
    expectProjectContextError("SENSITIVE_CONTENT_DETECTED"),
  );

  assert.throws(
    () => resolveProjectContext({ workspace_roots: [], requested_project: "alpha" }, probe),
    expectProjectContextError("INVALID_PROJECT_CONTEXT"),
  );

  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha", "/ws/alpha"], requested_project: "alpha" }, probe),
    expectProjectContextError("INVALID_PROJECT_CONTEXT"),
  );

  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["relative/root"], requested_project: "alpha" }, probe),
    expectProjectContextError("INVALID_PROJECT_CONTEXT"),
  );

  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "" }, probe),
    expectProjectContextError("INVALID_PROJECT_CONTEXT"),
  );

  assert.throws(() => resolveProjectContext("alpha", probe), expectProjectContextError("INVALID_PROJECT_CONTEXT"));
});

// ---------------------------------------------------------------------------
// parseProjectContext 回读契约（供 W4 机器回执使用）
// ---------------------------------------------------------------------------

test("parseProjectContext 回读合法记录并拒绝篡改、未知字段与错误版本", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  const context = resolveProjectContext(
    { workspace_roots: ["/ws/alpha"], requested_project: "alpha" },
    probe,
  );
  const roundTrip = parseProjectContext(JSON.parse(JSON.stringify(context)));
  assert.equal(projectContextDigest(roundTrip), projectContextDigest(context));

  assert.throws(() => parseProjectContext({ ...context, schema_version: "2.0" }), /version|record|invalid/i);
  assert.throws(() => parseProjectContext({ ...context, unknown_field: true }), /field|record|invalid/i);

  const tamperedIdentity = { ...context, project_identity_digest: `sha256:${"0".repeat(64)}` };
  assert.throws(() => parseProjectContext(JSON.parse(JSON.stringify(tamperedIdentity))), /digest|identity/i);

  const tamperedRouteLock = {
    ...context,
    route_lock: { ...context.route_lock, path: "/other/PROJECT_ROUTE_LOCK.md" },
  };
  // 篡改 route_lock.path 会同时破坏身份投影，任一 fail closed 检查命中均合法。
  assert.throws(
    () => parseProjectContext(JSON.parse(JSON.stringify(tamperedRouteLock))),
    /route|lock|path|identity|digest/i,
  );
});

test("缺失留痕文件时 trace 标志为 false 且不阻断解析", () => {
  const nodes = projectNodes("/ws/alpha");
  delete nodes["/ws/alpha/.codex/operations-log.md"];
  delete nodes["/ws/alpha/.codex/verification-report.md"];
  const context = resolveProjectContext(
    { workspace_roots: ["/ws/alpha"], requested_project: "alpha" },
    createMemoryProbe(nodes),
  );
  assert.equal(context.trace.operations_log_present, false);
  assert.equal(context.trace.verification_report_present, false);
});

test("身份摘要投影仅包含身份字段且对阶段/留痕变化不敏感之外的字段敏感", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  const context = resolveProjectContext(
    { workspace_roots: ["/ws/alpha"], requested_project: "alpha" },
    probe,
  );
  const expected = digestJson({
    project_name: "alpha",
    project_root: "/ws/alpha",
    workspace_root: "/ws/alpha",
    route_lock: context.route_lock,
  });
  assert.equal(context.project_identity_digest, expected);
});

test("resolveProjectContext 返回的上下文可被 JSON 序列化且字段集恒定", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  const context: ProjectContext = resolveProjectContext(
    { workspace_roots: ["/ws/alpha"], requested_project: "alpha" },
    probe,
  );
  const serialized = JSON.parse(JSON.stringify(context)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(serialized).sort(), [
    "confirmation_view",
    "project_identity_digest",
    "project_name",
    "project_root",
    "record_type",
    "route_lock",
    "schema_version",
    "stage",
    "trace",
    "workspace_root",
  ]);
});

// ---------------------------------------------------------------------------
// 补充分支覆盖：根包含、非 JSON 输入、缺必填、不可解析工作区根、极端符号链接
// ---------------------------------------------------------------------------

test("isWithinPath 以文件系统根为根时包含一切绝对路径", () => {
  assert.equal(isWithinPath("/", "/anything"), true);
  assert.equal(isWithinPath("/", "/"), true);
});

test("非 JSON 输入与缺必填字段 fail closed", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(
    () => resolveProjectContext(cyclic, probe),
    expectProjectContextError("INVALID_PROJECT_CONTEXT"),
  );
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"] }, probe),
    expectProjectContextError("INVALID_PROJECT_CONTEXT"),
  );
});

test("探针中不可解析的工作区根不参与候选", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/ghost"], requested_project: "ghost" }, probe),
    expectProjectContextError("PROJECT_AMBIGUOUS_BLOCKED"),
  );
});

test("路径模式包含不安全字符时无法规范化并按项目不明确阻塞", () => {
  const probe = createMemoryProbe(projectNodes("/ws/alpha"));
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/alpha"], requested_project: "/ws/a b" }, probe),
    expectProjectContextError("PROJECT_AMBIGUOUS_BLOCKED"),
  );
});

test("规范化结果为文件系统根的符号链接工作区根被排除", () => {
  const nodes: Record<string, MemoryNode> = {
    ...projectNodes("/ws/alpha"),
    "/": { kind: "directory" },
    "/ws/badlink": { kind: "symlink", target: "/" },
  };
  const probe = createMemoryProbe(nodes);
  assert.throws(
    () => resolveProjectContext({ workspace_roots: ["/ws/badlink"], requested_project: "badlink" }, probe),
    expectProjectContextError("PROJECT_AMBIGUOUS_BLOCKED"),
  );
});
