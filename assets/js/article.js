(() => {
  const progress = document.querySelector("[data-reading-progress]");
  const article = document.querySelector("[data-article-body]");

  const updateProgress = () => {
    if (!progress || !article) return;
    const start = article.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(article.offsetHeight - window.innerHeight, 1);
    const value = Math.min(Math.max((window.scrollY - start) / distance, 0), 1);
    progress.style.setProperty("--progress", value.toFixed(4));
  };

  const copyText = async (value) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fall through for browsers or policies that deny Clipboard API access.
      }
    }

    const temporary = document.createElement("textarea");
    temporary.value = value;
    temporary.setAttribute("readonly", "");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand("copy");
    temporary.remove();
    return copied;
  };

  const setupCopyButtons = () => {
    document.querySelectorAll(".code-block").forEach((block) => {
      const header = block.querySelector(".code-block-header");
      const code = block.querySelector("code");
      if (!header || !code) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "copy-button";
      button.textContent = "Copy";
      button.setAttribute("aria-label", "Copy code to clipboard");
      button.addEventListener("click", async () => {
        try {
          const copied = await copyText(code.textContent);
          if (!copied) throw new Error("Copy command was rejected");
          button.textContent = "Copied";
          button.setAttribute("aria-label", "Code copied to clipboard");
          window.setTimeout(() => {
            button.textContent = "Copy";
            button.setAttribute("aria-label", "Copy code to clipboard");
          }, 1600);
        } catch {
          button.textContent = "Unavailable";
        }
      });
      header.append(button);
    });
  };

  const setupActiveHeading = () => {
    const links = new Map(Array.from(document.querySelectorAll(".article-toc a[href^='#']"), (link) => [
      decodeURIComponent(link.hash.slice(1)),
      link
    ]));
    const headings = Array.from(article?.querySelectorAll("h2[id], h3[id]") || []);
    if (!headings.length) return;

    const activate = (id) => {
      links.forEach((link, key) => {
        if (key === id) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    };

    let frameRequested = false;
    const update = () => {
      const threshold = Math.min(window.innerHeight * 0.32, 280);
      let current = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= threshold) current = heading;
        else break;
      }
      activate(current.id);
      frameRequested = false;
    };
    const requestUpdate = () => {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(update);
    };

    document.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    update();
  };

  document.addEventListener("DOMContentLoaded", () => {
    setupCopyButtons();
    setupActiveHeading();
    updateProgress();
    document.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
  });
})();
