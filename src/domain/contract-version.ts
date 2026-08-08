const CONTRACT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SUPPORTED_CONTRACT_VERSIONS = new Set(["1.0"]);

export interface ContractVersion {
  readonly major: number;
  readonly minor: number;
}

export function assertSupportedContractVersion(version: unknown): ContractVersion {
  if (typeof version !== "string") {
    throw new TypeError("Contract version must be a string");
  }

  const match = CONTRACT_VERSION_PATTERN.exec(version);
  if (match === null) {
    throw new TypeError(`Invalid contract version: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!SUPPORTED_CONTRACT_VERSIONS.has(version)) {
    throw new Error(`Unsupported contract version: ${version}`);
  }

  return Object.freeze({ major, minor });
}
