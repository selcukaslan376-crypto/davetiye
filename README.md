# omerselcuk.com

A production-ready, dependency-free personal website for Ömer Selçuk Aslan. It serves as a professional profile, portfolio, technical blog, and long-term knowledge base focused on modern C and embedded software.

The deployed site is entirely static: HTML5, CSS3, local JSON, and small vanilla JavaScript enhancements. There is no build step, package manager, server runtime, database, external font, analytics script, or third-party UI dependency.

## Project structure

```text
.
├── index.html
├── about.html
├── experience.html
├── projects.html
├── articles.html
├── contact.html
├── 404.html
├── articles/
│   ├── understanding-const-in-c.html
│   ├── pointer-values-and-object-addresses.html
│   └── realloc-and-pointer-validity.html
├── assets/
│   ├── css/
│   │   ├── tokens.css
│   │   ├── base.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   ├── pages.css
│   │   ├── article.css
│   │   └── print.css
│   ├── data/
│   │   ├── articles.json
│   │   └── site.json
│   └── js/
│       ├── theme.js
│       ├── main.js
│       ├── search.js
│       └── article.js
├── scripts/
│   ├── serve.mjs
│   ├── validate.mjs
│   └── browser-check.mjs
├── favicon.svg
├── site.webmanifest
├── robots.txt
├── sitemap.xml
├── _headers
└── README.md
```

The static HTML is the baseline. JavaScript adds the mobile navigation, persistent theme control, article search/filtering, optional social links, reading progress, active table-of-contents state, and code-copy controls. Primary content and navigation remain available without JavaScript.

## Run locally

From the project root:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000/`. A local HTTP server is important because browsers do not reliably allow `fetch()` of the local JSON files from a `file://` URL.

No install command is required.

If Node.js is already available, the repository also includes a zero-dependency preview server:

```sh
node scripts/serve.mjs
```

Run the static integrity checks with:

```sh
node scripts/validate.mjs
```

With the preview server still running, a zero-dependency browser check can use a locally installed Chrome or Edge:

```sh
node scripts/browser-check.mjs
```

Set `CHROME_PATH` if the browser is not in a standard Windows location. The check covers three viewport widths, interactions, console/resource errors, and selected no-JavaScript states.

## Deploy to Cloudflare Pages

This directory is the deployable output; there is no generated `dist` folder.

### Git integration

1. Put this directory in a Git repository supported by Cloudflare Pages.
2. In Cloudflare, open **Workers & Pages**, create a Pages project, and connect the repository.
3. Select no framework preset.
4. Leave the build command empty.
5. Set the build output directory to the repository root (normally `.`).
6. Deploy and verify the generated `*.pages.dev` URL.

### Direct Upload

Cloudflare currently supports both dashboard drag-and-drop and Wrangler for Direct Upload projects. Upload this project folder as the built assets. With Wrangler, the equivalent command is:

```sh
npx wrangler pages deploy .
```

Cloudflare notes that a project created as Direct Upload cannot later be switched to Git integration; create a new Pages project if that workflow needs to change. See the [Cloudflare Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/).

The root `_headers` file is parsed by Cloudflare Pages and adds conservative security headers plus short asset caching. Asset names are not content-hashed, so they are deliberately not marked `immutable`.

## Connect omerselcuk.com

1. In Cloudflare, open **Workers & Pages** and select the Pages project.
2. Open **Custom domains**, choose **Set up a domain**, and enter `omerselcuk.com`.
3. For the apex domain, the domain must be a zone in the same Cloudflare account and its authoritative nameservers must point to Cloudflare.
4. Let Cloudflare create and validate the required DNS record and certificate.
5. If `www.omerselcuk.com` should also work, add it as another custom domain and configure a single canonical redirect between `www` and the apex domain in Cloudflare. All page metadata currently uses the apex `https://omerselcuk.com` URL.

Associate the domain through the Pages project's **Custom domains** flow before manually changing DNS; Cloudflare documents that a manually added CNAME alone can fail. See the [Cloudflare custom-domain documentation](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Add an article

