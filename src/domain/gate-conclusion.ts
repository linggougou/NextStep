export const GATE_CONCLUSIONS = ["通过", "退回", "需讨论", "阻塞"] as const;

export type GateConclusion = (typeof GATE_CONCLUSIONS)[number];

const GATE_CONCLUSION_SET = new Set<unknown>(GATE_CONCLUSIONS);

export function parseGateConclusion(value: unknown): GateConclusion {
  if (!GATE_CONCLUSION_SET.has(value)) {
    throw new TypeError("Invalid gate conclusion state");
  }

  return value as GateConclusion;
}
