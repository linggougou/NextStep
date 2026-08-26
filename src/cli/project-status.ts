import { isAbsolute } from "node:path";

import {
  ProjectStatusSourceError,
  readProjectStatusSource,
} from "../adapters/node/project-status-source.ts";
import { canonicalizeJson } from "../domain/canonical-json.ts";
import {
  createUnavailableProjectStatus,
  projectProjectStatus,
} from "../domain/project-status-projection.ts";

function projectRoot(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== "--project-root" || !args[1] || !isAbsolute(args[1])) {
    throw new ProjectStatusSourceError("INVALID_PROJECT_ROOT");
  }
  return args[1];
}

async function main(): Promise<void> {
  try {
    const projection = projectProjectStatus(await readProjectStatusSource(projectRoot(process.argv.slice(2))));
    process.stdout.write(canonicalizeJson(projection));
    if (projection.status === "unavailable") {
      process.stderr.write(`PROJECT_STATUS_UNAVAILABLE:${projection.unavailable_reasons[0] ?? "unknown"}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    const reason = error instanceof ProjectStatusSourceError ? error.code.toLowerCase().replaceAll("_", "-") : "source-unavailable";
    process.stdout.write(canonicalizeJson(createUnavailableProjectStatus(reason)));
    process.stderr.write(`PROJECT_STATUS_UNAVAILABLE:${reason}\n`);
    process.exitCode = 1;
  }
}

await main();
