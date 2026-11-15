import { html, LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { defineElement } from "../define/index.ts";

/** A message shown as a toast */
export interface ToastMessage {
  kind: "success" | "error";
  message: string;
}

/** The event other components fire (bubbling) to show a toast; its detail is a {@link ToastMessage} */
export const TOAST_EVENT = "blog-toast";

/** A toast on screen */
interface Toast extends ToastMessage {
  id: number;
}

/**
 * Show a toast from a component, by firing {@link TOAST_EVENT} for the editor to show.
 *
 * @example
 * showToast(this, { kind: "success", message: "Saved" });
 */
export const showToast = (from: EventTarget, toast: ToastMessage): void => {
  from.dispatchEvent(
    new CustomEvent<ToastMessage>(TOAST_EVENT, {
      detail: toast,
      bubbles: true,
    }),
  );
};

/**
 * Toasts in a corner of the editor: successes go away after a few seconds, errors stay until dismissed. Rendered in the
 * light DOM.
 *
 * @example
 * html`<blog-toasts></blog-toasts>`; // then toasts.show({ kind: "error", message: "Not found" })
 */
export class BlogToasts extends LitElement {
  static override properties = {
    toasts: { state: true },
  };

  declare toasts: Toast[];

  /** How long a success toast is shown, in ms (replaceable for tests) */
  duration = 4000;

  private nextId = 0;

  constructor() {
    super();
    this.toasts = [];
  }

  protected override createRenderRoot() {
    return this;
  }

  /**
   * Show a toast. Success toasts are dismissed after `duration`.
   */
  show(toast: ToastMessage): void {
    const id = ++this.nextId;
    this.toasts = [...this.toasts, { ...toast, id }];
    if (toast.kind === "success")
      setTimeout(() => this.dismiss(id), this.duration);
  }

  /** Remove a toast */
  dismiss(id: number): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
  }

  override render() {
    return html`<div class="toasts">
      ${repeat(
        this.toasts,
        (toast) => toast.id,
        (toast) =>
          html`<div
            class="toast ${toast.kind}"
            role=${toast.kind === "error" ? "alert" : "status"}
          >
            <span>${toast.message}</span>
            <button type="button" @click=${() => this.dismiss(toast.id)}>
              Dismiss
            </button>
          </div>`,
      )}
    </div>`;
  }
}

defineElement("blog-toasts", BlogToasts);
