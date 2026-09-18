import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildContentPages } from "./pages.mjs";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(websiteRoot, "../..");
export const outputDirectory = resolve(websiteRoot, "dist");
const runCommand = promisify(execFile);
const siteURL = new URL(process.env.SITE_URL || "https://koughen.github.io/Editor/");
if (!siteURL.pathname.endsWith("/")) siteURL.pathname += "/";

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(websiteRoot, "public"), outputDirectory, { recursive: true });
await mkdir(resolve(outputDirectory, "media"), { recursive: true });
for (const file of ["styles.css", "main.js", "help.css", "help.js"]) {
  await cp(resolve(websiteRoot, file), resolve(outputDirectory, file));
}
for (const workspace of ["edit", "color", "audio", "export"]) {
  const file = `${workspace}-workspace.png`;
  await cp(resolve(repoRoot, "docs/screenshots", file), resolve(outputDirectory, "media", file));
  for (const width of [480, 960, 1440]) {
    await runCommand('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', resolve(repoRoot, 'docs/screenshots', file), '-vf', `scale='min(${width},iw)':-2`, '-q:v', '3', resolve(outputDirectory, 'media', `${workspace}-${width}.jpg`)]);
  }
}
await cp(resolve(repoRoot, "apps/tauri/src-tauri/icons/128x128.png"), resolve(outputDirectory, "media/editor-icon.png"));
const html = (await readFile(resolve(websiteRoot, "index.html"), "utf8")).replaceAll("__SITE_URL__", siteURL.href);
await writeFile(resolve(outputDirectory, "index.html"), html);
await writeFile(resolve(outputDirectory, ".nojekyll"), "");
await writeFile(resolve(outputDirectory, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${siteURL.href}sitemap.xml\n`);
const contentPaths = await buildContentPages({ outputDirectory, repoRoot, siteURL: siteURL.href });
await writeFile(resolve(outputDirectory, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...contentPaths.map((path) => `${path}/`)].map((path) => `<url><loc>${siteURL.href}${path}</loc></url>`).join('')}</urlset>\n`);
console.log(`Built Editor website in ${outputDirectory}`);
