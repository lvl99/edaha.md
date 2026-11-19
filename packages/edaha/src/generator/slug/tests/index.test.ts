import { describe, expect, it } from "vitest";
import { headingIds, isSlug, slugify } from "..";

describe("slugify", () => {
  it("should convert titles to lowercase kebab-case", () => {
    expect(slugify("This is an example of an article title")).toBe(
      "this-is-an-example-of-an-article-title",
    );
  });

  it("should strip quotes and squash other characters into single dashes", () => {
    expect(slugify("What?! Who Is This?!? I don't think so...")).toBe(
      "what-who-is-this-i-dont-think-so",
    );
    expect(slugify(`"Quoted" ‘curly’ “double”`)).toBe("quoted-curly-double");
  });

  it("should convert accented letters to basic Latin", () => {
    expect(slugify("Café Naïve Zoë Ångström")).toBe("cafe-naive-zoe-angstrom");
    expect(slugify("Straße Æsir Œuvre Øre Łódź Þór Đorđe")).toBe(
      "strasse-aesir-oeuvre-ore-lodz-thor-dorde",
    );
  });

  it("should return an empty slug when there are no letters or numbers", () => {
    expect(slugify("?!")).toBe("");
  });
});

describe("isSlug", () => {
  it("should accept only non-empty slugs", () => {
    expect(isSlug("hello-world")).toBe(true);
    expect(isSlug("Hello World")).toBe(false);
    expect(isSlug("")).toBe(false);
  });
});

describe("headingIds", () => {
  it("should make IDs from heading text, numbering repeats and skipping headings without letters or numbers", () => {
    expect(
      headingIds([
        "This?! Is an, example...",
        "Notes",
        "Notes",
        "!!!",
        "Notes",
        "notes-2",
      ]),
    ).toEqual([
      "this-is-an-example",
      "notes",
      "notes-2",
      "",
      "notes-3",
      "notes-2-2",
    ]);
    expect(headingIds([])).toEqual([]);
  });
});
