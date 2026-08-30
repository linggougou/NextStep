import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";

import { readAdoptionInspectSource } from "./adoption-inspect-source.ts";
import { createAdoptionCandidate, parseAdoptionCandidate, type AdoptionCandidate } from "../../domain/adoption-candidate.ts";
import {
  createAdoptionActivation,
  createAdoptionActivationReceipt,
  createAdoptionNamespaceDigest,
  createAdoptionRollbackReceipt,
  parseAdoptionActivation,
  parseAdoptionActivationReceipt,
  parseAdoptionRollbackReceipt,
  type AdoptionActivation,
  type AdoptionActivationReceipt,
  type AdoptionRollbackReceipt,
} from "../../domain/adoption-activation.ts";
import {
  assertTrustedAdoptionConfirmation,
  createAdoptedBaseline,
  parseAdoptedBaseline,
  type AdoptedBaselineRecord,
  type AdoptionConfirmationEnvelope,
} from "../../domain/adopted-baseline.ts";
import { canonicalizeJson, snapshotJsonValue } from "../../domain/canonical-json.ts";
import { digestJson, type Sha256Digest } from "../../domain/content-digest.ts";

export type AdoptionRefStoreErrorCode =
  | "INVALID_ADOPTION_REQUEST"
  | "ADOPTION_CONFIRMATION_UNTRUSTED"
  | "ADOPTION_CANDIDATE_STALE"
  | "ADOPTION_SOURCE_CONFLICT"
  | "REF_PAIR_INCOMPLETE"
  | "ADOPTION_TRANSACTION_FAILED"
  | "ADOPTION_POSTCHECK_FAILED"
  | "ADOPTION_RECEIPT_LOST"
  | "ADOPTION_RECOVERY_REQUIRED"
  | "ADOPTION_ROLLBACK_BLOCKED";

export class AdoptionRefStoreError extends Error {
  readonly code: AdoptionRefStoreErrorCode;
  constructor(code: AdoptionRefStoreErrorCode) {
    super("Adoption ref operation rejected");
    this.code = code;
  }
}

export interface AdoptionRoleSeparation {
  readonly candidate_actor_id: string;
  readonly activation_actor_id: string;
  readonly independent_acceptance_actor_id: string;
}

export interface ActivateAdoptionOptions {
  readonly projectRoot: string;
  readonly candidate: AdoptionCandidate;
  readonly confirmation: AdoptionConfirmationEnvelope;
  readonly roles: AdoptionRoleSeparation;
  readonly projection: { readonly stage: string; readonly milestone: string; readonly scope: string };
  readonly now: () => Date;
  readonly afterRefTransaction?: () => void;
}

export interface AdoptionRollbackAction {
  readonly decision: "rollback";
  readonly receipt_digest: Sha256Digest;
  readonly current_namespace_digest: Sha256Digest;
  readonly user_action_ref: string;
  readonly nonce_or_replay_key: string;
  readonly occurred_at_trusted: string;
}

export interface AdoptionRollbackResult {
  readonly status: "rolled-back";
  readonly receipt_blob_oid: string;
  readonly receipt: AdoptionRollbackReceipt;
}

export interface AdoptionRollbackVerifier {
  readonly verifier_kind: "trusted-host";
  verifyRollback(action: AdoptionRollbackAction): boolean;
}

const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const safeEnvironment = Object.freeze({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))),
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
});

function fail(code: AdoptionRefStoreErrorCode): never { throw new AdoptionRefStoreError(code); }

function git(root: string, args: readonly string[], input?: string, environment: NodeJS.ProcessEnv = safeEnvironment): string {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: environment,
      input,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10_000,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    fail("ADOPTION_TRANSACTION_FAILED");
  }
}

function gitBytes(root: string, args: readonly string[]): Buffer {
  try {
    const output = execFileSync("git", ["-C", root, ...args], {
      env: safeEnvironment,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  } catch {
    fail("ADOPTION_POSTCHECK_FAILED");
  }
}

function gitOptional(root: string, args: readonly string[], input?: string): string | null {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8", env: safeEnvironment, input,
      maxBuffer: 8 * 1024 * 1024, timeout: 10_000,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    }).trim();
  } catch { return null; }
}

interface NamespaceEntry { readonly name: string; readonly oid: string }

