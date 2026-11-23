// The article editor for other apps' pages: `<edaha-editor>` (defined when this is imported), the API client that
// connects it to an editor server (see startEditor), and `<edaha-metadata-field>`, which builds a form's fields from a
// JSON Schema with `$edahaField`s (as the editor's custom metadata and embed options). Its styles are "@lvl99dotcom/edaha-editor/client/style.css",
// which also has edaha.md's design tokens (CSS variables) for the page around it.
export { EdahaEditor } from "./components/edaha-editor/index.ts";
export {
  EdahaMetadataField,
  type MetadataChange,
} from "./components/edaha-metadata-field/index.ts";
export {
  ApiError,
  EditorApi,
  type ArticleLocation,
  type EditorApiOptions,
} from "./editorApi/index.ts";
