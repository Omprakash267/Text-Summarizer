const DEFAULT_BASE_URL = "http://localhost:5000";

function $(id) {
  return document.getElementById(id);
}

const state = {
  baseUrl: DEFAULT_BASE_URL,
  activeTab: "summary",
};

function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => window.clearTimeout(timer));
}

function setError(message) {
  const errorEl = $("errorMsg");
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function setLoading(isLoading, text = "Working…") {
  const loader = $("loader");
  const loaderText = $("loaderText");
  loaderText.textContent = text;
  loader.hidden = !isLoading;

  $("summarizeBtn").disabled = isLoading;
  $("analyzeBtn").disabled = isLoading;
  $("clearBtn").disabled = isLoading;
}

function showToast(message) {
  const host = $("toastHost");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  host.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 2400);
}

function setTab(nextTab) {
  state.activeTab = nextTab;

  const summaryBtn = $("tabSummaryBtn");
  const analysisBtn = $("tabAnalysisBtn");
  const summaryPanel = $("tabSummary");
  const analysisPanel = $("tabAnalysis");

  const summaryActive = nextTab === "summary";
  summaryBtn.classList.toggle("is-active", summaryActive);
  analysisBtn.classList.toggle("is-active", !summaryActive);
  summaryBtn.setAttribute("aria-selected", summaryActive ? "true" : "false");
  analysisBtn.setAttribute("aria-selected", summaryActive ? "false" : "true");

  summaryPanel.classList.toggle("is-active", summaryActive);
  analysisPanel.classList.toggle("is-active", !summaryActive);
}

function updateMethodUI() {
  const method = $("method").value;
  const num = $("numSentences");
  const hint = $("numSentencesHint");
  const isExtractive = method === "extractive";

  num.disabled = !isExtractive;
  hint.textContent = isExtractive ? "Used only for extractive summaries." : "Not used for abstractive summaries.";
}

function updateCounts() {
  const el = $("inputText");
  const text = el.value || "";
  $("charCount").textContent = `${text.length.toLocaleString()} characters`;

  const selection = Math.abs((el.selectionEnd || 0) - (el.selectionStart || 0));
  $("selectionCount").textContent = `${selection.toLocaleString()} selected`;
}

async function checkHealth() {
  const status = $("backendStatus");
  status.classList.remove("is-ok", "is-bad");
  status.textContent = "Backend: checking…";

  try {
    const resp = await fetchWithTimeout(`${state.baseUrl}/health`, { method: "GET" }, 3500);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    status.textContent = "Backend: connected";
    status.classList.add("is-ok");
  } catch {
    status.textContent = "Backend: not reachable";
    status.classList.add("is-bad");
  }
}

function getInputText() {
  return ($("inputText").value || "").trim();
}

function normalizeSentenceCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(10, Math.max(1, parsed));
}

function showSummaryEmpty() {
  $("summaryEmpty").hidden = false;
  $("resultCard").hidden = true;
  $("methodBadge").hidden = true;
  $("summaryOutput").textContent = "";
}

function showAnalysisEmpty() {
  $("analysisEmpty").hidden = false;
  $("entitiesCard").hidden = true;
  $("noteTypeOutput").textContent = "-";
  $("symptomsOutput").textContent = "";
  $("medicationsOutput").textContent = "";
  $("analysisOutput").textContent = "";
}

function renderSummary({ summary, method }) {
  const badge = $("methodBadge");
  badge.hidden = false;
  badge.textContent =
    method === "abstractive" ? "Abstractive (BART)" : "Extractive (TF‑IDF + spaCy)";

  $("summaryEmpty").hidden = true;
  $("resultCard").hidden = false;
  $("summaryOutput").textContent = summary || "";
}

function renderChips(host, values) {
  host.textContent = "";
  const list = Array.isArray(values) ? values : [];
  if (list.length === 0) {
    const chip = document.createElement("span");
    chip.className = "chip is-empty";
    chip.textContent = "—";
    host.appendChild(chip);
    return;
  }
  for (const val of list) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = String(val);
    host.appendChild(chip);
  }
}

function renderAnalysis({ note_type, entities, output }) {
  $("analysisEmpty").hidden = true;
  $("entitiesCard").hidden = false;

  $("noteTypeOutput").textContent = note_type || "-";

  const symptomVals = (entities && entities.Symptom) || [];
  const medicationVals = (entities && entities.Medication) || [];

  renderChips($("symptomsOutput"), symptomVals);
  renderChips($("medicationsOutput"), medicationVals);
  $("analysisOutput").textContent = output || "";
}