function namespace(root: string): readonly NamespaceEntry[] {
  const output = git(root, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/nextstep/"]);
  return Object.freeze(output.split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf(" ");
    const entry = { name: line.slice(0, separator), oid: line.slice(separator + 1) };
    if (separator < 1 || !OID.test(entry.oid)) fail("ADOPTION_SOURCE_CONFLICT");
    return Object.freeze(entry);
  }).sort((left, right) => left.name.localeCompare(right.name, "en-US")));
}

function namespaceDigest(entries: readonly NamespaceEntry[]): Sha256Digest {
  return digestJson(entries.map((entry) => ({ name: entry.name, oid: entry.oid })));
}

function pair(entries: readonly NamespaceEntry[]): { readonly formal: string; readonly control: string } | null {
  if (entries.length === 0) return null;
  const formal = entries.find((entry) => entry.name === "refs/nextstep/formal")?.oid;
  const control = entries.find((entry) => entry.name === "refs/nextstep/control")?.oid;
  if (entries.length === 1 && ((formal === undefined) !== (control === undefined))) fail("REF_PAIR_INCOMPLETE");
  if (entries.length !== 2 || !formal || !control) fail("ADOPTION_SOURCE_CONFLICT");
  return { formal, control };
}

function objectEnvironment(timestamp: string): Readonly<Record<string, string>> {
  return Object.freeze({
    ...safeEnvironment,
    GIT_AUTHOR_NAME: "NextStep Trusted Host",
    GIT_AUTHOR_EMAIL: "nextstep@local.invalid",
    GIT_AUTHOR_DATE: timestamp,
    GIT_COMMITTER_NAME: "NextStep Trusted Host",
    GIT_COMMITTER_EMAIL: "nextstep@local.invalid",
    GIT_COMMITTER_DATE: timestamp,
  });
}

function jsonBlob(root: string, value: unknown): string {
  const oid = git(root, ["hash-object", "-w", "--stdin"], canonicalizeJson(value));
  if (!OID.test(oid)) fail("ADOPTION_TRANSACTION_FAILED");
  return oid;
}

function tree(root: string, entries: Readonly<Record<string, string>>): string {
  const lines = Object.entries(entries).sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([name, oid]) => `100644 blob ${oid}\t${name}`).join("\n") + "\n";
  const oid = git(root, ["mktree"], lines);
  if (!OID.test(oid)) fail("ADOPTION_TRANSACTION_FAILED");
  return oid;
}

// A3.0-B 的唯一 Git ref transaction 实现；create/delete 都通过同一 prepare+commit 临界区。
function refTransaction(
  root: string,
  operations: readonly { readonly kind: "create" | "delete"; readonly ref: string; readonly oid: string }[],
): void {
  const commands = ["start", ...operations.map((operation) =>
    operation.kind === "create"
      ? `create ${operation.ref} ${operation.oid}`
      : `delete ${operation.ref} ${operation.oid}`
  ), "prepare", "commit", ""].join("\n");
  git(root, ["update-ref", "--stdin"], commands);
}

function readJson(root: string, revisionPath: string): unknown {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(gitBytes(root, ["show", revisionPath]));
    const value = JSON.parse(text) as unknown;
    if (canonicalizeJson(value) !== text) fail("ADOPTION_RECOVERY_REQUIRED");
    return value;
  } catch { fail("ADOPTION_RECOVERY_REQUIRED"); }
}

function parents(root: string, oid: string): readonly string[] {
  const values = git(root, ["rev-list", "--parents", "-n", "1", oid]).split(/\s+/);
  if (values[0] !== oid) fail("ADOPTION_RECOVERY_REQUIRED");
  return values.slice(1);
}

function assertRoles(roles: AdoptionRoleSeparation): void {
  const values = Object.values(roles);
  if (values.some((value) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) || new Set(values).size !== values.length) {
    fail("INVALID_ADOPTION_REQUEST");
  }
}

function assertCurrentTime(confirmation: AdoptionConfirmationEnvelope, now: Date): void {
  const current = now.getTime();
  if (!Number.isFinite(current) || current < Date.parse(confirmation.verified_at_trusted) || current >= Date.parse(confirmation.expires_at_trusted)) {
    fail("ADOPTION_CONFIRMATION_UNTRUSTED");
  }
}

