import * as assert from "node:assert/strict";
import * as vscode from "vscode";

suite("Herdr extension", () => {
  test("activates and registers lifecycle recovery commands", async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");

    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("herdr.showStatusActions"));
    assert.ok(commands.includes("herdr.retryDiscovery"));
    assert.ok(commands.includes("herdr.start"));
    assert.ok(commands.includes("herdr.selectExecutable"));
    assert.ok(commands.includes("herdr.openSettings"));
  });
});
