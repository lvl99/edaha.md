// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ApiError, EdahaEditor, EdahaMetadataField, EditorApi } from "..";

describe("the editor for other apps' pages", () => {
  it("should define <edaha-editor> and give its API client", () => {
    expect(customElements.get("edaha-editor")).toBe(EdahaEditor);
    expect(new EditorApi({ baseUrl: "http://127.0.0.1:5193" }).baseUrl).toBe(
      "http://127.0.0.1:5193",
    );
    expect(new ApiError("Nope")).toBeInstanceOf(Error);
    expect(customElements.get("edaha-metadata-field")).toBe(EdahaMetadataField);
  });
});
