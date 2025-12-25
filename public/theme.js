(() => {
  const KEY = "family_theme";
  const root = document.documentElement;

  function preferredTheme() {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;

    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    return prefersDark ? "dark" : "light";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);

    // Update toggle label if exists
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "الوضع: داكن" : "الوضع: فاتح";
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
  }

  // Apply ASAP (before paint as much as possible)
  apply(preferredTheme());

  window.FamilyTheme = {
    toggle() {
      const cur = root.getAttribute("data-theme") || "dark";
      apply(cur === "dark" ? "light" : "dark");
    },
    set(theme) {
      apply(theme);
    },
    get() {
      return root.getAttribute("data-theme") || "dark";
    },
  };

  // If button exists, wire it
  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggle");
    if (btn) btn.addEventListener("click", () => window.FamilyTheme.toggle());
  });
})();
