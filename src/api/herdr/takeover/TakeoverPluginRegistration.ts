import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Logger } from "@core/logger";
import type { HerdrExecutableSource } from "./herdrExecutableSource";

export const TAKEOVER_PLUGIN_ID = "st0necrusher.vscode-herdr-takeover";

const PLUGIN_MANIFEST = "herdr-plugin.toml";

export class TakeoverPluginRegistration {
  private registered = false;

  constructor(
    private readonly configuration: HerdrExecutableSource,
    private readonly logger: Logger,
    private readonly packagedPluginDirectory: string,
    private readonly copiedPluginDirectory: string,
  ) {}

  async initialize(): Promise<void> {
    try {
      const output = await this.runHerdr(["plugin", "list", "--json"]);
      this.registered = pluginListContains(output);
      if (this.registered) {
        const packagedVersion = await readManifestVersion(this.packagedPluginDirectory);
        const copiedVersion = await readManifestVersion(this.copiedPluginDirectory);
        if (packagedVersion !== copiedVersion) await this.refreshRegisteredPlugin();
      } else {
        this.logger.info(
          'Mobile Takeover plugin is not registered; run "Herdr: Install Mobile Takeover Plugin" to enable it.',
        );
      }
    } catch (error) {
      this.logger.error("Could not initialize Mobile Takeover plugin registration", error);
    }
  }

  isRegistered(): boolean {
    return this.registered;
  }

  async install(): Promise<void> {
    await executeFile("node", ["--version"]);
    if (this.registered) {
      await this.runHerdr(["plugin", "unlink", TAKEOVER_PLUGIN_ID]);
      this.registered = false;
    }
    await this.copyPackagedPlugin();
    await this.runHerdr(["plugin", "link", this.copiedPluginDirectory]);
    this.registered = true;
  }

  async remove(): Promise<void> {
    if (this.registered) {
      await this.runHerdr(["plugin", "unlink", TAKEOVER_PLUGIN_ID]);
      this.registered = false;
    }
    await rm(this.copiedPluginDirectory, { recursive: true, force: true });
  }

  private async refreshRegisteredPlugin(): Promise<void> {
    await this.runHerdr(["plugin", "unlink", TAKEOVER_PLUGIN_ID]);
    this.registered = false;
    await this.copyPackagedPlugin();
    await this.runHerdr(["plugin", "link", this.copiedPluginDirectory]);
    this.registered = true;
  }

  private async copyPackagedPlugin(): Promise<void> {
    await mkdir(dirname(this.copiedPluginDirectory), { recursive: true });
    await rm(this.copiedPluginDirectory, { recursive: true, force: true });
    await cp(this.packagedPluginDirectory, this.copiedPluginDirectory, { recursive: true });
  }

  private runHerdr(args: string[]): Promise<string> {
    return executeFile(this.configuration.read().executable, args);
  }
}

function executeFile(executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error !== null) {
        const reason = stderr.trim();
        reject(new Error(reason || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function readManifestVersion(directory: string): Promise<string | undefined> {
  const manifest = await readFile(join(directory, PLUGIN_MANIFEST), "utf8");
  return /^version\s*=\s*"([^"]+)"/m.exec(manifest)?.[1];
}

interface PluginListResponse {
  result: { plugins: { plugin_id: string }[] };
}

function pluginListContains(output: string): boolean {
  const response = JSON.parse(output) as PluginListResponse;
  return response.result.plugins.some((plugin) => plugin.plugin_id === TAKEOVER_PLUGIN_ID);
}
