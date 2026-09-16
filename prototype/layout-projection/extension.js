'use strict';

// THROWAWAY PROTOTYPE. Evidence for wayfinding issue #5, not production code.

const vscode = require('vscode');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

const output = vscode.window.createOutputChannel('Herdr Layout Projection Prototype', { log: true });
const ownedTerminals = new Map();

const fixtures = [
  {
    label: 'Single Pane',
    description: 'One terminal in the active editor group',
    tree: { type: 'pane', label: 'coding agent' },
  },
  {
    label: 'Right split',
    description: 'Two leaves mapped to adjacent editor columns',
    tree: {
      type: 'split', direction: 'right', ratio: 0.5,
      first: { type: 'pane', label: 'coding agent' },
      second: { type: 'pane', label: 'tests' },
    },
  },
  {
    label: 'Down split',
    description: 'Unsupported row split; leaves fall back to tabs in one group',
    tree: {
      type: 'split', direction: 'down', ratio: 0.5,
      first: { type: 'pane', label: 'coding agent' },
      second: { type: 'pane', label: 'tests' },
    },
  },
  {
    label: 'Mixed tree + ratios',
    description: 'Right branch plus nested down split; ratios cannot be imposed',
    tree: {
      type: 'split', direction: 'right', ratio: 0.62,
      first: { type: 'pane', label: 'coding agent' },
      second: {
        type: 'split', direction: 'down', ratio: 0.7,
        first: { type: 'pane', label: 'tests' },
        second: { type: 'pane', label: 'server' },
      },
    },
  },
];

class MockPanePseudoterminal {
  constructor(label) {
    this.label = label;
    this.writeEmitter = new vscode.EventEmitter();
    this.onDidWrite = this.writeEmitter.event;
  }

  open(dimensions) {
    const size = dimensions ? `${dimensions.columns}x${dimensions.rows}` : 'unknown';
    this.writeEmitter.fire(
      `\x1b[2J\x1b[H\x1b[1;36mHerdr layout projection fixture\x1b[0m\r\n` +
      `Pane: ${this.label}\r\n` +
      `Initial VS Code terminal dimensions: ${size}\r\n\r\n` +
      'This is a static Pane surface. Use the real-Pane command to verify Herdr rendering.\r\n',
    );
  }

  close() {
    this.writeEmitter.dispose();
  }

  handleInput(data) {
    this.writeEmitter.fire(`\r\n\x1b[33m[fixture is read-only; ignored ${JSON.stringify(data)}]\x1b[0m\r\n`);
  }
}

class HerdrObserverPseudoterminal {
  constructor({ binary, session, target }) {
    this.binary = binary;
    this.session = session;
    this.target = target;
    this.dimensions = { columns: 120, rows: 40 };
    this.child = undefined;
    this.closed = false;
    this.remainder = '';
    this.decoder = new StringDecoder('utf8');
    this.writeEmitter = new vscode.EventEmitter();
    this.onDidWrite = this.writeEmitter.event;
  }

  open(dimensions) {
    if (dimensions) this.dimensions = dimensions;
    const args = [];
    if (this.session) args.push('--session', this.session);
    args.push(
      'terminal', 'session', 'observe', this.target,
      '--cols', String(this.dimensions.columns),
      '--rows', String(this.dimensions.rows),
    );
    output.info(`spawn ${this.binary} ${args.join(' ')}`);
    const child = spawn(this.binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    child.stdout.on('data', (chunk) => this.consume(chunk));
    child.stderr.on('data', (chunk) => {
      const message = chunk.toString('utf8').trimEnd();
      output.error(message);
      this.writeEmitter.fire(`\r\n\x1b[31m[Herdr observer error] ${message}\x1b[0m\r\n`);
    });
    child.on('error', (error) => {
      output.error(error.message);
      this.writeEmitter.fire(`\r\n\x1b[31m[Could not start Herdr: ${error.message}]\x1b[0m\r\n`);
    });
    child.on('exit', (code, signal) => {
      if (!this.closed) {
        output.info(`observer ${this.target} exited code=${code} signal=${signal}`);
        this.writeEmitter.fire('\r\n\x1b[33m[Herdr observer closed]\x1b[0m\r\n');
      }
    });
  }

  consume(chunk) {
    this.remainder += chunk.toString('utf8');
    for (;;) {
      const newline = this.remainder.indexOf('\n');
      if (newline < 0) return;
      const line = this.remainder.slice(0, newline).trim();
      this.remainder = this.remainder.slice(newline + 1);
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (record.type === 'terminal.frame') {
          this.writeEmitter.fire(this.decoder.write(Buffer.from(record.bytes, 'base64')));
        } else if (record.type === 'terminal.closed') {
          output.info(`observer ${this.target} closed: ${record.reason ?? 'no reason'}`);
        }
      } catch (error) {
        output.error(`invalid NDJSON: ${error.message}; ${line}`);
      }
    }
  }

