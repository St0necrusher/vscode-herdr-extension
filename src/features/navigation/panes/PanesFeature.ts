import type { NavigationContextSource } from "../capabilities";
import { PanesModel } from "./PanesModel";
import { VsCodePanesView } from "./view";

export class PanesFeature {
  private readonly model: PanesModel;
  private readonly view: VsCodePanesView;
  private disposed = false;

  constructor(context: NavigationContextSource) {
    const model = new PanesModel(context);
    const view = new VsCodePanesView(model);
    this.model = model;
    this.view = view;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.view.dispose();
    this.model.dispose();
  }
}