function postActivationCandidateCheck(
  root: string,
  candidate: AdoptionCandidate,
  expected: { readonly formal: string; readonly control: string },
): void {
  const current = pair(namespace(root));
  const worktrees = git(root, ["worktree", "list", "--porcelain"]).split("\n")
    .filter((line) => line.startsWith("worktree ")).map((line) => line.slice("worktree ".length));
  if (current === null || current.formal !== expected.formal || current.control !== expected.control) fail("ADOPTION_POSTCHECK_FAILED");
  if (git(root, ["rev-parse", "--verify", "HEAD^{commit}"]) !== candidate.candidate_head_oid) fail("ADOPTION_CANDIDATE_STALE");
  if (git(root, ["status", "--porcelain=v2", "--untracked-files=all"]) !== "") fail("ADOPTION_CANDIDATE_STALE");
  if (worktrees.length !== 1 || worktrees[0] !== root) fail("ADOPTION_POSTCHECK_FAILED");
  for (const source of [candidate.route_lock, candidate.active_plan, ...candidate.evidence_sources]) {
    const line = git(root, ["ls-tree", candidate.candidate_head_oid, "--", source.path]);
    const match = /^(\d{6}) blob ([a-f0-9]{40,64})\t(.+)$/.exec(line);
    const digest = `sha256:${createHash("sha256").update(gitBytes(root, ["cat-file", "blob", source.blob_oid])).digest("hex")}`;
    if (!match || match[1] === "120000" || match[2] !== source.blob_oid || match[3] !== source.path || digest !== source.digest) {
      fail("ADOPTION_POSTCHECK_FAILED");
    }
  }
}

async function assertCandidateCurrent(root: string, candidate: AdoptionCandidate): Promise<void> {
  try {
    const source = await readAdoptionInspectSource({
      projectRoot: root,
      routeLockPath: candidate.route_lock.path,
      activePlanPath: candidate.active_plan.path,
      evidencePaths: candidate.evidence_sources.map((value) => value.path),
    }, { now: () => new Date(candidate.created_at_trusted) });
    if (createAdoptionCandidate(source).candidate_digest !== candidate.candidate_digest) fail("ADOPTION_CANDIDATE_STALE");
  } catch (error) {
    if (error instanceof AdoptionRefStoreError) throw error;
    fail("ADOPTION_CANDIDATE_STALE");
  }
}

function checkpointValue(
  repositoryIdentity: Sha256Digest,
  formalOid: string,
  genesisOid: string,
  projection: ActivateAdoptionOptions["projection"],
  at: string,
): unknown {
  return {
    schema_version: "1.0",
    repository_id: repositoryIdentity,
    route_generation: 1,
    plan_id: "adopted-existing-project",
    plan_generation: 0,
    formal_ref: "refs/nextstep/formal",
    formal_oid: formalOid,
    control_parent_oid: genesisOid,
    highest_task_attempts: {},
    next_stage: `adopted baseline ${projection.stage} ${projection.milestone}; review unknown gates before creating any execution task`,
    updated_at: at,
    adoption_state: "rollback-eligible",
  };
}

function registryValue(repositoryIdentity: Sha256Digest): unknown {
  return {
    schema_version: "1.0",
    repository_id: repositoryIdentity,
    route_generation: 1,
    plan_id: "adopted-existing-project",
    plan_generation: 0,
    tasks: [],
  };
}

function genesisValue(
  repositoryIdentity: Sha256Digest,
  candidateDigest: Sha256Digest,
  createdAt: string,
): unknown {
  return {
    schema_version: "1.0",
    kind: "adoption-control-genesis",
    repository_identity: repositoryIdentity,
    candidate_digest: candidateDigest,
    created_at_trusted: createdAt,
  };
}

interface VerifiedActivationState {
  readonly activation: AdoptionActivation;
  readonly baseline: AdoptedBaselineRecord;
}