  close() {
    this.closed = true;
    this.child?.kill('SIGTERM');
    this.child = undefined;
    this.writeEmitter.dispose();
  }

  handleInput() {
    this.writeEmitter.fire('\r\n\x1b[33m[layout projection opens read-only observers]\x1b[0m\r\n');
  }
}

function assignColumns(node, column, leaves) {
  if (node.type === 'pane') {
    leaves.push({ ...node, column });
    return column;
  }
  if (node.direction === 'down') {
    assignColumns(node.first, column, leaves);
    assignColumns(node.second, column, leaves);
    return column;
  }
  const afterFirst = assignColumns(node.first, column, leaves);
  return assignColumns(node.second, afterFirst + 1, leaves);
}

function describeInput(input) {
  if (input instanceof vscode.TabInputText) return { type: 'text', uri: input.uri.toString() };
  if (input instanceof vscode.TabInputTextDiff) {
    return { type: 'text-diff', original: input.original.toString(), modified: input.modified.toString() };
  }
  if (input instanceof vscode.TabInputTerminal) return { type: 'terminal' };
  if (input instanceof vscode.TabInputWebview) return { type: 'webview', viewType: input.viewType };
  return { type: input?.constructor?.name ?? 'unknown' };
}

function snapshotEditorState() {
  return vscode.window.tabGroups.all.map((group) => ({
    viewColumn: group.viewColumn,
    active: group.isActive,
    tabs: group.tabs.map((tab) => ({
      label: tab.label,
      active: tab.isActive,
      dirty: tab.isDirty,
      pinned: tab.isPinned,
      input: describeInput(tab.input),
    })),
  }));
}

function logSnapshot(label, snapshot) {
  output.info(`${label}:\n${JSON.stringify(snapshot, null, 2)}`);
}