async function onSummarize() {
  setError("");
  checkHealth();
  const text = getInputText();
  if (!text) {
    setError("Please enter some text first.");
    return;
  }

  const method = $("method").value;
  const numSentences = normalizeSentenceCount($("numSentences").value);
  $("numSentences").value = String(numSentences);

  const endpoint =
    method === "extractive" ? `${state.baseUrl}/summarize/extractive` : `${state.baseUrl}/summarize/abstractive`;

  const body = method === "extractive" ? { text, num_sentences: numSentences } : { text };

  setLoading(true, "Summarizing…");
  try {
    const resp = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      45000,
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const base =
        data && data.error ? String(data.error) : `Request failed (HTTP ${resp.status}).`;
      const details = data && data.details ? ` Details: ${String(data.details)}` : "";
      const msg = `${base}${details}`;
      setError(msg);
      return;
    }

    if (data.error) {
      setError(String(data.error));
      return;
    }

    renderSummary({ summary: data.summary, method: data.method || method });
    setTab("summary");
  } catch (err) {
    if (err && err.name === "AbortError") {
      setError(
        "Request timed out. The backend may be busy (e.g., downloading/loading the abstractive model). Try Extractive, or wait and retry.",
      );
    } else {
      setError("Cannot connect to backend. Make sure Flask is running on port 5000.");
    }
  } finally {
    setLoading(false);
  }
}

async function onAnalyze() {
  setError("");
  checkHealth();
  const text = getInputText();
  if (!text) {
    setError("Please enter some text first.");
    return;
  }

  setLoading(true, "Analyzing…");
  try {
    const resp = await fetchWithTimeout(
      `${state.baseUrl}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
      30000,
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const base =
        data && data.error ? String(data.error) : `Request failed (HTTP ${resp.status}).`;
      const details = data && data.details ? ` Details: ${String(data.details)}` : "";
      const msg = `${base}${details}`;
      setError(msg);
      return;
    }

    if (data.error) {
      setError(String(data.error));
      return;
    }

    renderAnalysis(data);
    setTab("analysis");
  } catch (err) {
    if (err && err.name === "AbortError") {
      setError("Request timed out. The backend may be busy. Wait and retry.");
    } else {
      setError("Cannot connect to backend. Make sure Flask is running on port 5000.");
    }
  } finally {
    setLoading(false);
  }
}

function copyToClipboard() {
  const summary = $("summaryOutput").textContent || "";
  if (!summary.trim()) {
    showToast("Nothing to copy.");
    return;
  }

  navigator.clipboard
    .writeText(summary)
    .then(() => showToast("Copied summary."))
    .catch(() => setError("Clipboard permission denied by the browser."));
}

function saveSummary() {
  const summary = $("summaryOutput").textContent || "";
  if (!summary.trim()) {
    showToast("Nothing to download.");
    return;
  }
  const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "summary.txt";
  a.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  $("inputText").value = "";
  updateCounts();
  setError("");
  showSummaryEmpty();
  showAnalysisEmpty();
}

function init() {
  const params = new URLSearchParams(window.location.search);
  state.baseUrl = params.get("api") || DEFAULT_BASE_URL;
  $("apiBaseUrl").textContent = `API: ${state.baseUrl}`;

  $("summarizeBtn").addEventListener("click", onSummarize);
  $("analyzeBtn").addEventListener("click", onAnalyze);
  $("clearBtn").addEventListener("click", clearAll);
  $("copyBtn").addEventListener("click", copyToClipboard);
  $("downloadBtn").addEventListener("click", saveSummary);

  $("tabSummaryBtn").addEventListener("click", () => setTab("summary"));
  $("tabAnalysisBtn").addEventListener("click", () => setTab("analysis"));

  $("method").addEventListener("change", updateMethodUI);

  const inputText = $("inputText");
  inputText.addEventListener("input", updateCounts);
  inputText.addEventListener("select", updateCounts);
  inputText.addEventListener("keyup", updateCounts);
  inputText.addEventListener("mouseup", updateCounts);

  updateCounts();
  updateMethodUI();
  showSummaryEmpty();
  showAnalysisEmpty();

  const backendStatus = $("backendStatus");
  backendStatus.addEventListener("click", checkHealth);
  backendStatus.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      checkHealth();
    }
  });

  checkHealth();
}

// Backwards-compatible globals (in case older HTML still calls these).
window.summarize = onSummarize;
window.analyzeNote = onAnalyze;
window.copyToClipboard = copyToClipboard;
window.saveSummary = saveSummary;

document.addEventListener("DOMContentLoaded", init);
