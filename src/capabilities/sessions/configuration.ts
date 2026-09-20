export type HerdrConfiguration = Readonly<{
  executable: string;
  session: string;
}>;

export interface HerdrConfigurationSource {
  read(): HerdrConfiguration;
  onDidChange(listener: () => void): { dispose(): void };
}

export interface HerdrConfigurationActions {
  selectExecutable(): Promise<void>;
  openSettings(): Promise<void>;
}
