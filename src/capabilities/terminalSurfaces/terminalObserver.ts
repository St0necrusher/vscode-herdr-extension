export type HerdrTerminalObserverRequest = Readonly<{
  executable: string;
  sessionId: string;
  terminalId: string;
  columns: number;
  rows: number;
}>;

export type HerdrTerminalObserverEvent =
  | Readonly<{ kind: "frame"; ansi: string; full: boolean }>
  | Readonly<{ kind: "closed"; reason?: string }>
  | Readonly<{ kind: "transport-lost"; diagnostic: string }>
  | Readonly<{ kind: "fault"; diagnostic: string }>;

export interface HerdrTerminalObserverAttempt {
  dispose(): void;
}

export interface HerdrTerminalObserverFactory {
  start(
    request: HerdrTerminalObserverRequest,
    listener: (event: HerdrTerminalObserverEvent) => void,
  ): HerdrTerminalObserverAttempt;
}
