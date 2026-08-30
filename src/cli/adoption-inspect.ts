import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

import {
  AdoptionInspectSourceError,
  readAdoptionInspectSource,
} from "../adapters/node/adoption-inspect-source.ts";
import {
  adoptionCandidateSourceDigest,
  createAdoptionCandidate,
  parseAdoptionCandidate,
  type AdoptionCandidate,
} from "../domain/adoption-candidate.ts";
import { canonicalizeJson, parseCanonicalJsonBytes } from "../domain/canonical-json.ts";
import { digestJson } from "../domain/content-digest.ts";

type AdoptionInspectReceiptCode =
  | "PROJECT_NOT_ADOPTED"
  | "REF_PAIR_INCOMPLETE"
  | "ADOPTION_SOURCE_CONFLICT"
  | "ADOPTION_CANDIDATE_STALE";

interface ParsedArguments {
  readonly projectRoot: string;
  readonly routeLockPath: string;
  readonly activePlanPath: string;
  readonly evidencePaths: readonly string[];
  readonly previousCandidateFile?: string;
}

function parseArguments(args: readonly string[]): ParsedArguments {
  const values = new Map<string, string[]>();
  const supported = new Set([
    "--project-root",
    "--route-lock",
    "--active-plan",
    "--verification-summary",
    "--previous-candidate-file",
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key || !value || !supported.has(key)) {
      throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
    }
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const one = (key: string): string => {
    const selected = values.get(key) ?? [];
    if (selected.length !== 1) throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
    return selected[0] as string;
  };
  const projectRoot = one("--project-root");
  if (!isAbsolute(projectRoot)) throw new AdoptionInspectSourceError("INVALID_PROJECT_ROOT");
  const evidencePaths = values.get("--verification-summary") ?? [];
  if (evidencePaths.length === 0) throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  const previous = values.get("--previous-candidate-file") ?? [];
  if (previous.length > 1 || (previous[0] !== undefined && !isAbsolute(previous[0]))) {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
  return Object.freeze({
    projectRoot,
    routeLockPath: one("--route-lock"),
    activePlanPath: one("--active-plan"),
    evidencePaths: Object.freeze([...evidencePaths]),
    ...(previous[0] === undefined ? {} : { previousCandidateFile: previous[0] }),
  });
}

async function previousCandidate(path: string | undefined): Promise<AdoptionCandidate | undefined> {
  if (path === undefined) return undefined;
  try {
    return parseAdoptionCandidate(parseCanonicalJsonBytes(await readFile(path)));
  } catch {
    throw new AdoptionInspectSourceError("ADOPTION_SOURCE_CONFLICT");
  }
}

function receipt(ok: boolean, code: AdoptionInspectReceiptCode, data: Readonly<Record<string, unknown>>) {
  const body = { schema_version: "1.0" as const, ok, code, data };
  return Object.freeze({
    ...body,
    receipt_id: `receipt-${digestJson(body).slice("sha256:".length, 39)}`,
  });
}

function failureCode(error: unknown): AdoptionInspectReceiptCode {
  if (error instanceof AdoptionInspectSourceError) {
    return error.code === "INVALID_PROJECT_ROOT" ? "ADOPTION_SOURCE_CONFLICT" : error.code;
  }
  return "ADOPTION_SOURCE_CONFLICT";
}

export async function runAdoptionInspect(args: readonly string[]): Promise<number> {
  try {
    const parsed = parseArguments(args);
    const previous = await previousCandidate(parsed.previousCandidateFile);
    const source = await readAdoptionInspectSource(parsed);
    const replacement = createAdoptionCandidate(source);
    if (
      previous !== undefined &&
      (
        adoptionCandidateSourceDigest(previous) !== adoptionCandidateSourceDigest(replacement) ||
        Date.parse(previous.expires_at_trusted) <= Date.parse(source.created_at_trusted)
      )
    ) {
      process.stdout.write(canonicalizeJson(receipt(false, "ADOPTION_CANDIDATE_STALE", {
        replacement_candidate: replacement,
        stale_candidate_digest: previous.candidate_digest,
        zero_writes: true,
        next_trusted_action: "review-replacement-candidate-in-trusted-host",
      })));
      process.stderr.write("Adoption inspect rejected\n");
      return 1;
    }
    const candidate = previous ?? replacement;
    process.stdout.write(canonicalizeJson(receipt(true, "PROJECT_NOT_ADOPTED", {
      candidate,
      candidate_digest: candidate.candidate_digest,
      zero_writes: true,
      next_trusted_action: "review-candidate-in-trusted-host",
    })));
    return 0;
  } catch (error) {
    const code = failureCode(error);
    const missingRefs = error instanceof AdoptionInspectSourceError ? error.missing_refs : [];
    process.stdout.write(canonicalizeJson(receipt(false, code, {
      missing_refs: missingRefs,
      zero_writes: true,
      next_trusted_action: "resolve-source-state-and-inspect-again",
    })));
    process.stderr.write("Adoption inspect rejected\n");
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runAdoptionInspect(process.argv.slice(2));
}
