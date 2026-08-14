import { createHash } from "node:crypto";

import { Ajv, type ValidateFunction } from "ajv";

import projectContextSchema from "../../schemas/v1/project-context.schema.json" with { type: "json" };
import { snapshotJsonValue, type JsonValue } from "./canonical-json.ts";
import { digestJson, type Sha256Digest } from "./content-digest.ts";
import { assertNoSensitiveContent, assertNoSensitiveFields } from "./sensitive-fields.ts";
import { isPlainRecord } from "./value-guards.ts";

// S1.5-W2 项目上下文领域契约（S3 §5）：
// - 项目标识必须解析到唯一规范绝对项目根；同名、嵌套、符号链接、越界、权限、
//   缺路线锁、缺阶段真源全部 fail closed。
// - 阶段识别只信任路线锁文本证据，绝不依赖聊天上下文猜测。
// - 本模块是领域层，文件系统证据通过 ProjectRootProbe 端口注入；
//   W3 的 src/adapters/node/fs-probe.ts 负责实现该端口。

export type ProjectContextErrorCode =
  | "INVALID_PROJECT_CONTEXT"
  | "SENSITIVE_CONTENT_DETECTED"
  | "PROJECT_AMBIGUOUS_BLOCKED"
  | "PROJECT_ROOT_NESTED_BLOCKED"
  | "PROJECT_SYMLINK_BLOCKED"
  | "PROJECT_PATH_ESCAPE_BLOCKED"
  | "PROJECT_ACCESS_BLOCKED"
  | "PROJECT_ROUTE_LOCK_MISSING"
  | "PROJECT_STAGE_SOURCE_MISSING";

export class ProjectContextError extends Error {
  readonly code: ProjectContextErrorCode;

