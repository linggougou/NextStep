export interface ProcessIoAdapter {
  readonly args: readonly string[];
  readInput(): Promise<Uint8Array>;
  writeOutput(value: string): void;
  writeDiagnostic(value: string): void;
  setExitCode(code: number): void;
}

export function createProcessIoAdapter(
  currentProcess: NodeJS.Process = process,
): ProcessIoAdapter {
  return {
    args: currentProcess.argv.slice(2),
    async readInput(): Promise<Uint8Array> {
      const chunks: Buffer[] = [];
      for await (const chunk of currentProcess.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }

      return Buffer.concat(chunks);
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
