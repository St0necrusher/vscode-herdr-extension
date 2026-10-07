import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { Logger } from "@core/logger";
import type { HerdrConfigurationSource } from "@modules/sessions";

export const TAKEOVER_PLUGIN_ID = "st0necrusher.vscode-herdr-takeover";

const PLUGIN_MANIFEST = "herdr-plugin.toml";

export class TakeoverPluginRegistration implements vscode.Disposable {
  private registered = false;
  private readonly commands: vscode.Disposable;

  constructor(
    private readonly configuration: HerdrConfigurationSource,
    private readonly logger: Logger,
    private readonly packagedPluginDirectory: string,
    private readonly copiedPluginDirectory: string,
  ) {
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.installMobileTakeoverPlugin", () => this.install()),
      vscode.commands.registerCommand("herdr.removeMobileTakeoverPlugin", () => this.remove()),
    );
  }

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

  dispose(): void {
    this.commands.dispose();
  }

  private async install(): Promise<void> {
    try {
      await executeFile("node", ["--version"]);
      if (this.registered) {
        await this.runHerdr(["plugin", "unlink", TAKEOVER_PLUGIN_ID]);
        this.registered = false;
      }
      await this.copyPackagedPlugin();
      await this.runHerdr(["plugin", "link", this.copiedPluginDirectory]);
      this.registered = true;
      await vscode.window.showInformationMessage("Mobile Takeover Plugin installed.");
    } catch (error) {
      await this.showCommandError("install", error);
    }
  }

  private async remove(): Promise<void> {
    try {
      if (this.registered) {
        await this.runHerdr(["plugin", "unlink", TAKEOVER_PLUGIN_ID]);
        this.registered = false;
      }
      await rm(this.copiedPluginDirectory, { recursive: true, force: true });
      await vscode.window.showInformationMessage("Mobile Takeover Plugin removed.");
    } catch (error) {
      await this.showCommandError("remove", error);
    }
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

  private async showCommandError(operation: string, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Could not ${operation} Mobile Takeover Plugin`, error);
    await vscode.window.showErrorMessage(`Could not ${operation} Mobile Takeover Plugin: ${reason}`);
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
