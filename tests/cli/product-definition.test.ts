import assert from "node:assert/strict";
import test from "node:test";

import { parseCanonicalJsonBytes } from "../../src/domain/canonical-json.ts";
import { runProductDefinition } from "../../src/cli/product-definition.ts";
import type { ProcessIoAdapter } from "../../src/adapters/node/process-io.ts";

function fakeIo(input: string, args: readonly string[] = []) {
  const output: string[] = [];
  const diagnostics: string[] = [];
  const exitCodes: number[] = [];
  const io: ProcessIoAdapter = {
    args,
    async readInput() { return Buffer.from(input, "utf8"); },
    writeOutput(value) { output.push(value); },
    writeDiagnostic(value) { diagnostics.push(value); },
    setExitCode(code) { exitCodes.push(code); },
  };
  return { io, output, diagnostics, exitCodes };
}

test("产品定义 CLI 对非 JCS 输入和参数注入只输出一个不含原值的失败回执", async () => {
  for (const { io, output, diagnostics, exitCodes } of [
    fakeIo('{"not":"canonical","z":1,"a":2}'),
    fakeIo('{"authorization":"Bearer secret-value-not-to-echo"}', ["--signed=true"]),
  ]) {
    await runProductDefinition(io);
    assert.equal(output.length, 1);
    const receipt = parseCanonicalJsonBytes(Buffer.from(output[0]!, "utf8")) as Record<string, unknown>;
    assert.equal(receipt.ok, false);
    assert.equal(receipt.code === "PRODUCT_DEFINITION_REJECTED" || receipt.code === "SENSITIVE_FIELD_DETECTED", true);
    assert.equal(exitCodes.length, 1);
    assert.equal(diagnostics.length, 1);
    assert.doesNotMatch(`${output.join("\n")}${diagnostics.join("\n")}`, /secret-value-not-to-echo/);
  }
});