function verifiedActivationState(
  root: string,
  refs: { readonly formal: string; readonly control: string },
): VerifiedActivationState {
  try {
    const activation = parseAdoptionActivation(readJson(root, `${refs.control}:activation.json`));
    const baseline = parseAdoptedBaseline(readJson(root, `${refs.control}:adopted-baseline.json`));
    const checkpointRecord = readJson(root, `${refs.control}:checkpoint.json`);
    const registryRecord = readJson(root, `${refs.control}:registry.json`);
    const genesisRecord = readJson(root, `${activation.genesis_oid}:genesis.json`);
    const activationParents = parents(root, refs.control);
    const activationPaths = git(root, ["ls-tree", "-r", "--name-only", refs.control]).split("\n").filter(Boolean).sort();
    const genesisPaths = git(root, ["ls-tree", "-r", "--name-only", activation.genesis_oid]).split("\n").filter(Boolean).sort();
    const projection = {
      stage: baseline.projected_stage,
      milestone: baseline.projected_milestone,
      scope: baseline.projected_scope,
    };
    const expectedActivation = createAdoptionActivation({
      repository_identity: activation.repository_identity,
      candidate_digest: activation.candidate_digest,
      confirmation_envelope_digest: activation.confirmation_envelope_digest,
      baseline_oid: refs.formal,
      genesis_oid: activation.genesis_oid,
      activated_at_trusted: activation.activated_at_trusted,
      expected_namespace_digest: digestJson([]),
    });
    if (
      activationParents.length !== 1 || activationParents[0] !== activation.genesis_oid ||
      parents(root, activation.genesis_oid).length !== 0 ||
      activationPaths.join("\n") !== "activation.json\nadopted-baseline.json\ncheckpoint.json\nregistry.json" ||
      genesisPaths.join("\n") !== "genesis.json" ||
      activation.baseline_oid !== refs.formal || baseline.baseline_oid !== refs.formal ||
      activation.repository_identity !== baseline.repository_identity ||
      activation.candidate_digest !== baseline.candidate_digest ||
      activation.confirmation_envelope_digest !== baseline.confirmation_envelope_digest ||
      baseline.lifecycle_state !== "rollback-eligible" ||
      canonicalizeJson(activation) !== canonicalizeJson(expectedActivation) ||
      canonicalizeJson(genesisRecord) !== canonicalizeJson(genesisValue(
        activation.repository_identity,
        activation.candidate_digest,
        activation.activated_at_trusted,
      )) ||
      canonicalizeJson(checkpointRecord) !== canonicalizeJson(checkpointValue(
        activation.repository_identity,
        refs.formal,
        activation.genesis_oid,
        projection,
        activation.activated_at_trusted,
      )) ||
      canonicalizeJson(registryRecord) !== canonicalizeJson(registryValue(activation.repository_identity))
    ) fail("ADOPTION_RECOVERY_REQUIRED");
    return { activation, baseline };
  } catch {
    fail("ADOPTION_RECOVERY_REQUIRED");
  }
}

function recoverReceipt(
  root: string,
  refs: { readonly formal: string; readonly control: string },
  candidate: AdoptionCandidate,
  confirmation: AdoptionConfirmationEnvelope,
  expectedBaseline: AdoptedBaselineRecord,
): AdoptionActivationReceipt {
  if (refs.formal !== candidate.candidate_head_oid) fail("ADOPTION_RECOVERY_REQUIRED");
  const state = verifiedActivationState(root, refs);
  const expectedActivation = createAdoptionActivation({
    repository_identity: candidate.repository_identity,
    candidate_digest: candidate.candidate_digest,
    confirmation_envelope_digest: confirmation.envelope_digest,
    baseline_oid: refs.formal,
    genesis_oid: state.activation.genesis_oid,
    activated_at_trusted: state.activation.activated_at_trusted,
    expected_namespace_digest: candidate.nextstep_namespace_digest,
  });
  if (
    canonicalizeJson(state.activation) !== canonicalizeJson(expectedActivation) ||
    canonicalizeJson(state.baseline) !== canonicalizeJson(expectedBaseline)
  ) fail("ADOPTION_RECOVERY_REQUIRED");
  const receipt = createAdoptionActivationReceipt(state.activation, refs.control);
  if (namespaceDigest(namespace(root)) !== receipt.activated_namespace_digest) fail("ADOPTION_RECOVERY_REQUIRED");
  return receipt;
}

