import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HerdrLogger } from "../../../src/capabilities/runtime";
import type { HerdrConfigurationSource } from "../../../src/capabilities/sessions";
import { TakeoverPluginRegistration } from "../../../src/infrastructure/pane-editors/takeover/TakeoverPluginRegistration";

const vscodeMock = vi.hoisted(() => {
  const commandHandlers = new Map<string, (...args: unknown[]) => unknown>();
  const registerCommand = vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
    commandHandlers.set(id, handler);
    return { dispose: vi.fn() };
  });
  const showInformationMessage = vi.fn(() => Promise.resolve(undefined));
  const showErrorMessage = vi.fn(() => Promise.resolve(undefined));

  return {
    commandHandlers,
    commands: { registerCommand },
    Disposable: {
      from: (...disposables: { dispose(): void }[]) => ({
        dispose: () => disposables.forEach((disposable) => disposable.dispose()),
      }),
    },
    window: { showInformationMessage, showErrorMessage },
    reset(): void {
      commandHandlers.clear();
      registerCommand.mockClear();
      showInformationMessage.mockClear();
      showErrorMessage.mockClear();
    },
  };
});

vi.mock("vscode", () => vscodeMock);

const TAKEOVER_PLUGIN_ID = "st0necrusher.vscode-herdr-takeover";
const logger: HerdrLogger = { info: () => undefined, error: () => undefined, show: () => undefined };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vscodeMock.reset();
});

type FixtureOptions = Readonly<{
  pluginRegistered: boolean;
  packagedVersion: string;
  copiedVersion?: string;
  linkFailure?: string;
}>;

interface RegistrationFixture {
  readonly copyDirectory: string;
  readonly invocationLogPath: string;
  readonly pluginListPath: string;
  createRegistration(): TakeoverPluginRegistration;
}

async function createFixture(options: FixtureOptions): Promise<RegistrationFixture> {
  const directory = await mkdtemp(join(tmpdir(), "herdr-takeover-registration-"));
  temporaryDirectories.push(directory);

  const packageDirectory = join(directory, "packaged-plugin");
  const copyDirectory = join(directory, "copied-plugin");
  const executable = join(directory, "herdr");
  const invocationLogPath = join(directory, "herdr-invocations.jsonl");
  const pluginListPath = join(directory, "plugin-list.json");
  const linkFailurePath = join(directory, "link-failure.txt");

  await writePlugin(packageDirectory, options.packagedVersion, "packaged popup");
  if (options.copiedVersion !== undefined) {
    await writePlugin(copyDirectory, options.copiedVersion, "old copied popup");
  }
  await writeFile(pluginListPath, pluginListResponse(options.pluginRegistered));
  await writeFile(invocationLogPath, "");
  if (options.linkFailure !== undefined) await writeFile(linkFailurePath, options.linkFailure);

  const source = `#!/usr/bin/env node
const fs = require("node:fs");
const recordPath = ${JSON.stringify(invocationLogPath)};
const pluginListPath = ${JSON.stringify(pluginListPath)};
const linkFailurePath = ${JSON.stringify(linkFailurePath)};
const args = process.argv.slice(2);
fs.appendFileSync(recordPath, JSON.stringify(args) + "\\n");
const isPluginList = args.join(" ") === "plugin list --json";
if (isPluginList) {
  process.stdout.write(fs.readFileSync(pluginListPath, "utf8"));
} else {
  const shouldFailLink = args.slice(0, 2).join(" ") === "plugin link" && fs.existsSync(linkFailurePath);
  if (shouldFailLink) {
    process.stderr.write(fs.readFileSync(linkFailurePath, "utf8"));
    process.exitCode = 1;
  }
}
`;
  await writeFile(executable, source, "utf8");
  await chmod(executable, 0o755);

  return {
    copyDirectory,
    invocationLogPath,
    pluginListPath,
    createRegistration: () =>
      new TakeoverPluginRegistration(
        {
          read: () => ({ executable, session: "default" }),
          onDidChange: () => ({ dispose: () => undefined }),
        } satisfies HerdrConfigurationSource,
        logger,
        packageDirectory,
        copyDirectory,
      ),
  };
}

async function writePlugin(directory: string, version: string, popupContents: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "herdr-plugin.toml"),
    `id = "${TAKEOVER_PLUGIN_ID}"\nversion = "${version}"\n`,
    "utf8",
  );
  await writeFile(join(directory, "takeover-popup.js"), popupContents, "utf8");
}

