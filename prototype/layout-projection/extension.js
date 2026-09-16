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
    description: 'Uses the built-in New Group Below command',
    tree: {
      type: 'split', direction: 'down', ratio: 0.5,
      first: { type: 'pane', label: 'coding agent' },
      second: { type: 'pane', label: 'tests' },
    },
  },
  {
    label: 'Mixed tree + ratios',
    description: 'Recreates right/down nesting; ratios remain unsupported',
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function bindTargets(node, targets, cursor = { index: 0 }) {
  if (node.type === 'pane') {
    return { ...node, target: targets?.[cursor.index++] };
  }
  return {
    ...node,
    first: bindTargets(node.first, targets, cursor),
    second: bindTargets(node.second, targets, cursor),
  };
}

function terminalIdentity(fixture, session, node) {
  return node.target ? `${session}:${node.target}` : `fixture:${fixture.label}:${node.label}`;
}

async function createPaneSurface(fixture, node, binary, session) {
  const identity = terminalIdentity(fixture, session, node);
  const pty = node.target
    ? new HerdrObserverPseudoterminal({ binary, session, target: node.target })
    : new MockPanePseudoterminal(node.label);
  const viewColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
  const terminal = vscode.window.createTerminal({
    name: node.target ? `Herdr ${node.target} (read-only)` : `Fixture: ${node.label}`,
    pty,
    location: { viewColumn, preserveFocus: false },
    isTransient: true,
  });
  ownedTerminals.set(identity, terminal);
  terminal.show(false);
  output.info(`opened ${identity} in active viewColumn=${viewColumn}`);
  await delay(150);
  return terminal;
}

async function createAdjacentGroup(direction) {
  const command = direction === 'down'
    ? 'workbench.action.newGroupBelow'
    : 'workbench.action.newGroupRight';
  const available = await vscode.commands.getCommands(true);
  if (!available.includes(command)) {
    throw new Error(`Required built-in command is unavailable: ${command}`);
  }

  const beforeCount = vscode.window.tabGroups.all.length;
  const beforeColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
  output.info(`execute ${command} from viewColumn=${beforeColumn}`);
  await vscode.commands.executeCommand(command);
  await delay(150);

  const afterCount = vscode.window.tabGroups.all.length;
  const afterColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
  if (afterCount <= beforeCount) {
    throw new Error(`${command} did not create an editor group (before=${beforeCount}, after=${afterCount})`);
  }
  output.info(`${command} created active viewColumn=${afterColumn}`);
}

async function projectNode(fixture, node, binary, session) {
  if (node.type === 'pane') return createPaneSurface(fixture, node, binary, session);

  const firstAnchor = await projectNode(fixture, node.first, binary, session);
  firstAnchor.show(false);
  await delay(100);
  await createAdjacentGroup(node.direction);
  await projectNode(fixture, node.second, binary, session);
  return firstAnchor;
}

async function projectLayout(fixture, targets) {
  const before = snapshotEditorState();
  logSnapshot(`BEFORE ${fixture.label}`, before);

  if (containsNonHalfRatio(fixture.tree)) {
    output.warn('Herdr split ratios are recorded but cannot be applied through VS Code commands.');
  }

  const config = vscode.workspace.getConfiguration('herdrPrototype');
  const session = config.get('session', '').trim();
  const binary = config.get('binary', 'herdr').trim() || 'herdr';
  const tree = bindTargets(fixture.tree, targets);
  const identities = [];
  const collectIdentities = (node) => {
    if (node.type === 'pane') identities.push(terminalIdentity(fixture, session, node));
    else {
      collectIdentities(node.first);
      collectIdentities(node.second);
    }
  };
  collectIdentities(tree);

  for (const identity of identities) {
    const existing = ownedTerminals.get(identity);
    if (existing && !vscode.window.terminals.includes(existing)) ownedTerminals.delete(identity);
  }
  const existing = identities.map((identity) => ownedTerminals.get(identity)).filter(Boolean);
  if (existing.length > 0) {
    existing[0].show(false);
    void vscode.window.showInformationMessage(
      'This fixture already has open surfaces. Close Layout Surfaces before rebuilding its editor-group topology.',
    );
    return;
  }

  try {
    const firstAnchor = await projectNode(fixture, tree, binary, session);
    firstAnchor.show(false);
  } catch (error) {
    output.error(`projection failed: ${error.message}`);
    void vscode.window.showErrorMessage(`Layout projection failed: ${error.message}`);
  }

  await delay(750);
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
