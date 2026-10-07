import { VsCodeSettings } from "@core/settings";
import type { HerdrConfiguration, HerdrConfigurationSource } from "@modules/sessions";

export class HerdrSettings implements HerdrConfigurationSource {
  private readonly settings = new VsCodeSettings("herdr", ["executable", "session"]);

  read(): HerdrConfiguration {
    const executable = this.settings.read("executable", "herdr").trim();
    const session = this.settings.read("session", "default").trim();
    return {
      executable: executable || "herdr",
      session: session || "default",
    };
  }

  onDidChange(listener: () => void): { dispose(): void } {
    return this.settings.onDidChange(listener);
  }
}