export async function activateAdoption(options: ActivateAdoptionOptions): Promise<AdoptionActivationReceipt> {
  if (!isAbsolute(options.projectRoot) || options.projectRoot.includes("\0")) fail("INVALID_ADOPTION_REQUEST");
  let projectRoot: string;
  try { projectRoot = realpathSync(options.projectRoot); } catch { fail("INVALID_ADOPTION_REQUEST"); }
  assertRoles(options.roles);
  const candidate = parseAdoptionCandidate(options.candidate);
  try { assertTrustedAdoptionConfirmation(options.confirmation); } catch { fail("ADOPTION_CONFIRMATION_UNTRUSTED"); }
  if (options.confirmation.candidate_digest !== candidate.candidate_digest) fail("ADOPTION_CONFIRMATION_UNTRUSTED");
  const observed = options.now();
  assertCurrentTime(options.confirmation, observed);
  let baseline: ReturnType<typeof createAdoptedBaseline>;
  try { baseline = createAdoptedBaseline(candidate, options.confirmation, options.projection); }
  catch { fail("ADOPTION_CONFIRMATION_UNTRUSTED"); }

  const existing = pair(namespace(projectRoot));
  if (existing !== null) {
    postActivationCandidateCheck(projectRoot, candidate, existing);
    return recoverReceipt(projectRoot, existing, candidate, options.confirmation, baseline);
  }
  await assertCandidateCurrent(projectRoot, candidate);

  const genesis = genesisValue(candidate.repository_identity, candidate.candidate_digest, observed.toISOString());
  const genesisTree = tree(projectRoot, { "genesis.json": jsonBlob(projectRoot, genesis) });
  const genesisOid = git(projectRoot, ["commit-tree", genesisTree], "NextStep adoption control genesis\n", objectEnvironment(observed.toISOString()));
  if (!OID.test(genesisOid) || parents(projectRoot, genesisOid).length !== 0) fail("ADOPTION_TRANSACTION_FAILED");
  const activation = createAdoptionActivation({
    repository_identity: candidate.repository_identity,
    candidate_digest: candidate.candidate_digest,
    confirmation_envelope_digest: options.confirmation.envelope_digest,
    baseline_oid: candidate.candidate_head_oid,
    genesis_oid: genesisOid,
    activated_at_trusted: observed.toISOString(),
    expected_namespace_digest: candidate.nextstep_namespace_digest,
  });
  const activationTree = tree(projectRoot, {
    "activation.json": jsonBlob(projectRoot, activation),
    "adopted-baseline.json": jsonBlob(projectRoot, baseline),
    "checkpoint.json": jsonBlob(projectRoot, checkpointValue(
      candidate.repository_identity,
      candidate.candidate_head_oid,
      genesisOid,
      options.projection,
      observed.toISOString(),
    )),
    "registry.json": jsonBlob(projectRoot, registryValue(candidate.repository_identity)),
  });
  const activationOid = git(projectRoot, ["commit-tree", activationTree, "-p", genesisOid], "NextStep adopted baseline activation\n", objectEnvironment(observed.toISOString()));
  if (!OID.test(activationOid) || parents(projectRoot, activationOid)[0] !== genesisOid) fail("ADOPTION_TRANSACTION_FAILED");

  await assertCandidateCurrent(projectRoot, candidate);
  if (namespace(projectRoot).length !== 0) fail("ADOPTION_CANDIDATE_STALE");
  refTransaction(projectRoot, [
    { kind: "create", ref: "refs/nextstep/formal", oid: candidate.candidate_head_oid },
    { kind: "create", ref: "refs/nextstep/control", oid: activationOid },
  ]);
  try { options.afterRefTransaction?.(); } catch { fail("ADOPTION_RECEIPT_LOST"); }
  const created = pair(namespace(projectRoot));
  if (created === null || created.formal !== candidate.candidate_head_oid || created.control !== activationOid) fail("ADOPTION_POSTCHECK_FAILED");
  postActivationCandidateCheck(projectRoot, candidate, created);
  return recoverReceipt(projectRoot, created, candidate, options.confirmation, baseline);
}

