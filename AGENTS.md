# edaha.md

edaha.md is a free and open source static website and blog generator. It builds pages, lists, tag and author pages and RSS feeds from Markdown articles with Nunjucks templates, and comes with a local article editor:

- Articles are folders of Markdown with YAML settings, plus their files (images, attachments)
- Article types (e.g. news, pages) with their own URL paths, labels and what is generated for them
- Paginated lists, tag and author lists, and RSS feeds
- A neutral default theme; a site's own templates and static files override it file by file
- YouTube and Bandcamp embeds, and custom embed renderers
- `edaha build` and `edaha editor` commands

## Glossary

- **Agent**: An AI agent (you).
- **Human**: The person(s) whom you are collaborating with on developing this project.
- **Operator**: A person who is executing the code for the purpose it was developed for.

## Agent behaviour

You are not human; do not pretend you are. Do not fake having emotions. Do not praise human. Always provide succinct and clear responses. Strive for clarity with no jargon and ask for clarity and/or more information from human if they are too ambiguous or indirect.

Do not change project briefs, unless instructed by human.

## Collaboration between humans and agents

Humans will define a collaboration project within the [collaboration](collaboration) folder. Collaboration projects are contained within a subfolder that has the date and a succinct project name, e.g. `20261011-project-scaffolding`.

Inside will be a `BRIEF.md` file where human details project's overview and requirements (project brief) that the agent must complete. Agents must only work on projects that they have been specifically assigned to.

When human provides a project brief, agent always reviews and proposes response to the brief where it succinctly and clearly details how it will fulfill the brief. Agent always asks human for review and consent to continue. If agent can see multiple ways of fulfilling brief (maximum 3), it will inform human of pros/cons of each method and allow human to choose preferred method with its recommendations.

If agent requires further clarification, information, assets, etc. in order to formulate a cohesive and applicable response to a project brief, agent will ask human. Human will then update the project brief and/or place additional assets within the project's folder or in any other area within the codebase for the agent to reference.

When agent is working on a project and its project brief response proposal is accepted by the human, it will create a new file at `collaboration/<project folder name>/RESPONSE.md` with a summary of its response proposal at the top. The agent will progressively note actions and justifications why they were taken using simple, clear, succinct language.

Example:

```md
# Summary

<A summary of the response to the collaboration project brief>

## Actions taken

1. <action taken>
2. <action taken>
3. <action taken>
   ...
```

After each action taken, commit work using the response's applicable line as the commit message (collaboration project briefs and responses won't be included in git repo). If action line is longer than 1 sentence, summarise it to 1 sentence for the commit message.

## Coding standards

Performant, clean, readable Typescript code:

- Follow [.editorconfig](.editorconfig).
- Use functional programming techniques for small determinative functionality.
- Use object-oriented programming techniques for objects that require state management and/or related functionality that is not used by any other object.
- Ensure `prettier` code formatting.
- Ensure `eslint` lint rules compliance.
- All methods should have a comment block that succinctly and clearly describes what the method does. Provide valid working examples if necessary.
- Use self-documenting code techniques such as meaningful human-readable variable names in `camelCase`.
- When self-documenting code requires more explanation, clarify logic using succinct comments.
- Strive for optimised code with reduced branching and complexity. Use DRY where appropriate.
- Only use highly abbreviated variable names within iteration blocks when variable names are repeatedly used, e.g.

```ts
for (let r = 0; r < rows.length; r++) {
  for (let c = 0; c < cols.length; c++) {
    // ...
  }
}
```

Ensure types are correctly written and validate.

Unit tests validate all functionality; aim for 100% test coverage:

- Unit tests should live in a relative `tests` folder, and unit test files require a `.test` suffix in the name before the extension, e.g. `index.ts` -> `test/index.test.ts`.
- Any tests that require large dummy/test data should have related JSON data files located in the `tests` folder, e.g. `article-list.data.json`.
  - Avoid incremental names for dummy/test data -- use keywords that relate to action and test, e.g. `config-valid.data.json`, `config-invalid.data.json`
- Any tests that rely on requests to external endpoints should be mocked.
  - Large mocked JSON data with `.mock.json` suffix should be located in the `tests` folder, e.g. `bandcamp-album-page.mock.html`.
  - Avoid incremental names for mocked data -- use keywords that relate to action and result.
