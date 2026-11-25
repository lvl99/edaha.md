import { html, LitElement, nothing } from "lit";
import type {
  ConflictFile,
  FileConflict,
  FileMoved,
  FileSummary,
} from "../../../server/types/index.ts";
import {
  ApiError,
  type EditorApi,
  type UploadOptions,
} from "../../editorApi/index.ts";
import { icon } from "../../icons/index.ts";
import { defineElement } from "../define/index.ts";
import {
  FILE_KIND_ICONS,
  fileTypeLabel,
  formatFileSize,
} from "../../fileLabels/index.ts";

/** How a file conflict is resolved: by renaming the incoming or the existing file, or by overwriting the existing one */
export type ConflictChoice =
  { rename: "incoming" | "existing"; name: string } | { overwrite: true };

/**
 * Tries to resolve a conflict with a choice: gives the next conflict if the choice causes one (e.g. the new name is
 * taken too), or nothing once the file is saved. Throws to show what went wrong.
 */
export type ConflictAttempt = (
  choice: ConflictChoice,
) => Promise<FileConflict | undefined>;

/** How the conflict came about, and where the editor shows the files */
export interface ConflictOptions {
  /** Whether the incoming file is being moved or uploaded */
  action: "move" | "upload";
  /** Where the editor shows the incoming file, when it has no `url` (e.g. an upload's object URL) */
  incomingUrl?: string | undefined;
  /** The address the editor shows a file's `url` from (default: the URL as it is) */
  address?: ((url: string) => string) | undefined;
}

/** Resolving a conflict with `saveResolvingConflicts`: the dialog's options, and what to do after renaming the existing file */
export interface SaveOptions extends ConflictOptions {
  /** Called after the existing file is renamed (its references in articles changed) */
  onExistingRenamed?:
    ((existing: FileSummary, moved: FileMoved) => void) | undefined;
}

/**
 * Save a file (upload or move it) and, if another file where it goes has its name, let the user resolve the conflict
 * with the dialog: saving it under another name, renaming the existing file first, or overwriting it. Resolves with
 * the save's result, or undefined if the user cancelled. Errors other than conflicts are thrown.
 *
 * @example
 * const result = await saveResolvingConflicts(dialog, api, (options) => api.upload(article, file, options), { action: "upload" });
 */
export const saveResolvingConflicts = async <T>(
  dialog: EdahaFileConflict,
  api: EditorApi,
  save: (options: UploadOptions) => Promise<T>,
  { onExistingRenamed, ...options }: SaveOptions,
): Promise<T | undefined> => {
  try {
    return await save({});
  } catch (error) {
    if (!(error instanceof ApiError) || !error.conflict) throw error;
    let conflict = error.conflict;
    let name: string | undefined;
    let result: T | undefined;
    const attempt: ConflictAttempt = async (choice) => {
      try {
        if ("overwrite" in choice) {
          result = await save({ name, overwrite: true });
          return undefined;
        }
        if (choice.rename === "incoming") name = choice.name;
        else {
          const { existing } = conflict;
          // A clash renaming the existing file is shown as an error, not as a conflict to resolve
          const moved = await api
            .moveFile(existing, existing, { name: choice.name })
            .catch((renameError: Error) => {
              throw new Error(renameError.message);
            });
          onExistingRenamed?.(existing, moved);
        }
        result = await save({ name });
        return undefined;
      } catch (saveError) {
        if (!(saveError instanceof ApiError) || !saveError.conflict)
          throw saveError;
        conflict = saveError.conflict;
        return conflict;
      }
    };
    return (await dialog.resolve(conflict, attempt, options))
      ? result
      : undefined;
  }
};

/** The two files, as the dialog names them */
type Side = "incoming" | "existing";

/** A URL as it is */
const asItIs = (url: string): string => url;

/** What the dialog says the conflict is, by how it came about */
const DESCRIPTIONS: Record<ConflictOptions["action"], string> = {
  move: "You are moving a file to a location where an existing file has the same name. Please select how you wish to resolve this conflict.",
  upload:
    "You are uploading a file to a location where an existing file has the same name. Please select how you wish to resolve this conflict.",
};

/**
 * The file conflict dialog: shown when a file being moved or uploaded has the same name as a file already where it is
 * going. It shows both files ([Incoming] → [Existing]) with their names, types and sizes, and resolves the conflict by
 * renaming either file (to the name typed in its text box) or by overwriting the existing file (after confirming).
 * Each choice is tried with the given attempt; one that causes another conflict shows that one, and an error is shown
 * in the dialog. Rendered in the light DOM.
 *
 * @example
 * const resolved = await dialog.resolve(conflict, (choice) => tryAgain(choice), { action: "upload", incomingUrl });
 */