function fileEditorRecords(snapshot) {
  return snapshot.flatMap((group) => group.tabs
    .filter((tab) => tab.input.type !== 'terminal')
    .map((tab) => ({
      viewColumn: group.viewColumn,
      label: tab.label,
      dirty: tab.dirty,
      pinned: tab.pinned,
      input: tab.input,
    })))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function reportFileEditorPreservation(before, after) {
  const previous = fileEditorRecords(before);
  const current = fileEditorRecords(after);
  if (JSON.stringify(previous) === JSON.stringify(current)) {
    output.info('PASS: existing non-terminal editor tabs stayed in the same columns with unchanged dirty/pinned state');
    return;
  }
  output.error(`FAIL: existing non-terminal editor state changed\nBEFORE FILES:\n${JSON.stringify(previous, null, 2)}\nAFTER FILES:\n${JSON.stringify(current, null, 2)}`);
  void vscode.window.showErrorMessage('Layout projection changed existing file-editor placement or state. See the prototype Output channel.');
}

function containsDownSplit(node) {
  return node.type === 'split' && (node.direction === 'down' || containsDownSplit(node.first) || containsDownSplit(node.second));
}

function containsNonHalfRatio(node) {
  return node.type === 'split' && (node.ratio !== 0.5 || containsNonHalfRatio(node.first) || containsNonHalfRatio(node.second));
}

function leafCount(node) {
  return node.type === 'pane' ? 1 : leafCount(node.first) + leafCount(node.second);
}

async function openFixtureLayout() {
  const fixture = await vscode.window.showQuickPick(fixtures, {
    title: 'Open Herdr Tab Layout — placement fixture',
    placeHolder: 'Choose the Herdr BSP shape to project',
  });
  if (!fixture) return;
  await projectLayout(fixture, undefined);
}

async function openRealLayout() {
  const fixture = await vscode.window.showQuickPick(fixtures, {
    title: 'Open Herdr Tab Layout — real read-only Panes',
    placeHolder: 'Choose the shape; Pane targets are assigned in leaf order',
  });
  if (!fixture) return;

  const count = leafCount(fixture.tree);
  const value = await vscode.window.showInputBox({
    title: `${fixture.label}: enter ${count} existing Herdr Pane or terminal target${count === 1 ? '' : 's'}`,
    prompt: 'Comma-separated, in layout leaf order',
    placeHolder: count === 1 ? 'w1:p1' : Array.from({ length: count }, (_, index) => `w1:p${index + 1}`).join(', '),
    ignoreFocusOut: true,
    validateInput: (input) => input.split(',').map((item) => item.trim()).filter(Boolean).length === count
      ? undefined
      : `Enter exactly ${count} comma-separated target${count === 1 ? '' : 's'}`,
  });
  if (!value) return;
  await projectLayout(fixture, value.split(',').map((item) => item.trim()));
}

async function projectLayout(fixture, targets) {
  const before = snapshotEditorState();
  logSnapshot(`BEFORE ${fixture.label}`, before);

  const baseColumn = vscode.window.tabGroups.activeTabGroup.viewColumn ?? vscode.ViewColumn.One;
  const leaves = [];
  assignColumns(fixture.tree, baseColumn, leaves);

  if (containsDownSplit(fixture.tree)) {
    void vscode.window.showWarningMessage(
      'VS Code has no public API for creating a down-split editor group. Down-split leaves will open as tabs in the same column.',
    );
  }
  if (containsNonHalfRatio(fixture.tree)) {
    output.warn('Herdr split ratios are recorded but cannot be applied through the public VS Code API.');
  }

  const config = vscode.workspace.getConfiguration('herdrPrototype');
  const session = config.get('session', '').trim();
  const binary = config.get('binary', 'herdr').trim() || 'herdr';
  const opened = [];

  for (const [index, leaf] of leaves.entries()) {
    const target = targets?.[index];
    const identity = target ? `${session}:${target}` : `fixture:${fixture.label}:${leaf.label}`;
    const existing = ownedTerminals.get(identity);
    if (existing && !vscode.window.terminals.includes(existing)) ownedTerminals.delete(identity);
    if (ownedTerminals.has(identity)) {
      output.info(`reuse existing surface ${identity}; public API cannot move it to column ${leaf.column}`);
      opened.push(ownedTerminals.get(identity));
      continue;
    }

    const pty = target
      ? new HerdrObserverPseudoterminal({ binary, session, target })
      : new MockPanePseudoterminal(leaf.label);
    const viewColumn = Math.min(leaf.column, vscode.ViewColumn.Nine);
    const terminal = vscode.window.createTerminal({
      name: target ? `Herdr ${target} (read-only)` : `Fixture: ${leaf.label}`,
      pty,
      location: { viewColumn, preserveFocus: true },
      isTransient: true,
    });
    ownedTerminals.set(identity, terminal);
    opened.push(terminal);
    output.info(`opened ${identity} in requested viewColumn=${viewColumn}`);
  }

  // The action intentionally focuses its first Pane but does not close, move, or
  // replace any existing file editor. All other creation requests preserve focus.
  opened[0]?.show(false);
  await new Promise((resolve) => setTimeout(resolve, 750));
  const after = snapshotEditorState();
  logSnapshot(`AFTER ${fixture.label}`, after);
  reportFileEditorPreservation(before, after);
  output.show(true);
}

async function auditEditorState() {
  logSnapshot('EDITOR STATE AUDIT', snapshotEditorState());
  output.show(true);
}

async function closePrototypeSurfaces() {
  const terminals = [...new Set(ownedTerminals.values())];
  ownedTerminals.clear();
  for (const terminal of terminals) terminal.dispose();
  output.info(`disposed ${terminals.length} prototype-owned terminal surface(s); no Herdr Pane close operation was sent`);
}

function activate(context) {
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('herdrPrototype.openLayoutFixture', openFixtureLayout),
    vscode.commands.registerCommand('herdrPrototype.openRealLayout', openRealLayout),
    vscode.commands.registerCommand('herdrPrototype.auditEditorState', auditEditorState),
    vscode.commands.registerCommand('herdrPrototype.closeLayoutSurfaces', closePrototypeSurfaces),
    vscode.window.onDidCloseTerminal((terminal) => {
      for (const [identity, owned] of ownedTerminals) {
        if (owned === terminal) ownedTerminals.delete(identity);
      }
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
