// Builds edaha.md's website (site/) with the config's siteUrl and publishes it to the gh-pages branch, which GitHub
// Pages serves at https://edaha.md (site/static/CNAME names the domain). Run with `pnpm site:publish`; add `--dry-run` to build and commit
// in a temporary folder and show what would be published, without pushing. Uses this repository's `origin` remote and
// your git identity.
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSite } from "@lvl99dotcom/edaha.md/generator/build";

/** The branch GitHub Pages publishes */
const BRANCH = "gh-pages";

const projectDir = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");

/** Run git in a folder, giving its output */
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const source = git(projectDir, "rev-parse", "--short", "HEAD");
// Built with the config's siteUrl, so every URL starts with its path (none for https://edaha.md)
const { outputDir, articles } = await buildSite({ siteDir: projectDir });
console.log(`Built ${articles.length} articles from ${source}`);

const worktree = await mkdtemp(join(tmpdir(), "edaha-gh-pages-"));
try {
  const published = git(projectDir, "ls-remote", "--heads", "origin", BRANCH);
  if (published) {
    git(projectDir, "fetch", "origin", BRANCH);
    git(projectDir, "worktree", "add", "--detach", worktree, "FETCH_HEAD");
  } else {
    // The first time, the branch starts without history
    git(projectDir, "worktree", "add", "--orphan", "-b", BRANCH, worktree);
  }
  // Replace everything with the new build
  for (const name of await readdir(worktree))
    if (name !== ".git")
      await rm(join(worktree, name), { recursive: true, force: true });
  await cp(outputDir, worktree, { recursive: true });
  // Serve files as they are, without Jekyll
  await writeFile(join(worktree, ".nojekyll"), "");
  git(worktree, "add", "--all");
  if (!git(worktree, "status", "--porcelain")) {
    console.log("The website hasn't changed; nothing to publish");
  } else {
    git(
      worktree,
      "commit",
      "--signoff",
      "--message",
      `Published the website from ${source}`,
    );
    if (dryRun)
      console.log(
        `Dry run, so not pushed:\n${git(worktree, "show", "--stat", "--format=%s", "HEAD")}`,
      );
    else {
      git(worktree, "push", "origin", `HEAD:refs/heads/${BRANCH}`);
      console.log(`Published to ${BRANCH}`);
    }
  }
} finally {
  git(projectDir, "worktree", "remove", "--force", worktree);
  // The orphan branch made the first time is only needed on the remote
  if (git(projectDir, "branch", "--list", BRANCH))
    git(projectDir, "branch", "-D", BRANCH);
}
