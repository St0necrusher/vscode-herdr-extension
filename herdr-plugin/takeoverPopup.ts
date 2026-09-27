import { createConnection, type Socket } from "node:net";

const OWNER_SOCKET_TIMEOUT_MS = 3_000;
const OWNER_HEARTBEAT_TIMEOUT_MS = 3_000;
const MIRROR_POLL_INTERVAL_MS = 400;
const MIRROR_REQUEST_ID = "takeover:read";
const SEND_TEXT_REQUEST_ID = "takeover:send-text";
const BANNER = "Hold to continue here · VS Code has this Pane";
const ENTER_TERMINAL_MODES = "\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1000h\x1b[?1006h";
const RESTORE_TERMINAL_MODES = "\x1b[?1000l\x1b[?1006l\x1b[?7h\x1b[?25h\x1b[?1049l";

interface RuntimeConfiguration {
  readonly ownerSocketPath: string | undefined;
  readonly token: string | undefined;
  readonly paneId: string | undefined;
  readonly herdrSocketPath: string | undefined;
}

function hasRuntimeConfiguration(
  configuration: RuntimeConfiguration,
): configuration is Readonly<Record<keyof RuntimeConfiguration, string>> {
  return Boolean(
    configuration.ownerSocketPath && configuration.token && configuration.paneId && configuration.herdrSocketPath,
  );
}

