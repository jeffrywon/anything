function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cssPath(el) {
  if (!(el instanceof Element)) {
    return "";
  }
  const path = [];
  let current = el;
  while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 5) {
    let selector = current.nodeName.toLowerCase();
    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }
    const classes = (current.className || "")
      .toString()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (classes.length) {
      selector += classes.map((c) => `.${CSS.escape(c)}`).join("");
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.join(" > ");
}

function getClickableContext(limit = 30) {
  const candidates = Array.from(
    document.querySelectorAll("a, button, input, [role='button'], [onclick]")
  );

  const visible = candidates.filter((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  });

  return visible.slice(0, limit).map((el) => ({
    text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 80),
    tag: el.tagName.toLowerCase(),
    selector: cssPath(el),
    href: el.getAttribute("href") || "",
    type: el.getAttribute("type") || "",
    id: el.id || "",
    name: el.getAttribute("name") || "",
    placeholder: el.getAttribute("placeholder") || "",
  }));
}

function findElement(selector, textHint) {
  if (selector) {
    try {
      const bySelector = document.querySelector(selector);
      if (bySelector) {
        return bySelector;
      }
    } catch (e) {
      console.warn("Invalid selector:", selector, e);
    }
  }

  if (textHint) {
    const all = Array.from(document.querySelectorAll("a, button, input, textarea, [role='button']"));
    const lowered = textHint.toLowerCase();
    const matched = all.find((el) => {
      const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").toLowerCase();
      return t.includes(lowered);
    });
    if (matched) {
      return matched;
    }
  }

  return null;
}

async function executeAction(action) {
  const type = action?.type;

  if (type === "click") {
    const el = findElement(action.selector, action.text);
    if (!el) {
      return { ok: false, error: "click target not found" };
    }
    el.click();
    return { ok: true, message: "clicked" };
  }

  if (type === "type") {
    const el = findElement(action.selector, action.text);
    if (!el) {
      return { ok: false, error: "type target not found" };
    }
    el.focus();
    if ("value" in el) {
      el.value = action.value ?? "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, message: "typed" };
    }
    return { ok: false, error: "target is not an input-like element" };
  }

  if (type === "pressEnter") {
    const el = findElement(action.selector, action.text) || document.activeElement;
    if (!el) {
      return { ok: false, error: "pressEnter target not found" };
    }
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    return { ok: true, message: "pressed enter" };
  }

  if (type === "navigate") {
    if (!action.url) {
      return { ok: false, error: "missing url" };
    }
    window.location.href = action.url;
    return { ok: true, message: "navigating" };
  }

  if (type === "wait") {
    await sleep(Math.min(Number(action.ms) || 1000, 10000));
    return { ok: true, message: "waited" };
  }

  if (type === "done") {
    return { ok: true, done: true, message: action.summary || "done" };
  }

  return { ok: false, error: `unknown action type: ${type}` };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_CONTEXT") {
    sendResponse({
      ok: true,
      url: location.href,
      title: document.title,
      clickable: getClickableContext(35),
      focusedText: (document.activeElement?.innerText || document.activeElement?.value || "").slice(0, 120),
    });
    return true;
  }

  if (message?.type === "EXECUTE_ACTION") {
    executeAction(message.action)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
