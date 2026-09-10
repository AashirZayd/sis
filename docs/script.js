/**
 * SIS — Speculative Invariant Synthesis
 * Minimal, accessible client interactions (Copy buttons, tab switching)
 */

document.addEventListener("DOMContentLoaded", () => {
  initClipboardButtons();
  initTabs();
});

/**
 * Initializes copy-to-clipboard buttons with accessible feedback
 */
function initClipboardButtons() {
  const copyButtons = document.querySelectorAll("[data-copy-target]");

  copyButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.getAttribute("data-copy-target");
      let textToCopy = "";

      if (targetId === "active-code") {
        const container = btn.closest(".tabs-container");
        if (container) {
          const activePanel = container.querySelector(".tab-panel.active .code-content");
          if (activePanel) {
            textToCopy = activePanel.innerText.trim();
          }
        }
      } else if (targetId) {
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          textToCopy = targetEl.textContent.trim();
        }
      } else if (btn.getAttribute("data-copy-text")) {
        textToCopy = btn.getAttribute("data-copy-text");
      }

      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        showCopyFeedback(btn);
      } catch (err) {
        // Fallback for older environments
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          showCopyFeedback(btn);
        } catch (e) {
          console.error("Clipboard copy failed:", e);
        }
        document.body.removeChild(textArea);
      }
    });
  });
}

/**
 * Visual feedback for copy action
 */
function showCopyFeedback(btn) {
  const originalHtml = btn.innerHTML;
  btn.classList.add("copied");
  btn.setAttribute("aria-label", "Copied to clipboard");

  // Check if button has text or is icon-only
  const textSpan = btn.querySelector(".copy-text");
  if (textSpan) {
    textSpan.textContent = "Copied!";
  } else {
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  }

  setTimeout(() => {
    btn.classList.remove("copied");
    btn.innerHTML = originalHtml;
    btn.setAttribute("aria-label", "Copy to clipboard");
  }, 2000);
}

/**
 * Accessible tab switching for code examples
 */
function initTabs() {
  const tabContainers = document.querySelectorAll(".tabs-container");

  tabContainers.forEach((container) => {
    const tabs = container.querySelectorAll(".tab-btn");
    const panels = container.querySelectorAll(".tab-panel");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const targetId = tab.getAttribute("data-tab");

        // Deactivate all tabs & panels
        tabs.forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });

        panels.forEach((p) => {
          p.classList.remove("active");
          p.setAttribute("hidden", "true");
        });

        // Activate selected
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");

        const targetPanel = container.querySelector(`#panel-${targetId}`);
        if (targetPanel) {
          targetPanel.classList.add("active");
          targetPanel.removeAttribute("hidden");
        }
      });

      // Keyboard navigation
      tab.addEventListener("keydown", (e) => {
        const tabList = Array.from(tabs);
        const index = tabList.indexOf(tab);

        let nextIndex = null;
        if (e.key === "ArrowRight") {
          nextIndex = (index + 1) % tabList.length;
        } else if (e.key === "ArrowLeft") {
          nextIndex = (index - 1 + tabList.length) % tabList.length;
        }

        if (nextIndex !== null) {
          e.preventDefault();
          tabList[nextIndex].focus();
          tabList[nextIndex].click();
        }
      });
    });
  });
}
