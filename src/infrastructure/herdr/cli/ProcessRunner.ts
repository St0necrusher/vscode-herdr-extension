import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProcessResult = Readonly<{ stdout: string; stderr: string }>;

export interface ProcessRunner {
  run(executable: string, args: readonly string[]): Promise<ProcessResult>;
  spawnDetached(executable: string, args: readonly string[]): Promise<void>;
}

export class NodeProcessRunner implements ProcessRunner {
  async run(executable: string, args: readonly string[]): Promise<ProcessResult> {
    return await execFileAsync(executable, [...args], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
  }

  async spawnDetached(executable: string, args: readonly string[]): Promise<void> {
    const child = spawn(executable, [...args], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    await once(child, "spawn");
    child.unref();
  }
}
