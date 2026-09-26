import type { HerdrConfigurationSource } from "@capabilities/sessions";
import type { HerdrLogger } from "@capabilities/runtime";
import { HerdrPaneAttach, type PaneAttach } from "./HerdrPaneAttach";
import { HerdrPaneObserver, type PaneObserver } from "./HerdrPaneObserver";
import type { PaneOutputSink } from "./PaneOutputSink";

export type PaneClientRequest = Readonly<{
  sessionId: string;
  terminalId: string;
  columns: number;
  rows: number;
}>;

export interface PaneClientFactory {
  createObserver(request: PaneClientRequest, sink: PaneOutputSink): PaneObserver;
  createAttach(request: PaneClientRequest, sink: PaneOutputSink): PaneAttach;
}

export class HerdrPaneClientFactory implements PaneClientFactory {
  constructor(
    private readonly configuration: HerdrConfigurationSource,
    private readonly attachConfigPath: string,
    private readonly logger: HerdrLogger,
  ) {}

  createObserver(request: PaneClientRequest, sink: PaneOutputSink): PaneObserver {
    return new HerdrPaneObserver({ ...request, executable: this.configuration.read().executable }, sink, this.logger);
  }

  createAttach(request: PaneClientRequest, sink: PaneOutputSink): PaneAttach {
    return new HerdrPaneAttach(
      { ...request, executable: this.configuration.read().executable },
      this.attachConfigPath,
      sink,
      this.logger,
    );
  }
}
