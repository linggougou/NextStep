export interface ProcessIoAdapter {
  readonly args: readonly string[];
  readInput(): Promise<string>;
  writeOutput(value: string): void;
  writeDiagnostic(value: string): void;
  setExitCode(code: number): void;
}

export function createProcessIoAdapter(
  currentProcess: NodeJS.Process = process,
): ProcessIoAdapter {
  return {
    args: currentProcess.argv.slice(2),
    async readInput(): Promise<string> {
      const chunks: Buffer[] = [];
      for await (const chunk of currentProcess.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }

      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      } catch {
        throw new SyntaxError("Invalid UTF-8 input");
      }
    },
    writeOutput(value: string): void {
      currentProcess.stdout.write(value);
    },
    writeDiagnostic(value: string): void {
      currentProcess.stderr.write(value);
    },
    setExitCode(code: number): void {
      currentProcess.exitCode = code;
    },
  };
}