export async function rollbackAdoption(options: {
  readonly projectRoot: string;
  readonly receipt: AdoptionActivationReceipt;
  readonly action: AdoptionRollbackAction;
  readonly verifier: AdoptionRollbackVerifier | undefined;
  readonly now: () => Date;
  readonly afterRefTransaction?: () => void;
}): Promise<AdoptionRollbackResult> {
  if (!isAbsolute(options.projectRoot) || options.projectRoot.includes("\0")) fail("INVALID_ADOPTION_REQUEST");
  let projectRoot: string;
  try { projectRoot = realpathSync(options.projectRoot); } catch { fail("INVALID_ADOPTION_REQUEST"); }
  let receipt: AdoptionActivationReceipt;
  try { receipt = parseAdoptionActivationReceipt(options.receipt); }
  catch { fail("ADOPTION_ROLLBACK_BLOCKED"); }
  let action: AdoptionRollbackAction;
  try { action = snapshotJsonValue(options.action) as unknown as AdoptionRollbackAction; }
  catch { fail("ADOPTION_ROLLBACK_BLOCKED"); }
  if (
    Object.keys(action).sort().join("|") !== "current_namespace_digest|decision|nonce_or_replay_key|occurred_at_trusted|receipt_digest|user_action_ref" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(action.user_action_ref) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(action.nonce_or_replay_key)
  ) fail("ADOPTION_ROLLBACK_BLOCKED");
  const current = options.now().getTime();
  const occurred = Date.parse(action.occurred_at_trusted);
  if (
    action.decision !== "rollback" || action.receipt_digest !== receipt.receipt_digest ||
    action.current_namespace_digest !== receipt.activated_namespace_digest ||
    options.verifier?.verifier_kind !== "trusted-host" || typeof options.verifier.verifyRollback !== "function" ||
    !Number.isFinite(current) || !Number.isFinite(occurred) || occurred > current || current - occurred > 15 * 60 * 1_000
  ) fail("ADOPTION_ROLLBACK_BLOCKED");
  let entries: readonly NamespaceEntry[];
  let refs: { readonly formal: string; readonly control: string } | null;
  try {
    entries = namespace(projectRoot);
    refs = pair(entries);
  } catch { fail("ADOPTION_ROLLBACK_BLOCKED"); }
  if (refs === null) {
    const rollbackReceipt = createAdoptionRollbackReceipt({
      activation_receipt: receipt,
      rollback_action_digest: digestJson(action),
      rolled_back_at_trusted: action.occurred_at_trusted,
    });
    const receiptBytes = canonicalizeJson(rollbackReceipt);
    const receiptBlobOid = git(projectRoot, ["hash-object", "--stdin"], receiptBytes);
    if (!OID.test(receiptBlobOid)) fail("ADOPTION_ROLLBACK_BLOCKED");
    const recovered = gitOptional(projectRoot, ["cat-file", "blob", receiptBlobOid]);
    if (recovered === null) fail("ADOPTION_ROLLBACK_BLOCKED");
    let parsed: AdoptionRollbackReceipt;
    try { parsed = parseAdoptionRollbackReceipt(JSON.parse(recovered)); } catch { fail("ADOPTION_ROLLBACK_BLOCKED"); }
    if (canonicalizeJson(parsed) !== receiptBytes) fail("ADOPTION_ROLLBACK_BLOCKED");
    let verified = false;
    try { verified = options.verifier.verifyRollback(action) === true; } catch { /* fail closed */ }
    if (!verified) fail("ADOPTION_ROLLBACK_BLOCKED");
    return Object.freeze({ status: "rolled-back", receipt_blob_oid: receiptBlobOid, receipt: parsed });
  }
  let expectedReceipt: AdoptionActivationReceipt;
  try {
    const state = verifiedActivationState(projectRoot, refs);
    expectedReceipt = createAdoptionActivationReceipt(state.activation, refs.control);
  } catch { fail("ADOPTION_ROLLBACK_BLOCKED"); }
  if (
    canonicalizeJson(receipt) !== canonicalizeJson(expectedReceipt) ||
    refs.formal !== receipt.formal_oid || refs.control !== receipt.activation_oid ||
    namespaceDigest(entries) !== receipt.activated_namespace_digest ||
    receipt.activated_namespace_digest !== createAdoptionNamespaceDigest(refs.formal, refs.control)
  ) fail("ADOPTION_ROLLBACK_BLOCKED");
  let verified = false;
  try { verified = options.verifier.verifyRollback(action) === true; } catch { /* fail closed */ }
  if (!verified) fail("ADOPTION_ROLLBACK_BLOCKED");
  const rollbackReceipt = createAdoptionRollbackReceipt({
    activation_receipt: receipt,
    rollback_action_digest: digestJson(action),
    rolled_back_at_trusted: action.occurred_at_trusted,
  });
  const receiptBytes = canonicalizeJson(rollbackReceipt);
  const receiptBlobOid = git(projectRoot, ["hash-object", "--stdin"], receiptBytes);
  if (!OID.test(receiptBlobOid)) fail("ADOPTION_ROLLBACK_BLOCKED");
  const writtenBlob = jsonBlob(projectRoot, rollbackReceipt);
  if (writtenBlob !== receiptBlobOid) fail("ADOPTION_ROLLBACK_BLOCKED");
  refTransaction(projectRoot, [
    { kind: "delete", ref: "refs/nextstep/formal", oid: refs.formal },
    { kind: "delete", ref: "refs/nextstep/control", oid: refs.control },
  ]);
  try { options.afterRefTransaction?.(); } catch { fail("ADOPTION_RECEIPT_LOST"); }
  if (namespace(projectRoot).length !== 0) fail("ADOPTION_POSTCHECK_FAILED");
  return Object.freeze({ status: "rolled-back", receipt_blob_oid: receiptBlobOid, receipt: rollbackReceipt });
}
