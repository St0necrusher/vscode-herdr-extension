"use strict";

// THROWAWAY: offer a mobile popup while this VS Code host owns one focused
// direct attach. Only the owning host may release its own attach after confirmation.
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { randomBytes } = require("node:crypto");
const { tmpdir } = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

const PLUGIN_ID = "local.vscode-yield-popup-probe";

class PopupProbe {
  constructor(log, onConfirm) {
    this.log = log;
    this.onConfirm = onConfirm;
    this.socketPath = path.join(
      tmpdir(),
      `herdr-popup-${process.pid}-${randomBytes(6).toString("hex")}.sock`,
    );
    this.clients = new Set();
    this.eligibleSurface = undefined;
    this.offeredGeneration = undefined;
    this.disposed = false;
    this.server = createServer((client) => {
      const surface = this.eligibleSurface;
      const generation = surface?.generation;
      if (this.disposed || !surface || this.offeredGeneration !== generation) {
        client.destroy();
        return;
      }
      this.clients.add(client);
      let request = "";
      let confirmed = false;
      client.on("data", (data) => {
        if (confirmed) return;
        request += data.toString("utf8");
        if (request.length > 64) {
          client.destroy();
          return;
        }
        if (!request.includes("\n")) return;
        confirmed = true;
        if (
          request.trim() !== "confirm" ||
          this.disposed ||
          this.eligibleSurface !== surface ||
          surface.generation !== generation ||
          this.offeredGeneration !== generation
        ) {
          client.destroy();
          return;
        }
        const yieldIfCurrent = this.onConfirm(surface);
        if (typeof yieldIfCurrent !== "function") {
          client.destroy();
          return;
        }
        client.write("accepted\n", (error) => {
          if (error) return;
          setImmediate(yieldIfCurrent);
        });
      });
      client.on("error", () => {});
      client.on("close", () => this.clients.delete(client));
      client.write("alive\n");
    });
    this.server.on("error", (error) =>
      this.log.error(`popup socket: ${error.message}`),
    );
    this.pulse = undefined;
  }

  async start() {
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.socketPath, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
    fs.chmodSync(this.socketPath, 0o600);
    this.pulse = setInterval(() => {
      if (!this.eligibleSurface) return;
      for (const client of this.clients) client.write("alive\n");
    }, 1000);
    this.log.info(`popup probe socket ready: ${this.socketPath}`);
  }

  offer(surface, binary, session) {
    if (this.disposed) return;
    if (this.eligibleSurface !== surface) this.hide();
    this.eligibleSurface = surface;
    if (this.offeredGeneration === surface.generation) return;
    this.offeredGeneration = surface.generation;

    const args = [];
    if (session) args.push("--session", session);
    args.push(
      "plugin",
      "pane",
      "open",
      "--plugin",
      PLUGIN_ID,
      "--entrypoint",
      "confirm",
      "--env",
      `HERDR_VSCODE_POPUP_SOCKET=${this.socketPath}`,
    );
    this.log.info(`popup probe: opening for ${surface.terminalId}`);
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let message = "";
    child.stdout.on("data", (data) => {
      message += data.toString("utf8");
    });
    child.stderr.on("data", (data) => {
      message += data.toString("utf8");
    });
    child.on("error", (error) =>
      this.log.warn(`popup open failed: ${error.message}`),
    );
    child.on("close", (code) => {
      if (code !== 0)
        this.log.warn(`popup open exited ${code}: ${message.trim()}`);
      else
        this.log.info(
          `popup probe: open request completed for ${surface.terminalId}`,
        );
    });
  }

  hide(surface) {
    if (surface && this.eligibleSurface !== surface) return;
    if (this.eligibleSurface) this.log.info("popup probe: retracting offer");
    this.eligibleSurface = undefined;
    this.offeredGeneration = undefined;
    for (const client of this.clients) client.destroy();
    this.clients.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hide();
    clearInterval(this.pulse);
    this.server.close(() => {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (error) {
        if (error.code !== "ENOENT")
          this.log.warn(`popup socket cleanup: ${error.message}`);
      }
    });
  }
}

module.exports = { PopupProbe };
