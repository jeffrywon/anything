const goalEl = document.getElementById("goal");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");

function setStatus(text) {
  statusEl.textContent = text;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

startBtn.addEventListener("click", async () => {
  const goal = goalEl.value.trim();
  if (!goal) {
    setStatus("请先输入目标");
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("无法获取当前标签页");
    return;
  }

  setStatus("已启动...");
  const resp = await chrome.runtime.sendMessage({
    type: "START_AUTOMATION",
    tabId: tab.id,
    goal,
  });
  setStatus(resp?.message || "已发送启动请求");
});

stopBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("无法获取当前标签页");
    return;
  }

  const resp = await chrome.runtime.sendMessage({
    type: "STOP_AUTOMATION",
    tabId: tab.id,
  });
  setStatus(resp?.message || "已停止");
});
