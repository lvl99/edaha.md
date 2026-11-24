import { describe, expect, it } from "vitest";
import { fileTypeLabel, formatFileSize } from "..";

describe("formatFileSize", () => {
  it("should show sizes in B, KB, MB or GB, with one decimal below 10", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(20 * 1024 + 300)).toBe("20 KB");
    expect(formatFileSize(3 * 1024 ** 2)).toBe("3 MB");
    expect(formatFileSize(5.25 * 1024 ** 3)).toBe("5.3 GB");
    expect(formatFileSize(4096 * 1024 ** 3)).toBe("4096 GB");
  });
});

describe("fileTypeLabel", () => {
  it("should name a file's type by its extension and kind", () => {
    expect(fileTypeLabel("photo.png", "image")).toBe("PNG image");
    expect(fileTypeLabel("guide.Pdf", "document")).toBe("PDF document");
    expect(fileTypeLabel("notes.txt", "other")).toBe("TXT file");
    expect(fileTypeLabel("notes", "other")).toBe("File");
  });
});