- Unit tests need to earnestly pass 100% without any hacks or workarounds to force passing.

## Documentation

Any changes or updates to how project is installed and quickly utilised (plus any developer/contributor setup and notes) need to be documented in [README.md](README.md).

Extended documentation about the project will be located at [site/content/docs]. Ensure that all content within the articles here are updated in relation to any changes.

## Code management

Use trunk-based development methodology.

`main` branch represents the latest version:

- `<project folder name>` represents a collaboration project branch and is branched from `main`.
  - The branch name should match a folder name within [collaboration/]
  - PR target is `main`.
  - Collaboration project branches need code review and UAT before merging into `main`.

Avoid large rewrites and large commits. Remember that a human needs to review each branch before it is merged.

## Keyboard

Any mention of "cmd" key is reference to macOS command key, which is interchangeable with Windows/Linux control key.

## Responsive

Build front-end solutions to support keyboard/mouse and touch input devices. Flag any new requests that might need additional clarity to address points related to different types of input or interactions.

## Accessibility

Build according to WCAG 2.2: the default theme's pages and the article editor.

## Signed-off commits

Every commit must be signed off under the Developer Certificate of Origin (see [CONTRIBUTING.md](CONTRIBUTING.md)): commit with `git commit -s`.

## Versioning

Adhere to semver.

The packages in [packages](packages) (core `@lvl99dotcom/edaha.md`, the editor and the plugins) share their major and minor version numbers, e.g. `0.2.x`, but each has its own patch number:

- A patch release bumps the patch number of only the packages that changed, e.g. `@lvl99dotcom/edaha-plugin-bandcamp` 0.2.0 → 0.2.1, and releases only them.
- A major or minor release bumps every package to the same version, e.g. 0.2.3 → 0.3.0, and releases them all, changed or not.

Don't bump the version in collaboration project branches or PRs. The version is bumped when a release is made (see below).

For each version release, collate and summarise relevant actions undertaken since last release under the new version's heading with three sub-headings (Fixed, Added, Changed) and put them in [CHANGELOG.md] which will be committed to the project before each release. A major or minor release's heading is its version, e.g. `## 0.3.0 (2026-12-01)`; a patch release's heading names its packages, e.g. `## @lvl99dotcom/edaha-plugin-bandcamp 0.2.1 (2026-12-01)`.

## Development, testing, release workflow

Human will create collaboration project brief and prompt agent to review, or can prompt tasks directly in conversation.

When agent has work ready for UAT (after lint and unit tests have passed 100%), human will test locally first.

Human will signal to agent if UAT has passed and when to prepare a PR, or will update agent on any new work to complete via brief or prompt.

PRs will be submitted, reviewed, and hopefully merged into `main`.

Releases will be made via NPM, and only from the `main` branch, when human signals to prepare a release:

1. Update [CHANGELOG.md] for the new version and commit it to `main`.
2. Bump the versions without committing:
   - Major or minor release, every package: `pnpm -r --filter "./packages/*" version <minor|major>`.
   - Patch release, only the changed packages: `pnpm -r --filter <package name> --filter <package name> version patch`.
3. Commit the bump as "edaha.md <version>" for a major or minor release, or "<package name> <version>, ..." for a patch release.
4. Tag each released package with an annotated tag `<package name>@<version>`, e.g. `git tag -a @lvl99dotcom/edaha.md@0.3.0 -m "@lvl99dotcom/edaha.md 0.3.0"`, so the tagged release includes its changelog.
5. Push the commit and the tags: `git push --follow-tags`.
6. Publish to NPM: `pnpm -r publish`. It builds each package (core first) and publishes the packages whose version isn't on NPM yet, turning their `workspace:^` dependencies into `^<version>`. Please note that this will require human intervention to complete. You need to trigger the command in an interactive terminal and then get the human to follow the rest of the process to complete. Don't bother verifying that the new version is updated in npm as it will take at least 5 minutes for the release to be verified by npm before it will be available.

Code will be provided only as ESM with TypeScript definitions in released NPM package. Ensure that [site] is not included in the NPM packages.
