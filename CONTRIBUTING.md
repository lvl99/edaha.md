# Contributing to edaha.md

Thank you for helping. edaha.md is free and open source under the [Apache License 2.0](LICENSE), and contributions are accepted under the same licence.

## Developer Certificate of Origin (DCO)

Every commit must be signed off. Signing off certifies that you wrote the change, or otherwise have the right to submit it under edaha.md's licence, as set out in the [Developer Certificate of Origin 1.1](https://developercertificate.org/).

Sign off by adding this line to the end of each commit message, using your real name and email address:

```
Signed-off-by: Your Name <you@example.com>
```

Git adds it for you with `-s`:

```sh
git commit -s -m "Fixed feeds missing the newest article."
```

To sign off commits you already made on your branch:

```sh
git rebase --signoff main
```

Pull requests with commits that aren't signed off can't be merged. There is no Contributor Licence Agreement (CLA).

## Making changes

See [Development](README.md#development) in the README to set up the project.

1. Open an issue first for large changes, so the approach can be agreed before you start.
2. Keep pull requests small and focused on one change.
3. Add or update unit tests for every change; tests sit in a `tests` folder beside the code, named `*.test.ts`.
4. Run the checks before opening a pull request:

   ```sh
   pnpm typecheck
   pnpm test:coverage
   pnpm lint
   pnpm format:check
   ```

## Code style

- TypeScript, formatted with Prettier and checked with ESLint.
- Every method has a short comment saying what it does, with an example where it helps.
- Readable `camelCase` names; short names only for loop counters.
- Node.js code (`src/generator`, `src/server`, `src/editor`, `src/cli`, `src/embeds`) imports with explicit `.ts` extensions. The editor page (`src/client`) uses Lit and Tiptap.
- The default theme and the editor follow WCAG 2.2 and work with mouse, keyboard and touch.
