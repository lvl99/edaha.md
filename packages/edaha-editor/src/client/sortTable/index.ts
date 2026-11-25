import { html } from "lit";
import type { ArticleOrder } from "../../server/types/index.ts";

/** How a table is sorted: by a column, ascending or descending, or neither (its default order) */
export interface TableSort<S extends string> {
  sort?: S | undefined;
  order?: ArticleOrder | undefined;
}

/**
 * How a table is sorted after pressing a column's heading: another column sorts ascending, the sorted column changes
 * to descending, and a column sorted descending goes back to the table's default order.
 *
 * @example
 * nextSort({}, "title"); // { sort: "title", order: "asc" }
 * nextSort({ sort: "title", order: "asc" }, "title"); // { sort: "title", order: "desc" }
 * nextSort({ sort: "title", order: "desc" }, "title"); // {}
 */
export const nextSort = <S extends string>(
  current: TableSort<S>,
  column: S,
): TableSort<S> => {
  if (current.sort !== column) return { sort: column, order: "asc" };
  return current.order === "asc" ? { sort: column, order: "desc" } : {};
};

/**
 * Render a column's heading: a button that sorts by it (see `nextSort`), with an arrow showing which way it is sorted,
 * a tooltip saying what pressing it does, and `aria-sort` for screen readers.
 *
 * @example
 * html`<tr>${sortHeading("title", "Title", { sort, order }, (column) => sortBy(column))}</tr>`
 */
export const sortHeading = <S extends string>(
  column: S,
  label: string,
  current: TableSort<S>,
  onSort: (column: S) => void,
) => {
  const order = current.sort === column ? current.order : undefined;
  const next = nextSort(current, column);
  const hint = next.sort
    ? `Sort by ${label.toLowerCase()}, ${next.order === "asc" ? "ascending" : "descending"}`
    : "Go back to the default order";
  return html`<th
    scope="col"
    aria-sort=${order ? (order === "asc" ? "ascending" : "descending") : "none"}
  >
    <button
      type="button"
      class="btn btn-sort"
      title=${hint}
      @click=${() => onSort(column)}
    >
      ${label}<span class="sort-heading-arrow" aria-hidden="true"
        >${order === "asc" ? "▲" : order === "desc" ? "▼" : ""}</span
      >
    </button>
  </th>`;
};
