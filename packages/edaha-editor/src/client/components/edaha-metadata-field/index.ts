import { html, LitElement, nothing } from "lit";
import { live } from "lit/directives/live.js";
import type {
  FieldKind,
  MetadataProblem,
  MetadataSchema,
} from "@lvl99dotcom/edaha.md/generator/metadata";
import {
  checkboxValues,
  colourInputValue,
  colourValue,
  editorKind,
  fieldChoices,
  fieldDescription,
  fieldLabel,
  inputAttributes,
  inputValue,
  problemsAt,
} from "../../metadataForm/index.ts";
import { fieldOptions } from "@lvl99dotcom/edaha.md/generator/metadata";
import { defineElement } from "../define/index.ts";
import { acceptedKind, type FileChooser } from "../edaha-file-browser/index.ts";

/** Detail of the `metadata-change` event: the changed value's path (e.g. "credit/name") and its new value */
export interface MetadataChange {
  path: string;
  value: unknown;
}

/** Uploads a file into the article's folder and returns its name */
export type FileUploader = (file: File) => Promise<string>;

/** Text read by screen readers only, e.g. which item a Delete button deletes */
const hidden = (text: string) =>
  html`<span class="visually-hidden">${text}</span>`;

/** A path as an id, e.g. "credit/name" as "meta-credit-name" */
const pathId = (path: string) => `meta-${path.replace(/[^\w-]/g, "-")}`;

/**
 * One custom metadata value's field, built from its schema: an input, textarea, select, checkboxes, radio buttons or
 * a file chooser, a group of fields for a map, or a list of fields with Add and Delete buttons. Its label and
 * description come from `$edahaField` (or the schema), and its problems show above it. Rendered in the light DOM.
 *
 * Fires `metadata-change` (detail: {@link MetadataChange}) when the value changes, and `metadata-blur` (detail: the
 * path) when focus leaves the field.
 *
 * @example
 * html`<edaha-metadata-field path="featured" .schema=${schema} .value=${value}></edaha-metadata-field>`
 */
export class EdahaMetadataField extends LitElement {
  static override properties = {
    path: {},
    label: {},
    schema: { attribute: false },
    value: { attribute: false },
    problems: { attribute: false },
    hiddenFields: { attribute: false },
    required: { type: Boolean },
    uploadFile: { attribute: false },
    chooseFile: { attribute: false },
    fileUrl: { attribute: false },
  };

  /** The value's path from the article's settings, e.g. "featured", "credit/name" or "images/2" */
  declare path: string;
  /** The label, when it isn't the schema's (e.g. "Images 2" for a list's item) */
  declare label?: string | undefined;
  declare schema: MetadataSchema;
  declare value: unknown;
  /** Problems with the article's metadata (those for this value, and inside it, show) */
  declare problems: MetadataProblem[];
  /** The paths (in dot notation, e.g. "credit.name") of fields hidden by their conditions, which aren't shown */
  declare hiddenFields: ReadonlySet<string>;
  declare required: boolean;
  /** Uploads files for file fields; without it they can't be chosen */
  declare uploadFile?: FileUploader | undefined;
  /** Lets the user choose an existing file for file fields */
  declare chooseFile?: FileChooser | undefined;
  /** The URL a file name is shown at, for file fields */
  declare fileUrl?: ((name: string) => string | undefined) | undefined;

  constructor() {
    super();
    this.path = "";
    this.schema = {};
    this.problems = [];
    this.hiddenFields = new Set();
    this.required = false;
  }

  protected override createRenderRoot() {
    return this;
  }

  /** Change the value at a path inside this one (or this one), telling the article */
  private change(path: string, value: unknown) {
    this.dispatchEvent(
      new CustomEvent<MetadataChange>("metadata-change", {
        detail: { path, value },
        bubbles: true,
      }),
    );
  }

  /** The key at the end of the path, e.g. "name" for "credit/name" */
  private get key() {
    return this.path.split("/").at(-1) as string;
  }

  /** The label shown */
  private get fieldTitle() {
    return this.label ?? fieldLabel(this.key, this.schema);
  }

