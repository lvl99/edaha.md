// The article editor's public API: start the local editor for an edaha.md site, or create its web app to serve it
// yourself. `edaha editor` (from @lvl99dotcom/edaha) uses startEditor.
export {
  createEditorServer,
  EDITOR_HOST,
  EDITOR_PORT,
  startEditor,
  type EditorServer,
  type EditorServerOptions,
} from "./editor/index.ts";
