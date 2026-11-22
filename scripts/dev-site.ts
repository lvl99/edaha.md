// Builds and serves the edaha.md website (site/) on this computer, and rebuilds it whenever its articles, config file,
// templates, static files or the default theme change, reloading open pages. Run with `pnpm site:dev`. Set PORT to use
// another port than 8449 (U+8449 is 葉, "leaf").
import { existsSync, watch } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { buildSite } from "@lvl99dotcom/edaha.md/generator/build";
import {
  CONFIG_FILES,
  loadSiteConfig,
} from "@lvl99dotcom/edaha.md/generator/configFile";
import { THEME_DIR } from "@lvl99dotcom/edaha.md/theme";
import { startSiteServer } from "./site-server.ts";

const projectDir = resolve(import.meta.dirname, "..");
const { configFile, siteDir, config, themeDir } = await loadSiteConfig({
  siteDir: projectDir,
});

/** The folder being served: the last successful build's */
let outputDir = resolve(siteDir, config.outputDir);

/** How long to wait for more changes before rebuilding, in milliseconds (editors often save in several steps) */
const SETTLE_TIME = 150;

const server = await startSiteServer({
  root: () => outputDir,
  port: 8449,
  liveReload: true,
}).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});

/** Whether a build is running, and whether another is needed once it finishes */
let building = false;
let pending = false;

/**
 * Build the website (with the config file as it is now), then reload open pages. Problems are reported and the last
 * build stays served. Changes during a build start another one when it finishes.
 */
const rebuild = async (): Promise<void> => {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  const started = performance.now();
  try {
    const result = await buildSite({
      siteDir: projectDir,
      // Feeds link to the local website
      siteUrl: server.url,
    });
    outputDir = result.outputDir;
    console.log(
      `Built ${result.articles.length} articles in ${Math.round(performance.now() - started)} ms`,
    );
    server.reload();
  } catch (error) {
    console.error(`Build failed: ${(error as Error).message}`);
  }
  building = false;
  if (pending) {
    pending = false;
    await rebuild();
  }
};

let timer: NodeJS.Timeout | undefined;

/** Whether a path is in the build folder, whose changes come from the build itself */
const inOutput = (path: string) => {
  const fromOutput = relative(outputDir, path);
  return !fromOutput.startsWith("..") && !isAbsolute(fromOutput);
};

/** Rebuild once changes have settled */
const changed = (path: string) => {
  if (inOutput(path)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`Changed: ${relative(projectDir, path)}`);
    void rebuild();
  }, SETTLE_TIME);
};

// Folders whose files go into the website: site/ (its articles), the site's templates and static files, and the theme
const folders = [
  join(projectDir, "site"),
  join(siteDir, config.articlesDir),
  join(siteDir, config.templatesDir),
  join(siteDir, config.staticDir),
  themeDir ?? THEME_DIR,
].filter(
  (folder, index, all) =>
    existsSync(folder) &&
    all.indexOf(folder) === index &&
    // Folders inside another watched folder are already watched
    !all.some(
      (other) =>
        other !== folder &&
        !relative(other, folder).startsWith("..") &&
        !isAbsolute(relative(other, folder)),
    ),
);
for (const folder of folders)
  watch(folder, { recursive: true }, (_, file) =>
    changed(file ? join(folder, file) : folder),
  );

// The config file's folder, for changes to any config file (including one added or renamed)
watch(dirname(configFile), (_, file) => {
  if (file && CONFIG_FILES.includes(basename(file)))
    changed(join(dirname(configFile), file));
});

await rebuild();
console.log(
  `Serving ${relative(projectDir, outputDir)} at ${server.url} and rebuilding on changes to ${[
    ...folders.map((folder) => relative(projectDir, folder) || "."),
    basename(configFile),
  ].join(", ")} (press Ctrl+C to stop)`,
);
