'use strict';

// THROWAWAY PROTOTYPE. This is evidence for a wayfinding decision, not production code.

const vscode = require('vscode');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

const output = vscode.window.createOutputChannel('Herdr Terminal Bridge Prototype', { log: true });
const automaticTerminals = new Map();

class HerdrPseudoterminal {
  constructor({ binary, session, target, mode, takeover }) {
    this.binary = binary;
    this.session = session;
    this.target = target;
    this.mode = mode;
    this.takeover = takeover;
    this.closedByUser = false;
    this.releaseTimer = undefined;
    this.protocolCloseReason = undefined;
    this.child = undefined;
    this.dimensions = { columns: 120, rows: 40 };
    this.reconnectAttempt = 0;
    this.reconnectAllowed = true;
    this.resetScreenOnNextFrame = false;
    this.stdoutRemainder = '';
    this.decoder = new StringDecoder('utf8');
    this.writeEmitter = new vscode.EventEmitter();
    this.closeEmitter = new vscode.EventEmitter();
    this.onDidWrite = this.writeEmitter.event;
    this.onDidClose = this.closeEmitter.event;
  }

  open(initialDimensions) {
    if (initialDimensions) {
      this.dimensions = initialDimensions;
    }
    this.startBridge();
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.releaseTimer);
    this.releaseChild();
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  handleInput(data) {
    if (this.mode !== 'control') {
      this.writeEmitter.fire('\r\n\x1b[33m[read-only: use “Open Pane with Control” to type]\x1b[0m\r\n');
      return;
    }
    this.send({ type: 'terminal.input', text: data });
  }

  setDimensions(dimensions) {
    this.dimensions = dimensions;
    if (this.mode === 'control') {
      this.send({
        type: 'terminal.resize',
        cols: dimensions.columns,
        rows: dimensions.rows,
      });
    }
  }

  focus() {
    clearTimeout(this.releaseTimer);
    this.releaseTimer = undefined;
    if (this.mode !== 'control') {
      output.info(`focus ${this.target}: take control`);
      this.switchBridge('control', true);
    }
  }