  constructor(code: ProjectContextErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(code: ProjectContextErrorCode, message: string): never {
  throw new ProjectContextError(code, message);
}

// 端口：宿主文件系统证据。领域层不直接触盘；所有探针语义必须确定性。
export interface ProjectRootProbe {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  isSymbolicLink(path: string): boolean;
  isReadable(path: string): boolean;
  isWritable(path: string): boolean;
  // 返回规范化绝对路径（解析全部符号链接）；路径不存在或不可解析时抛出。
  realpath(path: string): string;
  // 读取 UTF-8 文本；缺失或不可读时抛出。
  readFileUtf8(path: string): string;
}

export interface ProjectResolutionInput {
  readonly workspace_roots: readonly string[];
  readonly requested_project: string;
  // 用户显式选择的规范绝对根（S3 §5.1 同名/符号链接场景的恢复入口）。
  readonly explicit_canonical_root?: string;
  // S3 §5.3 确认块中的“本次动作”。
  readonly action_summary?: string;
}

export interface ProjectContextStage {
  readonly lifecycle_stage: string;
  readonly stage_name: string;
  readonly milestone_number: string | null;
  readonly stage_source: "PROJECT_ROUTE_LOCK.md";
}

export interface ProjectContextConfirmationView {
  readonly project: string;
  readonly project_root: string;
  readonly current_stage: string;
  readonly action: string;
}

export interface ProjectContext {
  readonly schema_version: "1.0";
  readonly record_type: "project-context";
  readonly project_name: string;
  readonly project_root: string;
  readonly workspace_root: string;
  readonly project_identity_digest: Sha256Digest;
  readonly route_lock: {
    readonly path: string;
    readonly digest: Sha256Digest;
  };
  readonly stage: ProjectContextStage;
  readonly trace: {
    readonly operations_log_present: boolean;
    readonly verification_report_present: boolean;
  };
  readonly confirmation_view: ProjectContextConfirmationView;
}

const UNSAFE_SEGMENT_PATTERN = /[\s\u0000-\u001f\u007f\\]/;

function assertSafeSegment(segment: string, context: string): void {
  if (UNSAFE_SEGMENT_PATTERN.test(segment)) {
    throw new TypeError(`Unsafe path segment in ${context}`);
  }
}

// 词法规范化绝对路径：折叠冗余分隔符并解析 "." / ".."，不触碰文件系统。
export function normalizeAbsolutePath(path: unknown): string {
  if (typeof path !== "string" || path.length === 0 || !path.startsWith("/")) {
    throw new TypeError("Absolute path is required");
  }
  if (path.includes("\u0000")) {
    throw new TypeError("Absolute path must not contain NUL");
  }
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment.length === 0) {
      continue;
    }
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    assertSafeSegment(segment, path);
    segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

// 按路径段前缀判断包含关系（含相等）。
export function isWithinPath(root: string, candidate: string): boolean {
  if (root === "/") {
    return candidate.startsWith("/");
  }
  return candidate === root || candidate.startsWith(`${root}/`);
}

function basenameOf(canonicalPath: string): string {
  const segments = canonicalPath.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? "";
}

// 对原始 UTF-8 文本字节计算 sha256（非 JCS）；用于路线锁与文件内容基线。
export function digestText(value: string): Sha256Digest {
  const digest = createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
  return `sha256:${digest}`;
}

const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
const validateProjectContext: ValidateFunction = ajv.compile(projectContextSchema);

const RESOLUTION_INPUT_FIELDS = new Set([
  "workspace_roots",
  "requested_project",
  "explicit_canonical_root",
  "action_summary",
]);

interface CanonicalWorkspaceRoot {
  readonly declared: string;
  readonly canonical: string;
}

function extractRouteLockField(content: string, label: string): string | null {
  const pattern = new RegExp(`^-\\s*${label}\\s*[:：]\\s*(.+?)\\s*$`, "m");
  const match = pattern.exec(content);
  const value = match?.[1]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function parseStage(routeLockContent: string): ProjectContextStage {
  const lifecycleStage = extractRouteLockField(routeLockContent, "生命周期阶段");
  const stageName = extractRouteLockField(routeLockContent, "阶段名称");
  if (lifecycleStage === null || stageName === null) {
    fail("PROJECT_STAGE_SOURCE_MISSING", "路线锁缺少当前阶段识别字段（生命周期阶段/阶段名称）");
  }
  const milestoneNumber = extractRouteLockField(routeLockContent, "里程碑编号");
  return Object.freeze({
    lifecycle_stage: lifecycleStage,
    stage_name: stageName,
    milestone_number: milestoneNumber,
    stage_source: "PROJECT_ROUTE_LOCK.md" as const,
  });
}

function assertResolutionInput(input: unknown): {
  workspaceRoots: readonly string[];
  requestedProject: string;
  explicitCanonicalRoot?: string;
  actionSummary?: string;
} {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(input);
  } catch {
    fail("INVALID_PROJECT_CONTEXT", "Project resolution input is not JSON data");
  }
  try {
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Project resolution input contains sensitive content");
  }
  if (!isPlainRecord(snapshot)) {
    fail("INVALID_PROJECT_CONTEXT", "Project resolution input must be a plain object");
  }

  for (const field of Object.keys(snapshot)) {
    if (!RESOLUTION_INPUT_FIELDS.has(field)) {
      fail("INVALID_PROJECT_CONTEXT", `Unknown project resolution input field: ${field}`);
    }
  }
  if (!Object.hasOwn(snapshot, "workspace_roots") || !Object.hasOwn(snapshot, "requested_project")) {
    fail("INVALID_PROJECT_CONTEXT", "Project resolution input requires workspace_roots and requested_project");
  }

  const rawRoots = snapshot.workspace_roots;
  if (!Array.isArray(rawRoots) || rawRoots.length === 0) {
    fail("INVALID_PROJECT_CONTEXT", "workspace_roots must be a non-empty array");
  }
  const normalizedRoots: string[] = [];
  for (const root of rawRoots) {
    let normalized: string;
    try {
      normalized = normalizeAbsolutePath(root);
    } catch {
      fail("INVALID_PROJECT_CONTEXT", "workspace_roots entries must be absolute paths");
    }
    if (normalizedRoots.includes(normalized)) {
      fail("INVALID_PROJECT_CONTEXT", "workspace_roots entries must be unique");
    }
    normalizedRoots.push(normalized);
  }

  const requestedProject = snapshot.requested_project;
  if (typeof requestedProject !== "string" || requestedProject.trim().length === 0) {
    fail("INVALID_PROJECT_CONTEXT", "requested_project must be a non-empty string");
  }

  let explicitCanonicalRoot: string | undefined;
  if (Object.hasOwn(snapshot, "explicit_canonical_root")) {
    const rawExplicit = snapshot.explicit_canonical_root;
    try {
      explicitCanonicalRoot = normalizeAbsolutePath(rawExplicit);
    } catch {
      fail("INVALID_PROJECT_CONTEXT", "explicit_canonical_root must be an absolute path");
    }
  }

  let actionSummary: string | undefined;
  if (Object.hasOwn(snapshot, "action_summary")) {
    const rawAction = snapshot.action_summary;
    if (typeof rawAction !== "string" || rawAction.trim().length === 0) {
      fail("INVALID_PROJECT_CONTEXT", "action_summary must be a non-empty string when present");
    }
    actionSummary = rawAction;
  }

  return {
    workspaceRoots: Object.freeze(normalizedRoots),
    requestedProject,
    ...(explicitCanonicalRoot === undefined ? {} : { explicitCanonicalRoot }),
    ...(actionSummary === undefined ? {} : { actionSummary }),
  };
}

function canonicalizeWorkspaceRoots(
  workspaceRoots: readonly string[],
  probe: ProjectRootProbe,
): readonly CanonicalWorkspaceRoot[] {
  const canonicalRoots: CanonicalWorkspaceRoot[] = [];
  for (const declared of workspaceRoots) {
    let canonical: string;
    try {
      canonical = probe.realpath(declared);
    } catch {
      // 不可解析的工作区根不参与候选（缺失或不可访问）。
      continue;
    }
    if (canonical === "/" || !canonical.startsWith("/")) {
      continue;
    }
    canonicalRoots.push(Object.freeze({ declared, canonical }));
  }
  return canonicalRoots;
}

function selectWorkspaceRoot(
  canonicalRoots: readonly CanonicalWorkspaceRoot[],
  requestedProject: string,
  explicitCanonicalRoot: string | undefined,
  probe: ProjectRootProbe,
): { selected: CanonicalWorkspaceRoot; explicit: boolean } {
  if (explicitCanonicalRoot !== undefined) {
    const exact = canonicalRoots.filter((root) => root.canonical === explicitCanonicalRoot);
    if (exact.length !== 1) {
      fail(
        "PROJECT_PATH_ESCAPE_BLOCKED",
        `显式选择的规范根不在允许工作区内或无法唯一匹配：${explicitCanonicalRoot}`,
      );
    }
    const selected = exact[0] ?? fail("PROJECT_PATH_ESCAPE_BLOCKED", "显式选择的规范根不在允许工作区内");
    return { selected, explicit: true };
  }

  if (requestedProject.includes("/")) {
    if (!requestedProject.startsWith("/")) {
      fail("PROJECT_AMBIGUOUS_BLOCKED", "项目不明确：相对路径无法唯一解析，必须提供绝对路径或项目名称");
    }
    let normalizedRequested: string;
    try {
      normalizedRequested = normalizeAbsolutePath(requestedProject);
    } catch {
      fail("PROJECT_AMBIGUOUS_BLOCKED", "项目不明确：路径无法规范化");
    }
    let canonicalRequested: string;
    try {
      canonicalRequested = probe.realpath(normalizedRequested);
    } catch {
      fail("PROJECT_AMBIGUOUS_BLOCKED", "项目不明确：请求路径不存在或不可解析");
    }
    const containing = canonicalRoots.filter(
      (root) => root.canonical === canonicalRequested || isWithinPath(root.canonical, canonicalRequested),
    );
    if (containing.length === 0) {
      fail("PROJECT_PATH_ESCAPE_BLOCKED", `请求路径不在任何允许工作区内：${canonicalRequested}`);
    }
    if (containing.length > 1) {
      fail("PROJECT_ROOT_NESTED_BLOCKED", "候选项目根存在嵌套，必须显式选择规范绝对路径");
    }
    const selected =
      containing[0] ?? fail("PROJECT_AMBIGUOUS_BLOCKED", "项目不明确：请求路径无法唯一解析");
    return { selected, explicit: false };
  }

  const matches = canonicalRoots.filter(
    (root) => basenameOf(root.declared) === requestedProject || basenameOf(root.canonical) === requestedProject,
  );
  if (matches.length === 0) {
    fail("PROJECT_AMBIGUOUS_BLOCKED", `项目不明确：没有匹配名称的候选项目根：${requestedProject}`);
  }
  if (matches.length > 1) {
    fail("PROJECT_AMBIGUOUS_BLOCKED", "项目不明确：存在同名候选项目根，必须选择规范绝对路径");
  }
  const selected =
    matches[0] ?? fail("PROJECT_AMBIGUOUS_BLOCKED", "项目不明确：候选项目根无法唯一解析");
  return { selected, explicit: false };
}

export function projectContextDigest(context: ProjectContext): Sha256Digest {
  return digestJson(context);
}

export function resolveProjectContext(input: unknown, probe: ProjectRootProbe): ProjectContext {
  const { workspaceRoots, requestedProject, explicitCanonicalRoot, actionSummary } =
    assertResolutionInput(input);

  const canonicalRoots = canonicalizeWorkspaceRoots(workspaceRoots, probe);
  const { selected, explicit } = selectWorkspaceRoot(
    canonicalRoots,
    requestedProject,
    explicitCanonicalRoot,
    probe,
  );

  if (!explicit) {
    const nested = canonicalRoots.filter(
      (root) =>
        root !== selected &&
        (isWithinPath(selected.canonical, root.canonical) || isWithinPath(root.canonical, selected.canonical)),
    );
    if (nested.length > 0) {
      fail("PROJECT_ROOT_NESTED_BLOCKED", "候选项目根存在嵌套，必须显式选择规范绝对路径");
    }
    if (probe.isSymbolicLink(selected.declared)) {
      fail(
        "PROJECT_SYMLINK_BLOCKED",
        `候选项目根是符号链接，必须显式选择规范绝对路径：${selected.canonical}`,
      );
    }
  }

  if (!probe.isDirectory(selected.canonical)) {
    fail("PROJECT_ACCESS_BLOCKED", `项目根不可访问（不是可读目录）：${selected.canonical}`);
  }
  if (!probe.isReadable(selected.canonical) || !probe.isWritable(selected.canonical)) {
    fail("PROJECT_ACCESS_BLOCKED", `项目根权限不足，必须可读且可写：${selected.canonical}`);
  }

  const projectRoot = selected.canonical;
  const routeLockPath = `${projectRoot}/PROJECT_ROUTE_LOCK.md`;
  if (!probe.exists(routeLockPath)) {
    fail("PROJECT_ROUTE_LOCK_MISSING", `路线锁缺失：${routeLockPath}`);
  }
  if (!probe.isReadable(routeLockPath)) {
    fail("PROJECT_ACCESS_BLOCKED", `路线锁不可读：${routeLockPath}`);
  }
  let routeLockContent: string;
  try {
    routeLockContent = probe.readFileUtf8(routeLockPath);
  } catch {
    fail("PROJECT_ACCESS_BLOCKED", `路线锁不可读：${routeLockPath}`);
  }

  const stage = parseStage(routeLockContent);
  const projectName = basenameOf(projectRoot);
  const routeLock = Object.freeze({
    path: routeLockPath,
    digest: digestText(routeLockContent),
  });
  const currentStage = `${stage.lifecycle_stage}（${stage.stage_name}）`;
  const confirmationView = Object.freeze({
    project: projectName,
    project_root: projectRoot,
    current_stage: currentStage,
    action: actionSummary ?? "未声明写入动作",
  });
  const projectIdentityDigest = digestJson({
    project_name: projectName,
    project_root: projectRoot,
    workspace_root: selected.canonical,
    route_lock: routeLock,
  });

  return Object.freeze({
    schema_version: "1.0" as const,
    record_type: "project-context" as const,
    project_name: projectName,
    project_root: projectRoot,
    workspace_root: selected.canonical,
    project_identity_digest: projectIdentityDigest,
    route_lock: routeLock,
    stage,
    trace: Object.freeze({
      operations_log_present: probe.exists(`${projectRoot}/.codex/operations-log.md`),
      verification_report_present: probe.exists(`${projectRoot}/.codex/verification-report.md`),
    }),
    confirmation_view: confirmationView,
  });
}

export function formatProjectContextConfirmation(context: ProjectContext): string {
  const view = parseProjectContext(context).confirmation_view;
  return [
    `当前项目：${view.project}`,
    `项目根：${view.project_root}`,
    `当前阶段：${view.current_stage}`,
    `本次动作：${view.action}`,
  ].join("\n");
}

export function parseProjectContext(value: unknown): ProjectContext {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotJsonValue(value);
  } catch {
    fail("INVALID_PROJECT_CONTEXT", "Invalid project context: not JSON data");
  }
  try {
    assertNoSensitiveFields(snapshot);
    assertNoSensitiveContent(snapshot);
  } catch {
    fail("SENSITIVE_CONTENT_DETECTED", "Invalid project context: sensitive content detected");
  }
  if (!validateProjectContext(snapshot)) {
    fail("INVALID_PROJECT_CONTEXT", `Invalid project context: ${ajv.errorsText(validateProjectContext.errors, { separator: "; " })}`);
  }
  const context = snapshot as unknown as ProjectContext;

  const expectedIdentity = digestJson({
    project_name: context.project_name,
    project_root: context.project_root,
    workspace_root: context.workspace_root,
    route_lock: context.route_lock,
  });
  if (context.project_identity_digest !== expectedIdentity) {
    fail("INVALID_PROJECT_CONTEXT", "Invalid project context: project_identity_digest does not match identity projection");
  }
  if (context.route_lock.path !== `${context.project_root}/PROJECT_ROUTE_LOCK.md`) {
    fail("INVALID_PROJECT_CONTEXT", "Invalid project context: route_lock.path does not match project root");
  }
  const expectedStage = `${context.stage.lifecycle_stage}（${context.stage.stage_name}）`;
  if (
    context.confirmation_view.project !== context.project_name ||
    context.confirmation_view.project_root !== context.project_root ||
    context.confirmation_view.current_stage !== expectedStage
  ) {
    fail("INVALID_PROJECT_CONTEXT", "Invalid project context: confirmation_view is inconsistent");
  }
  return context;
}