  /** Render the description, extra information and problems shown above the input, linked to it by id */
  private renderNotes(id: string) {
    const description = fieldDescription(this.schema);
    const info = this.schema.$edahaField?.info;
    const problems = problemsAt(this.problems, this.path);
    return html`${
      description
        ? html`<p class="metadata-description" id="${id}-description">
            ${description}
          </p>`
        : nothing
    }${
      info
        ? html`<p class="metadata-info" id="${id}-info">${info}</p>`
        : nothing
    }${
      problems.length
        ? html`<ul class="metadata-problems" id="${id}-problems">
            ${problems.map(
              (problem) =>
                html`<li class=${problem.level}>
                  ${this.fieldTitle} ${problem.message}
                </li>`,
            )}
          </ul>`
        : nothing
    }`;
  }

  /** The ids of the notes an input is described by */
  private describedBy(id: string) {
    return [
      fieldDescription(this.schema) && `${id}-description`,
      this.schema.$edahaField?.info && `${id}-info`,
      problemsAt(this.problems, this.path).length && `${id}-problems`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  /** Render a child field for a map's property or a list's item */
  private renderChild(
    path: string,
    schema: MetadataSchema,
    value: unknown,
    options: { label?: string; required?: boolean } = {},
  ) {
    return html`<edaha-metadata-field
      path=${path}
      .label=${options.label}
      .schema=${schema}
      .value=${value}
      .problems=${this.problems}
      .hiddenFields=${this.hiddenFields}
      ?required=${options.required ?? false}
      .uploadFile=${this.uploadFile}
      .chooseFile=${this.chooseFile}
      .fileUrl=${this.fileUrl}
    ></edaha-metadata-field>`;
  }

  /** Render a map of fields as a group */
  private renderObject(id: string) {
    const value = (this.value ?? {}) as Record<string, unknown>;
    return html`<fieldset
      class="metadata-group"
      aria-describedby=${this.describedBy(id) || nothing}
    >
      <legend>${this.fieldTitle}</legend>
      ${this.renderNotes(id)}
      ${Object.entries(
        // Maps always have properties (see parseMetadata)
        this.schema.properties as Record<string, MetadataSchema>,
      )
        .filter(
          ([name]) =>
            !this.hiddenFields.has(`${this.path}/${name}`.replaceAll("/", ".")),
        )
        .map(([name, schema]) =>
          this.renderChild(`${this.path}/${name}`, schema, value[name], {
            required: this.schema.required?.includes(name) ?? false,
          }),
        )}
    </fieldset>`;
  }

  /** Render a list of fields, with Delete buttons and an Add button */
  private renderList(id: string) {
    const items = Array.isArray(this.value) ? (this.value as unknown[]) : [];
    const max = this.schema.maxItems as number | undefined;
    const full = max !== undefined && items.length >= max;
    return html`<fieldset
      class="metadata-group metadata-list"
      aria-describedby=${this.describedBy(id) || nothing}
    >
      <legend>${this.fieldTitle}</legend>
      ${this.renderNotes(id)}
      ${items.map(
        (item, i) =>
          html`<div class="metadata-item">
            ${this.renderChild(
              `${this.path}/${i}`,
              this.schema.items as MetadataSchema,
              item,
              { label: `${this.fieldTitle} ${i + 1}` },
            )}
            <button
              type="button"
              class="btn btn-xs"
              @click=${() =>
                this.change(
                  this.path,
                  items.filter((_, index) => index !== i),
                )}
            >
              Delete${hidden(` ${this.fieldTitle} ${i + 1}`)}
            </button>
          </div>`,
      )}
      <button
        type="button"
        class="btn btn-xs"
        ?disabled=${full}
        @click=${() => this.change(this.path, [...items, undefined])}
      >
        Add${hidden(` to ${this.fieldTitle}`)}
      </button>
    </fieldset>`;
  }

  /** Render a select: a dropdown, a list (`list: true`), and choosing several for a whole list (`multiple: true`) */
  private renderSelect(id: string, kind: FieldKind) {
    const options = fieldOptions(this.schema.$edahaField as never);
    const choices = fieldChoices(this.schema);
    const multiple = options.multiple === true;
    const selected = multiple
      ? ((this.value as unknown[] | undefined) ?? []).map(String)
      : [String(this.value ?? "")];
    return html`<select
      id=${id}
      ?multiple=${multiple}
      size=${options.list === true ? choices.length + (multiple ? 0 : 1) : nothing}
      ?required=${this.required}
      aria-invalid=${problemsAt(this.problems, this.path).length ? "true" : "false"}
      aria-describedby=${this.describedBy(id) || nothing}
      @change=${(event: Event) => {
        const select = event.target as HTMLSelectElement;
        const values = [...select.selectedOptions].map(
          (option) => choices[Number(option.dataset.index)]?.value ?? undefined,
        );
        this.change(
          this.path,
          multiple ? values : (values[0] ?? inputValue(kind, "")),
        );
      }}
    >
      ${multiple ? nothing : html`<option value="">—</option>`}
      ${choices.map(
        (choice, i) =>
          html`<option
            data-index=${i}
            value=${String(choice.value)}
            ?selected=${selected.includes(String(choice.value))}
          >
            ${choice.title ?? String(choice.value)}
          </option>`,
      )}
    </select>`;
  }

  /** Render radio buttons, each with its own description */
  private renderRadio(id: string) {
    return html`<fieldset
      class="metadata-radio"
      aria-describedby=${this.describedBy(id) || nothing}
    >
      <legend>${this.fieldTitle}</legend>
      ${this.renderNotes(id)}
      ${fieldChoices(this.schema).map(
        (choice, i) =>
          html`<label class="metadata-choice">
            <input
              type="radio"
              name=${id}
              .checked=${live(this.value === choice.value)}
              ?required=${this.required}
              aria-describedby=${choice.description ? `${id}-${i}` : nothing}
              @change=${() => this.change(this.path, choice.value)}
            />
            ${choice.title ?? String(choice.value)}
            ${
              choice.description
                ? html`<small id="${id}-${i}">${choice.description}</small>`
                : nothing
            }
          </label>`,
      )}
    </fieldset>`;
  }

  /** Let the user choose an existing file (of the kind the field accepts), and set the value to it */
  private async chooseExisting() {
    const file = await this.chooseFile?.(
      acceptedKind(inputAttributes(this.schema).accept),
    );
    if (file) this.change(this.path, file.url);
  }

  /**
   * Render a file field: the file's name (linked), a chooser that uploads it, a button choosing an existing file, and
   * a button that clears it.
   */
  private renderFile(id: string) {
    const name = typeof this.value === "string" ? this.value : "";
    const url = name ? this.fileUrl?.(name) : undefined;
    return html`${
        name
          ? html`<p class="metadata-file">
              ${url ? html`<a href=${url} target="_blank">${name}</a>` : name}
              <button
                type="button"
                class="btn btn-xs"
                @click=${() => this.change(this.path, undefined)}
              >
                Clear${hidden(` ${this.fieldTitle}`)}
              </button>
            </p>`
          : nothing
      }<input
        type="file"
        id=${id}
        ?disabled=${!this.uploadFile}
        ?required=${this.required && !name}
        aria-invalid=${problemsAt(this.problems, this.path).length ? "true" : "false"}
        aria-describedby=${this.describedBy(id) || nothing}
        accept=${inputAttributes(this.schema).accept ?? nothing}
        @change=${async (event: Event) => {
          const input = event.target as HTMLInputElement;
          const file = input.files?.[0];
          input.value = "";
          if (!file || !this.uploadFile) return;
          try {
            this.change(this.path, await this.uploadFile(file));
          } catch {
            // The uploader reports its own errors
          }
        }}
      />${
        this.chooseFile
          ? html`<button
              type="button"
              class="btn btn-choose-file"
              @click=${() => void this.chooseExisting()}
            >
              Choose existing file…${hidden(` for ${this.fieldTitle}`)}
            </button>`
          : nothing
      }`;
  }

  /** Render the input for a single value's field kind (the other kinds are an `<input>` of the same type) */
  private renderInput(id: string, kind: FieldKind) {
    const invalid = problemsAt(this.problems, this.path).length
      ? "true"
      : "false";
    const describedBy = this.describedBy(id) || nothing;
    if (kind === "select") return this.renderSelect(id, kind);
    if (kind === "file") return this.renderFile(id);
    if (kind === "checkbox") {
      const { checked, unchecked } = checkboxValues(this.schema);
      return html`<input
        type="checkbox"
        id=${id}
        .checked=${live(this.value === checked)}
        aria-invalid=${invalid}
        aria-describedby=${describedBy}
        @change=${(event: Event) =>
          this.change(
            this.path,
            (event.target as HTMLInputElement).checked ? checked : unchecked,
          )}
      />`;
    }
    if (kind === "color")
      return html`<input
        type="color"
        id=${id}
        aria-invalid=${invalid}
        aria-describedby=${describedBy}
        .value=${live(colourInputValue(this.value))}
        @input=${(event: Event) =>
          this.change(
            this.path,
            colourValue((event.target as HTMLInputElement).value, this.value),
          )}
      />`;
    const attributes = inputAttributes(this.schema);
    const onInput = (event: Event) =>
      this.change(
        this.path,
        inputValue(
          kind,
          (event.target as HTMLInputElement | HTMLTextAreaElement).value,
        ),
      );
    if (kind === "textarea")
      return html`<textarea
        id=${id}
        rows=${attributes.rows ?? 3}
        minlength=${attributes.minlength ?? nothing}
        maxlength=${attributes.maxlength ?? nothing}
        placeholder=${attributes.placeholder ?? nothing}
        ?required=${this.required}
        aria-invalid=${invalid}
        aria-describedby=${describedBy}
        .value=${live(String(this.value ?? ""))}
        @input=${onInput}
      ></textarea>`;
    return html`<input
      type=${kind}
      id=${id}
      min=${attributes.min ?? nothing}
      max=${attributes.max ?? nothing}
      step=${attributes.step ?? nothing}
      minlength=${attributes.minlength ?? nothing}
      maxlength=${attributes.maxlength ?? nothing}
      pattern=${attributes.pattern ?? nothing}
      placeholder=${attributes.placeholder ?? nothing}
      ?required=${this.required}
      aria-invalid=${invalid}
      aria-describedby=${describedBy}
      .value=${live(String(this.value ?? ""))}
      @input=${onInput}
    />`;
  }

  override render() {
    const id = pathId(this.path);
    const kind = editorKind(this.schema);
    const blur = () =>
      this.dispatchEvent(
        new CustomEvent<string>("metadata-blur", {
          detail: this.path,
          bubbles: true,
        }),
      );
    // Focus leaving this field (not moving inside it) checks it
    const onFocusOut = (event: FocusEvent) => {
      if (!this.contains(event.relatedTarget as Node | null)) blur();
    };
    if (kind === "object")
      return html`<div @focusout=${onFocusOut}>${this.renderObject(id)}</div>`;
    if (kind === "list")
      return html`<div @focusout=${onFocusOut}>${this.renderList(id)}</div>`;
    if (kind === "radio")
      return html`<div @focusout=${onFocusOut}>${this.renderRadio(id)}</div>`;
    const label = html`<label for=${id}
      >${this.fieldTitle}${
        this.required
          ? html`<span class="required" aria-hidden="true"> *</span>`
          : nothing
      }</label
    >`;
    // A checkbox comes before its label (on its left in left-to-right text), with its notes below
    if (kind === "checkbox")
      return html`<div
        class="metadata-field metadata-checkbox"
        @focusout=${onFocusOut}
      >
        <div class="metadata-check">${this.renderInput(id, kind)} ${label}</div>
        ${this.renderNotes(id)}
      </div>`;
    return html`<div class="metadata-field" @focusout=${onFocusOut}>
      ${label} ${this.renderNotes(id)} ${this.renderInput(id, kind)}
    </div>`;
  }
}

defineElement("edaha-metadata-field", EdahaMetadataField);
