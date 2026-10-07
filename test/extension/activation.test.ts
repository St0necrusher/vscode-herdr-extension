import * as assert from "node:assert/strict";
import * as vscode from "vscode";

suite("Herdr extension", () => {
  test("registers every contributed command", async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension);
    await extension.activate();
    const manifest = extension.packageJSON as {
      contributes: { commands: { command: string }[] };
    };
    const commands = await vscode.commands.getCommands(true);
    manifest.contributes.commands.forEach(({ command }) => {
      assert.ok(commands.includes(command), `Contributed command ${command} is registered`);
    });
  });

  test("activates and registers Space selection", async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("herdr.showStatusActions"));
    assert.ok(commands.includes("herdr.retryDiscovery"));
    assert.ok(commands.includes("herdr.start"));
    assert.ok(commands.includes("herdr.selectExecutable"));
    assert.ok(commands.includes("herdr.openSettings"));
    assert.ok(commands.includes("herdr.selectSession"));
    assert.ok(commands.includes("herdr.selectSpace"));
    assert.ok(commands.includes("herdr.refreshSessions"));
  });
});
