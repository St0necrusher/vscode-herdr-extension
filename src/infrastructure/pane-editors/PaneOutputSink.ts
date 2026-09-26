export interface PaneOutputSink {
  append(data: string): void;
  replace(data: string): void;
}