  blur(reason) {
    clearTimeout(this.releaseTimer);
    if (this.mode !== 'control') return;
    output.info(`blur ${this.target}: schedule release (${reason})`);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = undefined;
      if (!this.closedByUser && this.mode === 'control') {
        output.info(`release ${this.target}: ${reason}`);
        this.switchBridge('observe', false);
      }
    }, 500);
  }

  switchBridge(mode, takeover) {
    if (this.mode === mode && this.child) return;
    const oldChild = this.child;
    this.child = undefined;
    if (oldChild) {
      if (this.mode === 'control' && oldChild.stdin.writable) {
        oldChild.stdin.write(`${JSON.stringify({ type: 'terminal.release' })}\n`);
        oldChild.stdin.end();
      } else {
        oldChild.kill('SIGTERM');
      }
      const timer = setTimeout(() => oldChild.kill('SIGTERM'), 750);
      timer.unref();
    }
    this.mode = mode;
    this.takeover = takeover;
    this.protocolCloseReason = undefined;
    this.resetScreenOnNextFrame = true;
    setTimeout(() => {
      if (!this.closedByUser && !this.child) this.startBridge();
    }, 150);
  }

  startBridge() {
    this.reconnectAllowed = true;
    const args = [];
    if (this.session) {
      args.push('--session', this.session);
    }
    args.push('terminal', 'session', this.mode, this.target);
    if (this.takeover) {
      args.push('--takeover');
    }
    args.push('--cols', String(this.dimensions.columns), '--rows', String(this.dimensions.rows));

    this.stdoutRemainder = '';
    this.decoder = new StringDecoder('utf8');
    output.info(`spawn ${this.binary} ${args.join(' ')}`);

    const child = spawn(this.binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    child.stdout.on('data', (chunk) => {
      if (this.child === child) this.consumeStdout(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (this.child !== child) return;
      const message = chunk.toString('utf8').trimEnd();
      output.error(message);
      this.writeEmitter.fire(`\r\n\x1b[31m[Herdr bridge error] ${message}\x1b[0m\r\n`);
    });
    child.on('error', (error) => {
      output.error(`spawn failed: ${error.message}`);
      this.writeEmitter.fire(`\r\n\x1b[31m[Could not start Herdr: ${error.message}]\x1b[0m\r\n`);
    });
    child.on('exit', (code, signal) => this.onBridgeExit(child, code, signal));
  }

  consumeStdout(chunk) {
    this.stdoutRemainder += chunk.toString('utf8');
    for (;;) {
      const newline = this.stdoutRemainder.indexOf('\n');
      if (newline < 0) return;
      const line = this.stdoutRemainder.slice(0, newline).trim();
      this.stdoutRemainder = this.stdoutRemainder.slice(newline + 1);
      if (!line) continue;

      let record;
      try {
        record = JSON.parse(line);
      } catch (error) {
        output.error(`invalid NDJSON: ${error.message}; ${line}`);
        continue;
      }

      if (record.type === 'terminal.frame') {
        const bytes = Buffer.from(record.bytes, 'base64');
        this.reconnectAttempt = 0;
        if (this.resetScreenOnNextFrame) {
          // Herdr's full frame repaints a viewport using cursor-addressed ANSI,
          // but VS Code still retains the old Pseudoterminal screen/scrollback.
          // Clear that client-local history before installing the fresh frame.
          this.writeEmitter.fire('\x1b[3J\x1b[2J\x1b[H');
          this.resetScreenOnNextFrame = false;
        }
        this.writeEmitter.fire(this.decoder.write(bytes));
        output.debug(`frame seq=${record.seq} ${record.width}x${record.height} full=${record.full} bytes=${bytes.length}`);
      } else if (record.type === 'terminal.closed') {
        // A displaced controller returns to observation. A rejected manual
        // controller remains closed instead of retrying forever.
        this.protocolCloseReason = record.reason ?? 'no reason';
        this.reconnectAllowed = false;
        output.info(`stream closed: ${this.protocolCloseReason}`);
        if (!/taken over/i.test(this.protocolCloseReason)) {
          this.writeEmitter.fire(`\r\n\x1b[33m[Herdr closed the stream: ${this.protocolCloseReason}]\x1b[0m\r\n`);
        }
      } else {
        output.warn(`unknown record: ${line}`);
      }
    }
  }

  onBridgeExit(child, code, signal) {
    if (this.child !== child) return;
    this.child = undefined;
    output.info(`bridge exited code=${code} signal=${signal}`);
    if (this.closedByUser) return;
    if (!this.reconnectAllowed) {
      if (this.mode === 'control' && /taken over/i.test(this.protocolCloseReason ?? '')) {
        this.mode = 'observe';
        this.takeover = false;
        this.protocolCloseReason = undefined;
        this.resetScreenOnNextFrame = true;
        setTimeout(() => {
          if (!this.closedByUser && !this.child) this.startBridge();
        }, 150);
      }
      return;
    }

    // A fresh CLI process asks Herdr for a fresh full frame. This deliberately
    // proves reconnect at the supported CLI boundary rather than replaying cache.
    const delay = Math.min(5000, 500 * 2 ** this.reconnectAttempt++);
    this.resetScreenOnNextFrame = true;
    this.writeEmitter.fire(`\r\n\x1b[33m[bridge disconnected; reconnecting in ${delay} ms]\x1b[0m\r\n`);
    setTimeout(() => {
      if (!this.closedByUser && !this.child) this.startBridge();
    }, delay);
  }

  send(command) {
    if (!this.child?.stdin.writable) {
      this.writeEmitter.fire('\r\n\x1b[31m[Herdr controller is not connected]\x1b[0m\r\n');
      return;
    }
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  releaseChild() {
    const child = this.child;
    if (!child) return;
    this.child = undefined;

    if (this.mode === 'control' && child.stdin.writable) {
      child.stdin.write(`${JSON.stringify({ type: 'terminal.release' })}\n`);
      child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGTERM'), 750);
      timer.unref();
    } else {
      child.kill('SIGTERM');
    }
  }
}

async function askTarget() {
  return vscode.window.showInputBox({
    title: 'Open an existing Herdr Pane',
    prompt: 'Pane ID, terminal ID, or unique live agent name',
    placeHolder: 'w1:p1',
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? undefined : 'Enter a Herdr target',
  });
}

async function openTerminal(mode, takeover, automatic = false) {
  const target = await askTarget();
  if (!target) return;

  const config = vscode.workspace.getConfiguration('herdrPrototype');
  const session = config.get('session', '').trim();
  const binary = config.get('binary', 'herdr').trim() || 'herdr';
  const pty = new HerdrPseudoterminal({
    binary,
    session,
    target: target.trim(),
    mode,
    takeover,
  });
  const terminal = vscode.window.createTerminal({
    name: `Herdr ${target.trim()}${automatic ? ' (auto handoff)' : mode === 'observe' ? ' (read-only)' : ''}`,
    pty,
    location: vscode.TerminalLocation.Editor,
    isTransient: true,
  });
  if (automatic) automaticTerminals.set(terminal, pty);
  terminal.show();
}

function updateAutomaticFocus(activeTerminal, windowFocused, reason) {
  for (const [terminal, pty] of automaticTerminals) {
    if (windowFocused && terminal === activeTerminal) pty.focus();
    else pty.blur(reason);
  }
}

function activate(context) {
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('herdrPrototype.openObserver', () => openTerminal('observe', false)),
    vscode.commands.registerCommand('herdrPrototype.openController', () => openTerminal('control', false)),
    vscode.commands.registerCommand('herdrPrototype.openAutomaticHandoff', () => openTerminal('observe', false, true)),
    vscode.commands.registerCommand('herdrPrototype.takeControl', async () => {
      const answer = await vscode.window.showWarningMessage(
        'Taking control disconnects the current writable Herdr/Ghostty client from this Pane. Continue?',
        { modal: true },
        'Take control',
      );
      if (answer === 'Take control') await openTerminal('control', true);
    }),
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      output.info(`active terminal changed: ${terminal?.name ?? 'none'}`);
      updateAutomaticFocus(terminal, vscode.window.state.focused, 'active terminal changed');
    }),
    vscode.window.onDidChangeWindowState((state) => {
      output.info(`VS Code window focused=${state.focused}`);
      updateAutomaticFocus(vscode.window.activeTerminal, state.focused, 'VS Code window lost focus');
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      automaticTerminals.delete(terminal);
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
