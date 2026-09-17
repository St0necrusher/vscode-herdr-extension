export interface HerdrLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
  show(): void;
}
