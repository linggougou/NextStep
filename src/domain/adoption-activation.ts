import { Ajv, type ValidateFunction } from "ajv";

import activationSchema from "../../schemas/v1/adoption-activation.schema.json" with { type: "json" };
import { snapshotJsonValue } from "./canonical-json.ts";
import { digestJson, projectForDigest, type Sha256Digest } from "./content-digest.ts";

export interface AdoptionActivation {
  readonly schema_version: "1.0";
  readonly record_type: "adoption-activation";
  readonly repository_identity: Sha256Digest;
  readonly candidate_digest: Sha256Digest;
  readonly confirmation_envelope_digest: Sha256Digest;
  readonly baseline_oid: string;
  readonly genesis_oid: string;
  readonly control_parent_oid: string;
  readonly effect_identity: Sha256Digest;
  readonly activation_receipt_identity: Sha256Digest;
  readonly rollback_guard: {
    readonly expected_namespace_digest: Sha256Digest;
    readonly no_external_side_effects: true;
  };
  readonly activated_at_trusted: string;
  readonly activation_digest: Sha256Digest;
}

export interface AdoptionActivationReceipt {
  readonly schema_version: "1.0";
  readonly record_type: "adoption-activation-receipt";
  readonly repository_identity: Sha256Digest;
  readonly effect_identity: Sha256Digest;
  readonly candidate_digest: Sha256Digest;
  readonly confirmation_envelope_digest: Sha256Digest;
  readonly formal_oid: string;
  readonly activation_oid: string;
  readonly genesis_oid: string;
  readonly activated_namespace_digest: Sha256Digest;
  readonly activated_at_trusted: string;
  readonly receipt_digest: Sha256Digest;
}

export interface AdoptionRollbackReceipt {
  readonly schema_version: "1.0";
  readonly record_type: "adoption-rollback-receipt";
  readonly repository_identity: Sha256Digest;
  readonly effect_identity: Sha256Digest;
  readonly activation_receipt_digest: Sha256Digest;
  readonly previous_namespace_digest: Sha256Digest;
  readonly rollback_action_digest: Sha256Digest;
  readonly rolled_back_at_trusted: string;
  readonly status: "rolled-back";
  readonly receipt_digest: Sha256Digest;
}

export class AdoptionActivationError extends Error {
  readonly code = "INVALID_ADOPTION_ACTIVATION";
  constructor() { super("Adoption activation record rejected"); }
}

const validate = new Ajv({ strict: true, allErrors: true, ownProperties: true }).compile(activationSchema) as ValidateFunction;

function fail(): never { throw new AdoptionActivationError(); }

export function createAdoptionActivation(input: {
  readonly repository_identity: Sha256Digest;
  readonly candidate_digest: Sha256Digest;
  readonly confirmation_envelope_digest: Sha256Digest;
  readonly baseline_oid: string;
  readonly genesis_oid: string;
  readonly activated_at_trusted: string;
  readonly expected_namespace_digest: Sha256Digest;
}): AdoptionActivation {
  const effectIdentity = digestJson({
    repository_identity: input.repository_identity,
    candidate_digest: input.candidate_digest,
    confirmation_envelope_digest: input.confirmation_envelope_digest,
  });
  const unsigned = {
    schema_version: "1.0" as const,
    record_type: "adoption-activation" as const,
    repository_identity: input.repository_identity,
    candidate_digest: input.candidate_digest,
    confirmation_envelope_digest: input.confirmation_envelope_digest,
    baseline_oid: input.baseline_oid,
    genesis_oid: input.genesis_oid,
    control_parent_oid: input.genesis_oid,
    effect_identity: effectIdentity,
    activation_receipt_identity: digestJson({ effect_identity: effectIdentity, kind: "activation-receipt" }),
    rollback_guard: {
      expected_namespace_digest: input.expected_namespace_digest,
      no_external_side_effects: true as const,
    },
    activated_at_trusted: input.activated_at_trusted,
  };
  const record = snapshotJsonValue({ ...unsigned, activation_digest: digestJson(unsigned) }) as unknown as AdoptionActivation;
  if (!validate(record)) fail();
  return record;
}

