(() => {
  const root = document.documentElement;
  const storageKey = "preferred-theme";
  const allowed = new Set(["light", "dark"]);

  root.classList.add("js");

  const readPreference = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return allowed.has(value) ? value : "system";
    } catch {
      return "system";
    }
  };

  const applyPreference = (preference) => {
    if (allowed.has(preference)) {
      root.dataset.theme = preference;
      root.style.colorScheme = preference;
    } else {
      delete root.dataset.theme;
      root.style.colorScheme = "light dark";
    }
  };

  const savePreference = (preference) => {
    try {
      if (preference === "system") {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, preference);
      }
    } catch {
      // The selected theme still applies for the current page view.
    }
  };

  let preference = readPreference();
  applyPreference(preference);

  document.addEventListener("DOMContentLoaded", () => {
    const toggles = document.querySelectorAll("[data-theme-toggle]");
    const order = ["system", "light", "dark"];

    const updateToggles = () => {
      const label = preference[0].toUpperCase() + preference.slice(1);
      toggles.forEach((toggle) => {
        toggle.hidden = false;
        toggle.textContent = label;
        toggle.setAttribute("aria-label", `Theme is ${label}. Change theme`);
      });
    };

    toggles.forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const nextIndex = (order.indexOf(preference) + 1) % order.length;
        preference = order[nextIndex];
        applyPreference(preference);
        savePreference(preference);
        updateToggles();
      });
    });

    updateToggles();
  });
})();
