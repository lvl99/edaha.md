import { html, LitElement, nothing, unsafeCSS } from "lit";
import styles from "./style.css?inline";
import { defineElement } from "../define/index.ts";

/**
 * A group of article data fields (e.g. the author's name, email and homepage) shown as a fieldset. Its fields are
 * its children. A `multiple` group has an "Add" button (fires `group-add`); an `allowclear` group has a "Clear"
 * button (fires `group-clear`). The article handles both. A `changed` group's label ends with an asterisk, to show it
 * isn't saved yet.
 *
 * @example
 * html`<edaha-article-data-group label="Tags" multiple @group-add=${addTag}>...</edaha-article-data-group>`
 */
export class EdahaArticleDataGroup extends LitElement {
  static override properties = {
    name: {},
    label: {},
    multiple: { type: Boolean },
    allowclear: { type: Boolean },
    disabled: { type: Boolean },
    changed: { type: Boolean },
  };

  static override styles = unsafeCSS(styles);

  declare name: string;
  declare label: string;
  declare multiple: boolean;
  declare allowclear: boolean;
  declare disabled: boolean;
  /** Whether the group's values differ from the saved ones (the label gets an asterisk) */
  declare changed: boolean;

  constructor() {
    super();
    this.name = "";
    this.label = "";
    this.multiple = false;
    this.allowclear = false;
    this.disabled = false;
    this.changed = false;
  }

  /** Fire a group event */
  private fire(type: "group-add" | "group-clear") {
    this.dispatchEvent(
      new CustomEvent(type, { detail: this.name, bubbles: true }),
    );
  }

  override render() {
    return html`<fieldset ?disabled=${this.disabled}>
      ${
        this.label
          ? html`<legend>
              ${this.label}${
                this.changed
                  ? html`<span
                      class="changed"
                      title="Changed since it was saved"
                    >
                      *</span
                    >`
                  : nothing
              }
            </legend>`
          : nothing
      }
      <slot></slot>
      ${
        this.multiple
          ? html`<button
              type="button"
              class="add"
              @click=${() => this.fire("group-add")}
            >
              Add
            </button>`
          : nothing
      }
      ${
        this.allowclear
          ? html`<button
              type="button"
              class="clear"
              @click=${() => this.fire("group-clear")}
            >
              Clear
            </button>`
          : nothing
      }
    </fieldset>`;
  }
}

defineElement("edaha-article-data-group", EdahaArticleDataGroup);
