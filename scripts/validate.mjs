import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const errors = [];
const notes = [];

const walk = (directory) => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  if (name === ".git" || name === "node_modules") return [];
  return statSync(path).isDirectory() ? walk(path) : [path];
});

const files = walk(root);
const htmlFiles = files.filter((file) => extname(file) === ".html");
const normalizedRelative = (file) => relative(root, file).split(sep).join("/");
const htmlByPath = new Map(htmlFiles.map((file) => [normalizedRelative(file), readFileSync(file, "utf8")]));
const idsByPath = new Map();
const titles = new Map();
const descriptions = new Map();

for (const [page, html] of htmlByPath) {
  const ids = Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
  idsByPath.set(page, new Set(ids));
  for (const id of ids) {
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) errors.push(`${page}: duplicate id "${id}"`);
  }

  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim();
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]?.trim();
  if (!title) errors.push(`${page}: missing title`);
  if (!description) errors.push(`${page}: missing meta description`);
  if (!/<html\s+lang="en">/i.test(html)) errors.push(`${page}: missing English lang attribute`);
  if (!/<h1[\s>]/i.test(html)) errors.push(`${page}: missing h1`);
  if (!/class="skip-link"/.test(html)) errors.push(`${page}: missing skip link`);
  if (html.includes("Ã") || html.includes("Â") || html.includes("â€")) {
    errors.push(`${page}: possible mojibake text`);
  }
  if (/href="(?:#|\s*)"/.test(html)) errors.push(`${page}: empty or hash-only link`);
  if (/example@example\.com|github\.com\/username|x\.com\/username/i.test(html)) errors.push(`${page}: placeholder personal link`);

  if (title) {
    if (titles.has(title)) errors.push(`${page}: title duplicates ${titles.get(title)}`);
    else titles.set(title, page);
  }
  if (description) {
    if (descriptions.has(description)) errors.push(`${page}: description duplicates ${descriptions.get(description)}`);
    else descriptions.set(description, page);
  }

  for (const match of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch (error) { errors.push(`${page}: invalid JSON-LD (${error.message})`); }
  }
}

const resolveLocal = (page, reference) => {
  const [pathPart, fragment = ""] = reference.split("#", 2);
  const withoutQuery = pathPart.split("?", 1)[0];
  let target;
  if (!withoutQuery) target = page;
  else if (withoutQuery.startsWith("/")) target = withoutQuery.slice(1) || "index.html";
  else target = normalizedRelative(resolve(root, dirname(page), withoutQuery));
  if (target.endsWith("/")) target += "index.html";
  return { target, fragment: decodeURIComponent(fragment) };
};

for (const [page, html] of htmlByPath) {
  for (const match of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const reference = match[1].trim();
    if (!reference || /^(?:https?:|mailto:|tel:|data:)/i.test(reference)) continue;
    const { target, fragment } = resolveLocal(page, reference);
    const absolute = join(root, ...target.split("/"));
    if (!statSafe(absolute)) {
      errors.push(`${page}: missing local target "${reference}"`);
      continue;
    }
    if (fragment && extname(target) === ".html" && !idsByPath.get(target)?.has(fragment)) {
      errors.push(`${page}: missing fragment "#${fragment}" in ${target}`);
    }
  }
}

function statSafe(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

for (const jsonPath of ["assets/data/articles.json", "assets/data/site.json", "site.webmanifest"]) {
  try { JSON.parse(readFileSync(join(root, jsonPath), "utf8")); }
  catch (error) { errors.push(`${jsonPath}: invalid JSON (${error.message})`); }
}

const articles = JSON.parse(readFileSync(join(root, "assets/data/articles.json"), "utf8"));
for (const article of articles) {
  if (!statSafe(join(root, ...article.url.split("/")))) errors.push(`articles.json: missing ${article.url}`);
}

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
for (const match of sitemap.matchAll(/<loc>https:\/\/omerselcuk\.com\/([^<]*)<\/loc>/g)) {
  const local = match[1] || "index.html";
  if (!statSafe(join(root, ...local.split("/")))) errors.push(`sitemap.xml: missing local page for ${match[0]}`);
}
if (!sitemap.includes("http://www.sitemaps.org/schemas/sitemap/0.9")) errors.push("sitemap.xml: missing sitemap namespace");

notes.push(`${htmlFiles.length} HTML pages checked`);
notes.push(`${articles.length} article records checked`);
notes.push("Local href/src targets, fragments, duplicate IDs, metadata, JSON-LD, JSON data, and sitemap entries checked");

if (errors.length) {
  console.error(`Validation failed with ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log("Static validation passed.");
  notes.forEach((note) => console.log(`- ${note}`));
}