export function parseAdoptionActivation(value: unknown): AdoptionActivation {
  let snapshot: unknown;
  try { snapshot = snapshotJsonValue(value); } catch { fail(); }
  if (!validate(snapshot) || (snapshot as { record_type?: unknown }).record_type !== "adoption-activation") fail();
  const record = snapshot as AdoptionActivation;
  if (record.control_parent_oid !== record.genesis_oid || digestJson(projectForDigest(record, ["activation_digest"])) !== record.activation_digest) fail();
  return record;
}

export function createAdoptionActivationReceipt(
  activationInput: AdoptionActivation,
  activationOid: string,
): AdoptionActivationReceipt {
  const activation = parseAdoptionActivation(activationInput);
  const unsigned = {
    schema_version: "1.0" as const,
    record_type: "adoption-activation-receipt" as const,
    repository_identity: activation.repository_identity,
    effect_identity: activation.effect_identity,
    candidate_digest: activation.candidate_digest,
    confirmation_envelope_digest: activation.confirmation_envelope_digest,
    formal_oid: activation.baseline_oid,
    activation_oid: activationOid,
    genesis_oid: activation.genesis_oid,
    activated_namespace_digest: createAdoptionNamespaceDigest(activation.baseline_oid, activationOid),
    activated_at_trusted: activation.activated_at_trusted,
  };
  const receipt = snapshotJsonValue({ ...unsigned, receipt_digest: digestJson(unsigned) }) as unknown as AdoptionActivationReceipt;
  if (!validate(receipt)) fail();
  return receipt;
}

export function createAdoptionNamespaceDigest(formalOid: string, controlOid: string): Sha256Digest {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(formalOid) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(controlOid)) fail();
  return digestJson([
    { name: "refs/nextstep/control", oid: controlOid },
    { name: "refs/nextstep/formal", oid: formalOid },
  ]);
}

export function parseAdoptionActivationReceipt(value: unknown): AdoptionActivationReceipt {
  let snapshot: unknown;
  try { snapshot = snapshotJsonValue(value); } catch { fail(); }
  if (!validate(snapshot) || (snapshot as { record_type?: unknown }).record_type !== "adoption-activation-receipt") fail();
  const receipt = snapshot as AdoptionActivationReceipt;
  if (
    digestJson(projectForDigest(receipt, ["receipt_digest"])) !== receipt.receipt_digest ||
    receipt.activated_namespace_digest !== createAdoptionNamespaceDigest(receipt.formal_oid, receipt.activation_oid)
  ) fail();
  return receipt;
}

export function createAdoptionRollbackReceipt(input: {
  readonly activation_receipt: AdoptionActivationReceipt;
  readonly rollback_action_digest: Sha256Digest;
  readonly rolled_back_at_trusted: string;
}): AdoptionRollbackReceipt {
  const activationReceipt = parseAdoptionActivationReceipt(input.activation_receipt);
  const unsigned = {
    schema_version: "1.0" as const,
    record_type: "adoption-rollback-receipt" as const,
    repository_identity: activationReceipt.repository_identity,
    effect_identity: activationReceipt.effect_identity,
    activation_receipt_digest: activationReceipt.receipt_digest,
    previous_namespace_digest: activationReceipt.activated_namespace_digest,
    rollback_action_digest: input.rollback_action_digest,
    rolled_back_at_trusted: input.rolled_back_at_trusted,
    status: "rolled-back" as const,
  };
  const receipt = snapshotJsonValue({ ...unsigned, receipt_digest: digestJson(unsigned) }) as unknown as AdoptionRollbackReceipt;
  if (!validate(receipt)) fail();
  return receipt;
}

export function parseAdoptionRollbackReceipt(value: unknown): AdoptionRollbackReceipt {
  let snapshot: unknown;
  try { snapshot = snapshotJsonValue(value); } catch { fail(); }
  if (!validate(snapshot) || (snapshot as { record_type?: unknown }).record_type !== "adoption-rollback-receipt") fail();
  const receipt = snapshot as AdoptionRollbackReceipt;
  if (digestJson(projectForDigest(receipt, ["receipt_digest"])) !== receipt.receipt_digest) fail();
  return receipt;
}
