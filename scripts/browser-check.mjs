import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const baseUrl = "http://127.0.0.1:8000";
const port = 9333;
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "google-chrome",
  "chromium"
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => candidate.includes("\\") ? existsSync(candidate) : true);

if (!chrome) throw new Error("No Chrome-compatible browser found. Set CHROME_PATH.");

const profile = mkdtempSync(join(tmpdir(), "osa-browser-profile-"));
const screenshots = mkdtempSync(join(tmpdir(), "osa-site-shots-"));
const failures = [];
const browserEvents = [];
let currentPath = "";
const delay = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener("open", resolvePromise, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  once(method, timeout = 10000) {
    return new Promise((resolvePromise, reject) => {
      const listener = (params) => {
        clearTimeout(timer);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(method, listeners.filter((candidate) => candidate !== listener));
        resolvePromise(params);
      };
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      this.on(method, listener);
    });
  }

  close() {
    this.socket.close();
  }
}

const processHandle = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

const waitForBrowser = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("Headless browser did not expose its debugging endpoint.");
};

let client;
try {
  await waitForBrowser();
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" }).then((response) => response.json());
  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Log.enable"),
    client.send("Network.enable")
  ]);

  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    browserEvents.push(`Exception: ${exceptionDetails.text} at ${exceptionDetails.url || "unknown URL"}`);
  });
  client.on("Log.entryAdded", ({ entry }) => {
    const expectedMissingPage = currentPath === "/not-a-real-page" && entry.text.includes("404");
    if (entry.level === "error" && !expectedMissingPage) browserEvents.push(`Console: ${entry.text}`);
  });
  client.on("Network.loadingFailed", ({ errorText, canceled }) => {
    if (!canceled) browserEvents.push(`Resource load failed: ${errorText}`);
  });

  const evaluate = async (expression) => {
    const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };

  const navigate = async (path) => {
    currentPath = path;
    const loaded = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: `${baseUrl}${path}` });
    await loaded;
    await delay(180);
  };

  const viewport = (width, height) => client.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 600
  });

  const pages = [
    "/", "/about.html", "/experience.html", "/projects.html", "/articles.html", "/contact.html",
    "/articles/understanding-const-in-c.html", "/articles/pointer-values-and-object-addresses.html",
    "/articles/realloc-and-pointer-validity.html", "/not-a-real-page"
  ];

  for (const width of [1440, 768, 375]) {
    await viewport(width, width === 375 ? 812 : 900);
    for (const page of pages) {
      await navigate(page);
      const state = await evaluate(`(() => ({
        title: document.title,
        h1: document.querySelectorAll('h1').length,
        main: Boolean(document.querySelector('main')),
        overflow: document.documentElement.scrollWidth - window.innerWidth
      }))()`);
      if (!state.title || state.h1 !== 1 || !state.main) failures.push(`${page} at ${width}px: incomplete document structure`);
      if (state.overflow > 1) failures.push(`${page} at ${width}px: horizontal overflow of ${state.overflow}px`);
    }
  }

  await viewport(1440, 900);
  await navigate("/");
  const desktopShot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(screenshots, "home-desktop.png"), Buffer.from(desktopShot.data, "base64"));

  await viewport(375, 812);
  await navigate("/");
  const mobileShot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(screenshots, "home-mobile.png"), Buffer.from(mobileShot.data, "base64"));

  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
  const keyboardFocus = await evaluate(`(() => ({
    skipLink: document.activeElement.classList.contains('skip-link'),
    outline: parseFloat(getComputedStyle(document.activeElement).outlineWidth)
  }))()`);
  if (!keyboardFocus.skipLink || keyboardFocus.outline < 2) failures.push("Keyboard entry did not expose the focused skip link");

  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const reducedTransition = await evaluate(`parseFloat(getComputedStyle(document.querySelector('.button')).transitionDuration)`);
  if (reducedTransition > 0.001) failures.push(`Reduced-motion transition remained too long (${reducedTransition}s)`);
  await client.send("Emulation.setEmulatedMedia", { features: [] });

  const opened = await evaluate(`(() => {
    const toggle = document.querySelector('[data-nav-toggle]');
    toggle.click();
    return { expanded: toggle.getAttribute('aria-expanded'), open: document.querySelector('[data-site-nav]').dataset.open };
  })()`);
  if (opened.expanded !== "true" || opened.open !== "true") failures.push("Mobile menu did not open or expose expanded state");
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  const closed = await evaluate(`(() => ({
    expanded: document.querySelector('[data-nav-toggle]').getAttribute('aria-expanded'),
    focused: document.activeElement === document.querySelector('[data-nav-toggle]')
  }))()`);
  if (closed.expanded !== "false" || !closed.focused) failures.push("Escape did not close the mobile menu and restore focus");

  const themeLight = await evaluate(`(() => {
    document.querySelector('[data-theme-toggle]').click();
    return { saved: localStorage.getItem('preferred-theme'), applied: document.documentElement.dataset.theme };
  })()`);
  if (themeLight.saved !== "light" || themeLight.applied !== "light") failures.push("Theme did not switch from System to Light");
  await navigate("/");
  const persisted = await evaluate(`document.documentElement.dataset.theme`);
  if (persisted !== "light") failures.push("Light theme did not persist across navigation");
  const themeCycle = await evaluate(`(() => {
    const toggle = document.querySelector('[data-theme-toggle]');
    toggle.click();
    const dark = { saved: localStorage.getItem('preferred-theme'), applied: document.documentElement.dataset.theme };
    toggle.click();
    const system = { saved: localStorage.getItem('preferred-theme'), applied: document.documentElement.hasAttribute('data-theme') };
    return { dark, system };
  })()`);
  if (themeCycle.dark.saved !== "dark" || themeCycle.dark.applied !== "dark") failures.push("Dark theme state was not applied");
  if (themeCycle.system.saved !== null || themeCycle.system.applied) failures.push("System theme did not clear the stored override");

  await navigate("/articles.html");
  const searchState = await evaluate(`(async () => {
    const input = document.querySelector('[data-search-input]');
    input.value = 'realloc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 30));
    const filtered = document.querySelectorAll('[data-article-results] [data-article-card]').length;
    const title = document.querySelector('[data-article-results] h2')?.textContent;
    document.querySelector('[data-search-reset]').click();
    const reset = document.querySelectorAll('[data-article-results] [data-article-card]').length;
    const category = document.querySelector('[data-category-filter]');
    category.value = 'Memory Management';
    category.dispatchEvent(new Event('change', { bubbles: true }));
    const categoryCount = document.querySelectorAll('[data-article-results] [data-article-card]').length;
    document.querySelector('[data-search-reset]').click();
    const tag = document.querySelector('[data-tag-filter]');
    tag.value = 'const';
    tag.dispatchEvent(new Event('change', { bubbles: true }));
    const tagCount = document.querySelectorAll('[data-article-results] [data-article-card]').length;
    document.querySelector('[data-search-reset]').click();
    return { filtered, title, reset, categoryCount, tagCount, count: document.querySelector('[data-result-count]').textContent };
  })()`);
  if (searchState.filtered !== 1 || !searchState.title.includes("realloc")) failures.push("Article search did not isolate the realloc article");
  if (searchState.reset !== 3 || !searchState.count.includes("3 articles")) failures.push("Article search reset did not restore all records");
  if (searchState.categoryCount !== 1 || searchState.tagCount !== 1) failures.push("Category or tag filtering returned an incorrect result set");

  await viewport(1440, 900);
  await navigate("/articles/understanding-const-in-c.html");
  const articleShot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(screenshots, "article-desktop.png"), Buffer.from(articleShot.data, "base64"));
  try {
    await client.send("Browser.grantPermissions", { origin: baseUrl, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  } catch {}
  const codeTools = await evaluate(`(() => {
    const blocks = document.querySelectorAll('.code-block').length;
    const buttons = document.querySelectorAll('.copy-button').length;
    const first = document.querySelector('.copy-button');
    document.documentElement.style.scrollBehavior = 'auto';
    first.scrollIntoView({ block: 'center' });
    const rect = first.getBoundingClientRect();
    return { blocks, buttons, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: codeTools.x, y: codeTools.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: codeTools.x, y: codeTools.y, button: "left", clickCount: 1 });
  await delay(100);
  const articleTools = await evaluate(`(async () => {
    const first = document.querySelector('.copy-button');
    const copyLabel = first.textContent;
    document.documentElement.style.scrollBehavior = 'auto';
    document.getElementById('casting-away-const').scrollIntoView();
    await new Promise(resolve => setTimeout(resolve, 250));
    const active = document.querySelector('.article-toc a[aria-current="true"]')?.getAttribute('href');
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    await new Promise(resolve => setTimeout(resolve, 120));
    const progress = Number(document.querySelector('[data-reading-progress]').style.getPropertyValue('--progress'));
    return { copyLabel, active, progress };
  })()`);
  if (!codeTools.blocks || codeTools.buttons !== codeTools.blocks) failures.push("Copy buttons were not added to every code block");
  if (articleTools.copyLabel !== "Copied") failures.push(`Clipboard copy did not confirm success (label: ${articleTools.copyLabel})`);
  if (articleTools.active !== "#casting-away-const") failures.push(`Active heading state was incorrect (${articleTools.active})`);
  if (articleTools.progress < 0.9) failures.push(`Reading progress did not reach the article end (${articleTools.progress})`);

  await client.send("Emulation.setScriptExecutionDisabled", { value: true });
  await viewport(375, 812);
  await navigate("/");
  const noScriptHome = await evaluate(`(() => {
    const nav = document.querySelector('[data-site-nav]');
    return {
      links: nav.querySelectorAll('a').length,
      visible: getComputedStyle(nav).display !== 'none',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      jsClass: document.documentElement.classList.contains('js')
    };
  })()`);
  if (!noScriptHome.visible || noScriptHome.links < 7 || noScriptHome.jsClass || noScriptHome.overflow > 1) failures.push("No-JavaScript mobile navigation is not fully usable");
  await navigate("/articles.html");
  const noScriptArticles = await evaluate(`document.querySelectorAll('[data-article-results] [data-article-card]').length`);
  if (noScriptArticles !== 3) failures.push("No-JavaScript article index is incomplete");
  await navigate("/articles/realloc-and-pointer-validity.html");
  const noScriptArticle = await evaluate(`({ body: document.querySelector('[data-article-body]').innerText.length, toc: document.querySelectorAll('.article-toc a').length })`);
  if (noScriptArticle.body < 3000 || noScriptArticle.toc < 5) failures.push("No-JavaScript article content or table of contents is incomplete");
  await client.send("Emulation.setScriptExecutionDisabled", { value: false });

  if (browserEvents.length) failures.push(...browserEvents);

  if (failures.length) {
    console.error(`Browser validation failed with ${failures.length} issue(s):`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  } else {
    console.log("Browser validation passed.");
    console.log(`- 10 routes checked at 1440px, 768px, and 375px`);
    console.log("- Mobile navigation, Escape handling, focus restoration, and horizontal overflow checked");
    console.log("- System/Light/Dark theme cycle and persistence checked");
    console.log("- Search, category/tag filters, reset, code copy, active TOC, and reading progress checked");
    console.log("- Keyboard skip-link focus and reduced-motion behavior checked");
    console.log("- Home, article index, and article checked with JavaScript disabled");
    console.log(`- Screenshots: ${screenshots}`);
  }
} finally {
  client?.close();
  processHandle.kill();
  await Promise.race([
    new Promise((resolvePromise) => processHandle.once("exit", resolvePromise)),
    delay(1200)
  ]);
  const safeTempRoot = resolve(tmpdir()) + sep;
  if (resolve(profile).startsWith(safeTempRoot)) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // A browser subprocess may briefly retain a profile file on Windows.
    }
  }
}
