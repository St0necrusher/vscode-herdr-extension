import { execFile, spawn } from "node:child_process";

export type ProcessResult = Readonly<{ stdout: string; stderr: string }>;

export interface ProcessRunner {
  run(executable: string, args: readonly string[]): Promise<ProcessResult>;
  spawnDetached(executable: string, args: readonly string[]): Promise<void>;
}

export function createNodeProcessRunner(): ProcessRunner {
  return {
    run(executable, args) {
      return new Promise((resolve, reject) => {
        execFile(
          executable,
          [...args],
          { encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              const processError = Object.assign(
                new Error(error.message, { cause: error }),
                { code: error.code, stdout, stderr },
              );
              reject(processError);
              return;
            }
            resolve({ stdout, stderr });
          },
        );
      });
    },
    spawnDetached(executable, args) {
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
    },
  };
}