function pluginListResponse(pluginRegistered: boolean): string {
  const plugins = pluginRegistered ? [{ plugin_id: TAKEOVER_PLUGIN_ID }] : [];
  return JSON.stringify({ result: { plugins } });
}

async function readInvocations(fixture: RegistrationFixture): Promise<string[][]> {
  const contents = await readFile(fixture.invocationLogPath, "utf8");
  if (contents.length === 0) return [];
  return contents
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
}

async function runRegisteredCommand(commandId: string): Promise<void> {
  const handler = vscodeMock.commandHandlers.get(commandId);
  expect(handler).toBeDefined();
  await handler?.();
}

describe("TakeoverPluginRegistration adapter integration", () => {
  it("O1 activation refreshes a registered plugin only when its packaged version changes", async () => {
    const fixture = await createFixture({
      pluginRegistered: true,
      packagedVersion: "2.0.0",
      copiedVersion: "1.0.0",
    });

    const upgradedRegistration = fixture.createRegistration();
    await upgradedRegistration.initialize();

    expect(upgradedRegistration.isRegistered()).toBe(true);
    expect(await readInvocations(fixture)).toEqual([
      ["plugin", "list", "--json"],
      ["plugin", "unlink", TAKEOVER_PLUGIN_ID],
      ["plugin", "link", fixture.copyDirectory],
    ]);
    await expect(readFile(join(fixture.copyDirectory, "herdr-plugin.toml"), "utf8")).resolves.toContain(
      'version = "2.0.0"',
    );
    await expect(readFile(join(fixture.copyDirectory, "takeover-popup.js"), "utf8")).resolves.toBe("packaged popup");

    await writeFile(fixture.invocationLogPath, "");
    const equalVersionRegistration = fixture.createRegistration();
    await equalVersionRegistration.initialize();

    expect(equalVersionRegistration.isRegistered()).toBe(true);
    expect(await readInvocations(fixture)).toEqual([["plugin", "list", "--json"]]);

    await writeFile(fixture.invocationLogPath, "");
    await writeFile(fixture.pluginListPath, pluginListResponse(false));
    const missingRegistration = fixture.createRegistration();
    await missingRegistration.initialize();

    expect(missingRegistration.isRegistered()).toBe(false);
    expect(await readInvocations(fixture)).toEqual([["plugin", "list", "--json"]]);
  });

  it("O2 install and remove commands link and unlink the copied plugin", async () => {
    const fixture = await createFixture({ pluginRegistered: false, packagedVersion: "1.0.0" });
    const registration = fixture.createRegistration();

    await runRegisteredCommand("herdr.installMobileTakeoverPlugin");

    expect(registration.isRegistered()).toBe(true);
    expect(await readInvocations(fixture)).toEqual([["plugin", "link", fixture.copyDirectory]]);
    await expect(readFile(join(fixture.copyDirectory, "herdr-plugin.toml"), "utf8")).resolves.toContain(
      'version = "1.0.0"',
    );
    await expect(readFile(join(fixture.copyDirectory, "takeover-popup.js"), "utf8")).resolves.toBe("packaged popup");
    expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith("Mobile Takeover Plugin installed.");

    await runRegisteredCommand("herdr.removeMobileTakeoverPlugin");

    expect(registration.isRegistered()).toBe(false);
    expect(await readInvocations(fixture)).toEqual([
      ["plugin", "link", fixture.copyDirectory],
      ["plugin", "unlink", TAKEOVER_PLUGIN_ID],
    ]);
    expect(existsSync(fixture.copyDirectory)).toBe(false);
    expect(vscodeMock.window.showInformationMessage).toHaveBeenCalledWith("Mobile Takeover Plugin removed.");
  });

  it("O2 install reports a plugin-link failure and remains unregistered", async () => {
    const fixture = await createFixture({
      pluginRegistered: false,
      packagedVersion: "1.0.0",
      linkFailure: "plugin link rejected",
    });
    const registration = fixture.createRegistration();

    await runRegisteredCommand("herdr.installMobileTakeoverPlugin");

    expect(registration.isRegistered()).toBe(false);
    expect(await readInvocations(fixture)).toEqual([["plugin", "link", fixture.copyDirectory]]);
    expect(vscodeMock.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("plugin link rejected"));
  });
});
