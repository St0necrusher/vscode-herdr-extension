import type { HerdrPaneMovedEvent } from "@api/herdr";

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
