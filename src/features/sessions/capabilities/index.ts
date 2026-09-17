import type { HerdrSessionCatalogState } from "#capabilities/sessions";

export interface HerdrSessionCatalogStateSource {
  getState(): HerdrSessionCatalogState;
  onDidChange(listener: (state: HerdrSessionCatalogState) => void): {
    dispose(): void;
  };
}

export interface HerdrSessionCatalogOperations {
  retry(): Promise<void>;
  start(): Promise<void>;
}

export interface HerdrStatusOperations {
  showActions(): Promise<void>;
}