function isConfirmInput(input: string): boolean {
  const hasMousePress = /\x1b\[<\d+;\d+;\d+M/.test(input); // eslint-disable-line no-control-regex
  if (hasMousePress) return true;

  const nonConfirmingReportsRemoved = input
    .replace(/\x1b\[(?:I|O)/g, "") // eslint-disable-line no-control-regex
    .replace(/\x1b\[<\d+;\d+;\d+m/g, ""); // eslint-disable-line no-control-regex
  return nonConfirmingReportsRemoved.length > 0;
}

// Done on the response (Herdr answers with one line) or on a failed connection.
function sendKeyboardInput(herdrSocketPath: string, paneId: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    const socket = createConnection(herdrSocketPath);
    socket.on("connect", () => {
      socket.write(
        `${JSON.stringify({
          id: SEND_TEXT_REQUEST_ID,
          method: "pane.send_text",
          params: { pane_id: paneId, text },
        })}\n`,
      );
    });
    socket.on("data", () => {
      socket.destroy();
      resolve();
    });
    socket.on("error", () => resolve());
  });
}

function wrapBanner(text: string, width: number): string[] {
  const wrappedRows: string[] = [];
  let currentRow = "";
  text.split(" ").forEach((word) => {
    const wordAtWidth = word.slice(0, width);
    const candidateRow = currentRow.length === 0 ? wordAtWidth : `${currentRow} ${wordAtWidth}`;
    const candidateFits = candidateRow.length <= width;
    if (candidateFits) {
      currentRow = candidateRow;
    } else {
      if (currentRow.length > 0) wrappedRows.push(currentRow);
      currentRow = wordAtWidth;
    }
  });
  if (currentRow.length > 0) wrappedRows.push(currentRow);
  return wrappedRows;
}

function drawMirror(text: string): void {
  const columns = process.stdout.columns;
  const rows = process.stdout.rows;
  const bannerRows = wrapBanner(BANNER, columns);
  const bodyHeight = Math.max(0, rows - bannerRows.length);
  const lines = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n");
  const visibleLines = lines.slice(Math.max(0, lines.length - bodyHeight));
  let output = "";

  bannerRows.forEach((line, index) => {
    output += `\x1b[${index + 1};1H\x1b[7m${line.padEnd(columns)}\x1b[0m\x1b[K`;
  });
  visibleLines.forEach((line, index) => {
    output += `\x1b[${index + bannerRows.length + 1};1H\x1b[0m${line}\x1b[0m\x1b[K`;
  });
  const hasRowsBelowBody = visibleLines.length < bodyHeight;
  if (hasRowsBelowBody) output += `\x1b[${visibleLines.length + bannerRows.length + 1};1H\x1b[J`;

  process.stdout.write(output);
}

function startPopup(configuration: Readonly<Record<keyof RuntimeConfiguration, string>>): void {
  let finished = false;
  let terminalModesActive = false;
  let ownerSocket: Socket | undefined;
  let ownerConnectionTimer: NodeJS.Timeout | undefined;
  let ownerHeartbeatTimer: NodeJS.Timeout | undefined;
  let mirrorPollTimer: NodeJS.Timeout | undefined;
  let ownerRemainder = "";
  let mirrorText = "";

  const restoreTerminalModes = (): void => {
    if (!terminalModesActive) return;

    terminalModesActive = false;
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(RESTORE_TERMINAL_MODES);
  };

  const finish = (sendConfirm = false): void => {
    if (finished) return;

    finished = true;
    clearTimeout(ownerHeartbeatTimer);
    clearTimeout(mirrorPollTimer);
    process.stdin.pause();

    if (sendConfirm) {
      const currentOwnerSocket = ownerSocket;
      if (currentOwnerSocket !== undefined) {
        currentOwnerSocket.write("confirm\n", () => process.exit());
        restoreTerminalModes();
        return;
      }
    }
    clearTimeout(ownerConnectionTimer);
    restoreTerminalModes();
    process.exit();
  };

  const resetOwnerHeartbeat = (): void => {
    clearTimeout(ownerHeartbeatTimer);
    ownerHeartbeatTimer = setTimeout(() => finish(), OWNER_HEARTBEAT_TIMEOUT_MS);
  };

  const draw = (): void => drawMirror(mirrorText);

  const scheduleMirrorRead = (): void => {
    mirrorPollTimer = setTimeout(requestMirrorRead, MIRROR_POLL_INTERVAL_MS);
  };

  const requestMirrorRead = (): void => {
    if (finished) return;

    const currentHerdrSocket = createConnection(configuration.herdrSocketPath);
    let responseText = "";
    let responseReceived = false;
    currentHerdrSocket.on("connect", () => {
      currentHerdrSocket.write(
        `${JSON.stringify({
          id: MIRROR_REQUEST_ID,
          method: "pane.read",
          params: { pane_id: configuration.paneId, source: "visible", format: "ansi" },
        })}\n`,
      );
    });
    currentHerdrSocket.on("data", (chunk: Buffer) => {
      responseText += chunk.toString("utf8");
      const responseEnd = responseText.indexOf("\n");
      if (responseEnd < 0) return;

      responseReceived = true;
      handleHerdrMessage(responseText.slice(0, responseEnd));
      currentHerdrSocket.destroy();
    });
    currentHerdrSocket.on("error", () => finish());
    currentHerdrSocket.on("close", () => {
      const closedBeforeResponse = !responseReceived;
      if (closedBeforeResponse) finish();
    });
  };

  const handleHerdrMessage = (line: string): void => {
    if (!line) return;

    const response = JSON.parse(line) as
      { readonly error: unknown } | { readonly result: { readonly read: { readonly text: string } } };
    if ("error" in response) {
      finish();
      return;
    }

    mirrorText = response.result.read.text;
    draw();
    scheduleMirrorRead();
  };

  const handleOwnerMessage = (line: string): void => {
    if (finished) return;
    if (line === "retract") {
      finish();
    } else if (line === "alive") {
      resetOwnerHeartbeat();
    }
  };

  const connectOwnerSocket = (): void => {
    ownerSocket = createConnection(configuration.ownerSocketPath);
    ownerConnectionTimer = setTimeout(() => finish(), OWNER_SOCKET_TIMEOUT_MS);
    ownerSocket.on("connect", () => {
      clearTimeout(ownerConnectionTimer);
      resetOwnerHeartbeat();
      requestMirrorRead();
    });
    ownerSocket.on("data", (chunk: Buffer) => {
      const lines = `${ownerRemainder}${chunk.toString("utf8")}`.split("\n");
      ownerRemainder = lines.pop() ?? "";
      lines.forEach((line) => handleOwnerMessage(line.trim()));
    });
    ownerSocket.on("error", () => finish());
    ownerSocket.on("close", () => finish());
    ownerSocket.write(`hello ${configuration.token}\n`);
  };

  process.on("exit", restoreTerminalModes);
  terminalModesActive = true;
  process.stdout.write(ENTER_TERMINAL_MODES);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk: Buffer) => {
    const input = chunk.toString("latin1");
    if (isConfirmInput(input)) {
      const hasMouseReport = /\x1b\[<\d+;\d+;\d+[Mm]/.test(input); // eslint-disable-line no-control-regex
      if (hasMouseReport) {
        finish(true);
        return;
      }

      const text = chunk.toString("utf8").replace(/\x1b\[(?:I|O)/g, ""); // eslint-disable-line no-control-regex
      void sendKeyboardInput(configuration.herdrSocketPath, configuration.paneId, text).then(() => finish(true));
    }
  });
  process.stdin.on("end", () => finish());
  process.stdin.on("close", () => finish());
  process.stdin.on("error", () => finish());
  process.stdout.on("resize", draw);
  process.stdout.on("error", () => finish());

  draw();
  connectOwnerSocket();
}

const configuration: RuntimeConfiguration = {
  ownerSocketPath: process.env.HERDR_VSCODE_TAKEOVER_SOCKET,
  token: process.env.HERDR_VSCODE_TAKEOVER_TOKEN,
  paneId: process.env.HERDR_VSCODE_TAKEOVER_PANE,
  herdrSocketPath: process.env.HERDR_SOCKET_PATH,
};

if (hasRuntimeConfiguration(configuration)) {
  startPopup(configuration);
} else {
  process.exitCode = 1;
}
