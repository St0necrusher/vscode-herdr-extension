import { execFile, spawn } from "node:child_process";

export type ProcessResult = Readonly<{ stdout: string; stderr: string }>;

export interface ProcessRunner {
  run(executable: string, args: readonly string[]): Promise<ProcessResult>;
  spawnDetached(executable: string, args: readonly string[]): Promise<void>;
}

export class NodeProcessRunner implements ProcessRunner {
  run(executable: string, args: readonly string[]): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      execFile(
        executable,
        [...args],
        { encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              Object.assign(new Error(error.message, { cause: error }), {
                code: error.code,
                stdout,
                stderr,
              }),
            );
            return;
          }
          resolve({ stdout, stderr });
        },
      );
    });
  }

  spawnDetached(executable: string, args: readonly string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.removeListener("error", reject);
        child.unref();
        resolve();
      });
    });
  }
}
