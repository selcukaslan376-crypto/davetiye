(() => {
  const setupNavigation = () => {
    const toggle = document.querySelector("[data-nav-toggle]");
    const nav = document.querySelector("[data-site-nav]");
    if (!toggle || !nav) return;

    const close = (restoreFocus = false) => {
      nav.dataset.open = "false";
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
      if (restoreFocus) toggle.focus();
    };

    toggle.addEventListener("click", () => {
      const isOpen = nav.dataset.open === "true";
      nav.dataset.open = String(!isOpen);
      toggle.setAttribute("aria-expanded", String(!isOpen));
      toggle.textContent = isOpen ? "Menu" : "Close";
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.dataset.open === "true") close(true);
    });

    window.matchMedia("(min-width: 64.01rem)").addEventListener("change", (event) => {
      if (event.matches) close();
    });
  };

  const setupOptionalSocials = async () => {
    const slots = document.querySelectorAll("[data-optional-socials]");
    if (!slots.length) return;

    try {
      const configPath = document.body.dataset.root === "nested"
        ? "../assets/data/site.json"
        : "assets/data/site.json";
      const response = await fetch(configPath);
      if (!response.ok) return;
      const config = await response.json();
      const optional = [
        ["email", "Email", (value) => `mailto:${value}`],
        ["github", "GitHub", (value) => value],
        ["x", "X", (value) => value]
      ];

      slots.forEach((slot) => {
        optional.forEach(([key, label, makeHref]) => {
          const value = typeof config[key] === "string" ? config[key].trim() : "";
          if (!value) return;
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = makeHref(value);
          link.textContent = label;
          if (key !== "email") {
            link.target = "_blank";
            link.rel = "me noopener noreferrer";
          }
          item.append(link);
          slot.append(item);
        });
      });
    } catch {
      // Optional links remain omitted when the local configuration cannot load.
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    setupOptionalSocials();
  });
})();
