import * as vscode from "vscode";
import {
  createHerdrLifecycleAdapter,
  createNodeProcessRunner,
} from "../adapters/herdr/lifecycle/index.js";
import { createVsCodeLifecycleAdapter } from "../adapters/vscode/lifecycle/index.js";
import { createLifecycleFeature } from "../features/lifecycle/index.js";

export async function composeExtension(): Promise<vscode.Disposable> {
  const ui = createVsCodeLifecycleAdapter();
  const lifecycle = createLifecycleFeature({
    herdr: createHerdrLifecycleAdapter({ runner: createNodeProcessRunner() }),
    settings: ui.settings,
    view: ui.view,
    logger: ui.logger,
  });

  ui.registerCommands({
    retry: () => lifecycle.retry(),
    start: () => lifecycle.start(),
  });

  const disposable = vscode.Disposable.from(lifecycle, ui);
  try {
    await lifecycle.activate();
    return disposable;
  } catch (error) {
    disposable.dispose();
    throw error;
  }
}
