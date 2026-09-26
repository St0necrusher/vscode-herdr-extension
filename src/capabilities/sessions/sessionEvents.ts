import type { HerdrPane } from "./snapshot";

export type HerdrPaneMovedEvent = Readonly<{
  sessionId: string;
  previousPaneId: string;
  currentPane: HerdrPane;
}>;

export type HerdrSessionEventMap = Readonly<{
  "pane.moved": HerdrPaneMovedEvent;
}>;

export type HerdrSessionEventName = keyof HerdrSessionEventMap;

export interface HerdrSessionEventSource {
  subscribe<TEventName extends HerdrSessionEventName>(
    eventName: TEventName,
    listener: (event: HerdrSessionEventMap[TEventName]) => void,
  ): { dispose(): void };
}
