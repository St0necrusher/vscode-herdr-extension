import * as net from "node:net";

export interface HerdrSocketTransport {
  write(data: string): void;
  onData(listener: (data: Uint8Array) => void): { dispose(): void };
  onError(listener: (error: Error) => void): { dispose(): void };
  onClose(listener: () => void): { dispose(): void };
  dispose(): void;
}

export interface HerdrSocketConnector {
  connect(endpoint: string, signal: AbortSignal): Promise<HerdrSocketTransport>;
}

export class NodeHerdrSocketConnector implements HerdrSocketConnector {
  connect(endpoint: string, signal: AbortSignal): Promise<HerdrSocketTransport> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError(signal));
        return;
      }
      const socket = net.createConnection(endpoint);
      const cleanup = (): void => {
        signal.removeEventListener("abort", abortConnection);
        socket.removeListener("error", rejectConnection);
        socket.removeListener("connect", acceptConnection);
      };
      const rejectConnection = (error: Error): void => {
        cleanup();
        socket.destroy();
        reject(error);
      };
      const abortConnection = (): void => rejectConnection(abortError(signal));
      const acceptConnection = (): void => {
        cleanup();
        resolve(createTransport(socket));
      };
      signal.addEventListener("abort", abortConnection, { once: true });
      socket.once("error", rejectConnection);
      socket.once("connect", acceptConnection);
    });
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Herdr socket connection was cancelled.");
}

function createTransport(socket: net.Socket): HerdrSocketTransport {
  return {
    write(data): void {
      socket.write(data);
    },
    onData(listener) {
      const wrapped = (data: Buffer): void => listener(data);
      socket.on("data", wrapped);
      return { dispose: () => socket.off("data", wrapped) };
    },
    onError(listener) {
      socket.on("error", listener);
      return { dispose: () => socket.off("error", listener) };
    },
    onClose(listener) {
      socket.on("close", listener);
      return { dispose: () => socket.off("close", listener) };
    },
    dispose(): void {
      socket.destroy();
    },
  };
}
