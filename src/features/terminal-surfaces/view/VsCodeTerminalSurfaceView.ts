import * as vscode from "vscode";
export class VsCodeTerminalSurfaceView implements vscode.Disposable {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly openEmitter = new vscode.EventEmitter<vscode.TerminalDimensions | undefined>();
  private readonly closeEmitter = new vscode.EventEmitter<void>();
  private readonly inputEmitter = new vscode.EventEmitter<void>();
  private readonly activeEmitter = new vscode.EventEmitter<boolean>();
  private readonly hostSubscriptions: vscode.Disposable[];
  private readonly terminal: vscode.Terminal;
  private active = false;
  private closedByHost = false;
  private disposed = false;

  readonly onDidOpen = this.openEmitter.event;
  readonly onDidClose = this.closeEmitter.event;
  readonly onDidInput = this.inputEmitter.event;
  readonly onDidChangeActive = this.activeEmitter.event;

  constructor(name: string) {
    const pty: vscode.Pseudoterminal = {
      onDidWrite: this.writeEmitter.event,
      open: (dimensions) => this.openEmitter.fire(dimensions),
      close: () => {
        if (this.disposed) return;
        this.closedByHost = true;
        this.closeEmitter.fire();
      },
      handleInput: () => this.inputEmitter.fire(),
    };
    this.terminal = vscode.window.createTerminal({
      name: `Herdr: ${name}`,
      pty,
      location: vscode.TerminalLocation.Editor,
      isTransient: true,
    });
    this.hostSubscriptions = [
      vscode.window.onDidChangeActiveTerminal(() => this.updateActive()),
      vscode.window.tabGroups.onDidChangeTabs(() => this.updateActive()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.updateActive()),
    ];
    this.updateActive();
  }

  show(): void {
    if (this.disposed) return;
    this.terminal.show();
    this.updateActive();
  }

  write(ansi: string): void {
    if (!this.disposed && ansi.length > 0) this.writeEmitter.fire(ansi);
  }

  writeStatus(message: string): void {
    this.write(`\r\n\x1b[2m[${message}]\x1b[0m\r\n`);
  }

  reset(): void {
    this.write("\x1b[3J\x1b[2J\x1b[H");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const subscription of this.hostSubscriptions) subscription.dispose();
    if (!this.closedByHost) this.terminal.dispose();
    this.writeEmitter.dispose();
    this.openEmitter.dispose();
    this.closeEmitter.dispose();
    this.inputEmitter.dispose();
    this.activeEmitter.dispose();
  }

  private updateActive(): void {
    const group = vscode.window.tabGroups.activeTabGroup;
    const tab = group.activeTab;
    const active =
      tab?.isActive === true &&
      tab.group.isActive &&
      tab.input instanceof vscode.TabInputTerminal &&
      vscode.window.activeTerminal === this.terminal;
    if (active === this.active) return;
    this.active = active;
    this.activeEmitter.fire(active);
  }
}