export class EdahaFileConflict extends LitElement {
  static override properties = {
    conflict: { state: true },
    action: { state: true },
    names: { state: true },
    confirming: { state: true },
    busy: { state: true },
    error: { state: true },
  };

  /** The conflict shown, while resolving one */
  declare conflict?: FileConflict | undefined;
  declare action: ConflictOptions["action"];
  /** The names typed for each file */
  declare names: Record<Side, string>;
  /** Whether overwriting is being confirmed */
  declare confirming: boolean;
  /** Whether a choice is being tried */
  declare busy: boolean;
  declare error: string;

  /** Tries the user's choices */
  private attempt?: ConflictAttempt | undefined;

  /** Where the incoming file is shown when it has no URL */
  private incomingUrl?: string | undefined;

  /** The address a file's URL is shown from */
  private address = asItIs;

  /** Gives whether the conflict was resolved, once the dialog closes */
  private finishing?: ((resolved: boolean) => void) | undefined;

  constructor() {
    super();
    this.action = "move";
    this.names = { incoming: "", existing: "" };
    this.confirming = false;
    this.busy = false;
    this.error = "";
  }

  protected override createRenderRoot() {
    return this;
  }

  /** The dialog, once rendered */
  private get dialog(): HTMLDialogElement | null {
    return this.querySelector("dialog");
  }

  /** Whether the dialog is open */
  get open(): boolean {
    return this.dialog?.open ?? false;
  }

  /**
   * Show a conflict until it is resolved with the attempt, or cancelled. Resolves with whether it was resolved.
   *
   * @example
   * await dialog.resolve(conflict, async (choice) => { await api.moveFile(file, to, choiceOptions(choice)); });
   */
  async resolve(
    conflict: FileConflict,
    attempt: ConflictAttempt,
    { action, incomingUrl, address }: ConflictOptions,
  ): Promise<boolean> {
    this.finish(false);
    this.attempt = attempt;
    this.action = action;
    this.incomingUrl = incomingUrl;
    this.address = address ?? asItIs;
    this.show(conflict);
    const resolved = new Promise<boolean>(
      (resolve) => (this.finishing = resolve),
    );
    await this.updateComplete;
    if (!this.open) this.dialog?.showModal();
    this.querySelector<HTMLInputElement>(
      "#file-conflict-incoming-name",
    )?.focus();
    return resolved;
  }

  /** Show a conflict, with each file's own name to start with */
  private show(conflict: FileConflict) {
    this.conflict = conflict;
    this.names = {
      incoming: conflict.incoming.name,
      existing: conflict.existing.name,
    };
    this.confirming = false;
    this.error = "";
  }

  /** Close the dialog, without resolving the conflict if it isn't yet */
  close(): void {
    if (this.open) this.dialog?.close();
    this.finish(false);
  }

  /** Stop resolving, giving whether the conflict was resolved */
  private finish(resolved: boolean) {
    const finishing = this.finishing;
    this.finishing = undefined;
    this.attempt = undefined;
    finishing?.(resolved);
  }

  /** Try a choice: done, it closes the dialog; another conflict is shown; an error is shown */
  async choose(choice: ConflictChoice): Promise<void> {
    const attempt = this.attempt;
    if (!attempt || this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      const next = await attempt(choice);
      if (next) this.show(next);
      else {
        this.finish(true);
        this.close();
      }
    } catch (error) {
      this.error = (error as Error).message;
    }
    this.busy = false;
  }

  /** Ask to confirm overwriting, with focus on its answers */
  private async confirmOverwrite() {
    this.confirming = true;
    await this.updateComplete;
    this.querySelector<HTMLButtonElement>("#file-conflict-keep")?.focus();
  }

  /** Stop confirming overwriting, with focus back on its button */
  private async keep() {
    this.confirming = false;
    await this.updateComplete;
    this.querySelector<HTMLButtonElement>("#file-conflict-overwrite")?.focus();
  }

  /** Render a file's preview: its image, or its kind's icon */
  private renderPreview(file: ConflictFile, url: string | undefined) {
    return file.kind === "image" && url
      ? html`<img class="checkerboard" src=${url} alt="" />`
      : html`<span class="file-conflict-icon"
          >${icon(file.kind === "image" ? "image" : FILE_KIND_ICONS[file.kind])}</span
        >`;
  }

