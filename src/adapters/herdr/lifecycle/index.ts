/**
 * Herdr lifecycle adapter public entry point.
 *
 * Inspection uses bounded one-shot CLI calls and maps process/protocol failures
 * to discovery states. Starting invokes the official headless Herdr server for
 * the selected Session; this module never owns a daemon or persistence layer.
 */
export type {
  ProcessResult,
  ProcessRunner,
} from "./internal/process-runner.js";
export { createNodeProcessRunner } from "./internal/process-runner.js";
export { createHerdrLifecycleAdapter } from "./internal/herdr-lifecycle-adapter.js";
