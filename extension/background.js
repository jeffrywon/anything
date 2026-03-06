const API_BASE = "http://127.0.0.1:8787";
const runs = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function getPageContext(tabId) {
  return sendToTab(tabId, { type: "GET_PAGE_CONTEXT" });
}

async function executeAction(tabId, action) {
  return sendToTab(tabId, { type: "EXECUTE_ACTION", action });
}

async function askAgent(payload) {
  const resp = await fetch(`${API_BASE}/api/next_action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    throw new Error(`agent http error: ${resp.status}`);
  }
  return resp.json();
}

async function runAutomation(tabId, goal) {
  const run = { running: true, goal, history: [], steps: 0 };
  runs.set(tabId, run);

  const maxSteps = 20;

  while (run.running && run.steps < maxSteps) {
    run.steps += 1;

    let pageContext;
    try {
      pageContext = await getPageContext(tabId);
    } catch (e) {
      run.running = false;
      break;
    }

    const modelReply = await askAgent({
      goal: run.goal,
      history: run.history,
      page_context: pageContext,
      step: run.steps,
    });

    const action = modelReply?.action;
    if (!action) {
      run.history.push({ role: "system", content: "agent returned no action" });
      await sleep(800);
      continue;
    }

    const execResult = await executeAction(tabId, action);
    run.history.push({
      role: "assistant",
      content: JSON.stringify({ action, execResult }),
    });

    if (action.type === "done" || execResult?.result?.done) {
      run.running = false;
      break;
    }

    await sleep(1200);
  }

  run.running = false;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "START_AUTOMATION") {
    const { tabId, goal } = message;
    if (!tabId || !goal) {
      sendResponse({ ok: false, message: "缺少 tabId 或 goal" });
      return true;
    }

    if (runs.get(tabId)?.running) {
      sendResponse({ ok: false, message: "该标签页已有运行中的任务" });
      return true;
    }

    runAutomation(tabId, goal).catch((err) => {
      console.error("Automation failed:", err);
      const run = runs.get(tabId);
      if (run) {
        run.running = false;
      }
    });

    sendResponse({ ok: true, message: "自动化已启动" });
    return true;
  }

  if (message?.type === "STOP_AUTOMATION") {
    const { tabId } = message;
    const run = runs.get(tabId);
    if (run) {
      run.running = false;
    }
    sendResponse({ ok: true, message: "已停止" });
    return true;
  }

  return false;
});