  /** Render one of the files: its preview, name box, type, size and what can be done with it */
  private renderFile(side: Side, file: ConflictFile) {
    const label = side === "incoming" ? "Incoming" : "Existing";
    const id = `file-conflict-${side}`;
    const name = this.names[side];
    const url =
      side === "incoming" && this.incomingUrl
        ? this.incomingUrl
        : file.url && this.address(file.url);
    return html`<section
      class="file-conflict-file"
      aria-labelledby="${id}-title"
    >
      <h3 id="${id}-title">${label}</h3>
      <div class="file-conflict-preview">${this.renderPreview(file, url)}</div>
      <div class="article-browser-field">
        <label for="${id}-name">File name</label>
        <input
          type="text"
          id="${id}-name"
          spellcheck="false"
          autocomplete="off"
          .value=${name}
          @input=${(event: Event) =>
            (this.names = {
              ...this.names,
              [side]: (event.target as HTMLInputElement).value,
            })}
        />
      </div>
      <p class="file-conflict-details">
        <span>${fileTypeLabel(file.name, file.kind)}</span>
        <span>${formatFileSize(file.size)}</span>
      </p>
      <div class="dialog-actions file-conflict-actions">
        <button
          type="button"
          class="btn btn-rename"
          ?disabled=${this.busy || !name.trim() || name === file.name}
          @click=${() => void this.choose({ rename: side, name: name.trim() })}
        >
          Rename<span class="visually-hidden"> ${side} file</span>
        </button>
        ${
          side === "incoming"
            ? html`<button
                type="button"
                class="btn btn-overwrite"
                id="file-conflict-overwrite"
                ?disabled=${this.busy}
                aria-expanded=${this.confirming ? "true" : "false"}
                aria-controls="file-conflict-confirm"
                @click=${() => void this.confirmOverwrite()}
              >
                Overwrite…
              </button>`
            : nothing
        }
      </div>
    </section>`;
  }

  /** Render the question confirming overwriting the existing file with the incoming one */
  private renderConfirm({ incoming }: FileConflict) {
    if (!this.confirming) return nothing;
    return html`<div
      id="file-conflict-confirm"
      class="file-conflict-confirm"
      role="group"
      aria-labelledby="file-conflict-question"
    >
      <p id="file-conflict-question">
        Are you sure you want to overwrite the file with ${incoming.name}
        (${fileTypeLabel(incoming.name, incoming.kind)};
        ${formatFileSize(incoming.size)})?
      </p>
      <div class="dialog-actions file-conflict-actions">
        <button
          type="button"
          class="btn btn-confirm-overwrite"
          ?disabled=${this.busy}
          @click=${() => void this.choose({ overwrite: true })}
        >
          Yes, overwrite
        </button>
        <button
          type="button"
          class="btn btn-cancel"
          id="file-conflict-keep"
          @click=${() => void this.keep()}
        >
          No, cancel
        </button>
      </div>
    </div>`;
  }

  override render() {
    const conflict = this.conflict;
    return html`<dialog
      class="article-browser file-conflict"
      aria-labelledby="file-conflict-title"
      aria-describedby="file-conflict-description"
      @close=${() => this.finish(false)}
    >
      <div class="article-browser-header">
        <h2 id="file-conflict-title">Resolve file conflict</h2>
        <button
          type="button"
          class="btn btn-icon btn-close"
          title="Close"
          @click=${() => this.close()}
        >
          ${icon("close")}<span class="visually-hidden">Close</span>
        </button>
      </div>
      <div class="file-conflict-body">
        <p id="file-conflict-description">${DESCRIPTIONS[this.action]}</p>
        ${
          conflict
            ? html`<div class="file-conflict-files">
                  ${this.renderFile("incoming", conflict.incoming)}
                  <span class="file-conflict-arrow" aria-hidden="true"
                    >${icon("arrow_forward")}</span
                  >
                  ${this.renderFile("existing", conflict.existing)}
                </div>
                ${this.renderConfirm(conflict)}`
            : nothing
        }
        <p class="file-conflict-error" role="alert">${this.error}</p>
      </div>
      <div class="dialog-actions file-conflict-footer">
        <button
          type="button"
          class="btn btn-cancel"
          @click=${() => this.close()}
        >
          Cancel
        </button>
      </div>
    </dialog>`;
  }
}

defineElement("edaha-file-conflict", EdahaFileConflict);