1. Copy one of the existing files in `articles/` and choose a lowercase, hyphenated filename.
2. Update the title, description, canonical URL, Open Graph fields, dates, tags, and `BlogPosting` JSON-LD.
3. Keep heading IDs unique and update the table of contents to match them.
4. Add the article metadata to `assets/data/articles.json`. Search indexes `title`, `description`, `category`, and `tags`.
5. Add the same article as static fallback markup in `articles.html`. This intentional duplication preserves the complete index without JavaScript and provides a fallback if JSON cannot load.
6. Add previous/next and related-article links where appropriate.
7. Add the canonical article URL and last-modified date to `sitemap.xml`.
8. Estimate reading time from the finished text; do not leave an inherited value without checking it.

Code blocks use prewritten semantic spans for restrained syntax highlighting. Color is supplementary: code remains readable when styling or color perception is unavailable. Wrap each block in `.code-block`, include a `.code-block-header`, and place the code in `<pre><code>`; `article.js` adds the copy button.

## Update content

- Experience is maintained in `experience.html`; the concise home-page selection is in `index.html`.
- Education, certifications, biography, and grouped technical skills are in `about.html`.
- Generalized project case studies are in `projects.html`. Add public links only when a real URL exists. An optional links container can be added to an entry later; omit the entire control when its URL is empty.
- Article metadata lives in `assets/data/articles.json` and in each article's HTML metadata.
- SEO discovery URLs live in `sitemap.xml`; all canonical URLs use `https://omerselcuk.com`.

## Add social links

Edit `assets/data/site.json`:

```json
{
  "linkedin": "https://www.linkedin.com/in/omerselcukaslan",
  "email": "",
  "github": "",
  "x": ""
}
```

The known LinkedIn link is present as static HTML so it remains available without JavaScript. `main.js` reads `email`, `github`, and `x`; it creates a link only when the corresponding value is a non-empty string. Empty values render no icon, button, placeholder, or disabled control. When adding a new permanent public profile, also decide whether it belongs in the home/footer HTML and the Person structured data.

## Dark mode

`tokens.css` provides light and dark design tokens. With no saved selection, CSS follows `prefers-color-scheme`. `theme.js` runs early in the document head to reduce theme flash, then exposes a keyboard-accessible button that cycles through System, Light, and Dark. Manual Light/Dark choices are stored under `preferred-theme` in `localStorage`; returning to System removes the stored override. If storage is unavailable, the choice still applies for the current page.

## Article search

`search.js` loads `assets/data/articles.json`, normalizes text, and performs simple substring matching in the browser. Category and tag filters use exact normalized matches. Rendering uses DOM methods and `textContent`, not HTML injection. If JSON fails, the script searches metadata embedded in the static cards. If JavaScript is disabled, the full article list remains visible.

## Accessibility

- Semantic headers, navigation, main content, sections, articles, asides, lists, and footers
- Skip links and visible `:focus-visible` indicators
- Logical heading hierarchy and labelled search controls
- Native buttons and selects, with no custom-control reimplementation
- Mobile menu state exposed through `aria-expanded`, plus Escape-to-close and focus restoration
- Minimum touch-target sizing on interactive controls
- High-contrast light/dark palettes and code that does not depend on color alone
- One table of contents that is sticky on wide screens and remains inline and accessible on small screens
- Active article heading exposed with `aria-current`
- `prefers-reduced-motion` respected globally
- Print styles that remove navigation and interactive controls

When changing colors or interaction behavior, re-check contrast, keyboard order, 320px layout, zoom/reflow, and reduced-motion mode.

## Performance

The site loads no remote font, image, script, stylesheet, framework, or analytics resource. CSS is split by responsibility, JavaScript is small and page-specific, and there are no content images that can cause layout shift. The early theme script is intentionally blocking and small; other scripts are deferred. Cloudflare can compress static assets automatically.

If content images are added later, provide intrinsic `width` and `height`, responsive `srcset`/`sizes` when useful, meaningful `alt` text (or empty `alt` for decoration), and `loading="lazy"` for below-the-fold images.

## Information intentionally omitted

The supplied content did not include a public email address, GitHub profile, X/Twitter profile, public project repositories, live demos, project metrics, certificate URLs, testimonials, awards, client names, or completed thesis results. None are fabricated. Add them only after real, public details are available.

The contact page deliberately has no form: a static site cannot imply successful message delivery without a configured external service.
