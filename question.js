const SERVER_URL = "https://nvmso-backend.onrender.com";
const ADMIN_TOKEN_KEY = "nvmso_admin_token";

let cachedQuestionsList = [];
let configuredExamQuestionCount = 30;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsSingle(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, " ");
}

function setSyncStatus(text, color = "#94a3b8") {
  const el = document.getElementById("server-sync-status");
  if (!el) return;
  el.textContent = text ? `• ${text}` : "";
  el.style.color = color;
}

function getAdminHeaders(includeJson = true) {
  const token =
    sessionStorage.getItem(ADMIN_TOKEN_KEY) ||
    localStorage.getItem(ADMIN_TOKEN_KEY) ||
    "";
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Admin-Token"] = token;
  }
  return headers;
}

async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 2500) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        setSyncStatus("Waking backend server, retrying...", "#facc15");
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

function inferStreamFromSubject(classVal, subjectVal) {
  const num = parseInt(classVal, 10);
  const subLow = String(subjectVal || "").toLowerCase();
  if (num >= 11 && num <= 12) {
    if (
      ["zoology", "botany", "general science"].some(s => subLow.includes(s)) ||
      subLow.includes("(bio)")
    ) {
      return "biology";
    }
    return "maths";
  }
  return "general";
}

function syncQuestionLimitLabels() {
  const limit = Math.max(1, parseInt(configuredExamQuestionCount, 10) || 30);
  configuredExamQuestionCount = limit;
  const badgeEl = document.getElementById("exam-q-limit-badge");
  const printBtnLabelEl = document.getElementById("print-q-limit-label");
  if (badgeEl) badgeEl.textContent = limit;
  if (printBtnLabelEl) printBtnLabelEl.textContent = limit;
}

async function fetchConfiguredQuestionLimit() {
  try {
    const res = await fetchWithRetry(`${SERVER_URL}/api/portal/config`, {}, 1, 2000);
    const data = await res.json().catch(() => ({}));
    if (data && data.status === "success" && data.config) {
      const cfgLimit = Number(data.config.totalQuestions || data.config.questionCount);
      if (cfgLimit > 0) {
        configuredExamQuestionCount = cfgLimit;
        syncQuestionLimitLabels();
      }
    }
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof syncSubjectOptionsForClass === "function") {
    syncSubjectOptionsForClass("q-class-select", "q-subject-select", false);
    syncSubjectOptionsForClass("filter-q-class", "filter-q-subject", true);
  }
  const searchInput = document.getElementById("search-q-keyword");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      window.renderFilteredQuestionsPreview();
    });
  }
  syncQuestionLimitLabels();
  loadSavedQuestions();
});

window.addNewQuestionToBank = async () => {
  const qText = document.getElementById("q-text")?.value.trim() || "";
  const optA = document.getElementById("q-opt-a")?.value.trim() || "";
  const optB = document.getElementById("q-opt-b")?.value.trim() || "";
  const optC = document.getElementById("q-opt-c")?.value.trim() || "";
  const optD = document.getElementById("q-opt-d")?.value.trim() || "";

  if (!qText || !optA || !optB || !optC || !optD) {
    alert("❌ Operation Blocked: Please fill out the question statement and all 4 options!");
    return;
  }

  const selectedClass = String(document.getElementById("q-class-select")?.value || "6").trim();
  const selectedSubject = String(
    document.getElementById("q-subject-select")?.value || "Mathematics"
  ).trim();
  const inferredStream = inferStreamFromSubject(selectedClass, selectedSubject);
  const rawNeg = parseFloat(document.getElementById("q-negative-marking")?.value);
  const cleanNeg = Number.isFinite(rawNeg) && rawNeg > 0 ? rawNeg : 0;

  const payload = {
    classRange: selectedClass,
    classGroup: selectedClass,
    targetClass: selectedClass,
    subject: selectedSubject,
    stream: inferredStream,
    negativeMarking: cleanNeg,
    questionText: qText,
    question: qText,
    optionA: optA,
    optionB: optB,
    optionC: optC,
    optionD: optD,
    correctOption: document.getElementById("q-correct-opt")?.value || "A"
  };

  const submitBtn =
    document.getElementById("save-question-btn") ||
    document.querySelector(".control-box button[onclick='addNewQuestionToBank()']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Syncing Question Element with Cloud Frame...";
  }

  try {
    const res = await fetchWithRetry(
      `${SERVER_URL}/api/admin/add_question`,
      {
        method: "POST",
        headers: getAdminHeaders(true),
        body: JSON.stringify(payload)
      },
      2,
      2500
    );

    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setSyncStatus("Admin session expired", "#f87171");
      alert("❌ Admin authentication required. Please open Central Panel (central.html) and login first.");
      return;
    }

    if (data && data.status === "success") {
      setSyncStatus("Connected", "#4ade80");
      alert("✅ Success: Question element securely published to the master database!");

      const qEl = document.getElementById("q-text");
      const aEl = document.getElementById("q-opt-a");
      const bEl = document.getElementById("q-opt-b");
      const cEl = document.getElementById("q-opt-c");
      const dEl = document.getElementById("q-opt-d");
      if (qEl) qEl.value = "";
      if (aEl) aEl.value = "";
      if (bEl) bEl.value = "";
      if (cEl) cEl.value = "";
      if (dEl) dEl.value = "";
      if (qEl) qEl.focus();

      await loadSavedQuestions();
    } else {
      alert("❌ Operation Terminated: " + (data?.message || "Failed to save question"));
    }
  } catch (err) {
    setSyncStatus("Server unreachable", "#f87171");
    alert("❌ Network / Server Timeout: Backend server did not respond. Please wait 20 seconds and try again.");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "➕ Save Question to Database Engine";
    }
  }
};

function normalizeClassKey(q) {
  const raw = String(q.classGroup || q.classRange || q.targetClass || "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function getFilteredQuestionsList() {
  const classFilterVal = String(document.getElementById("filter-q-class")?.value || "ALL").trim();
  const subjectFilterVal = String(document.getElementById("filter-q-subject")?.value || "ALL")
    .trim()
    .toLowerCase();
  const keywordVal = String(document.getElementById("search-q-keyword")?.value || "")
    .trim()
    .toLowerCase();

  return cachedQuestionsList.filter(q => {
    const qClassKey = normalizeClassKey(q);
    if (classFilterVal !== "ALL" && qClassKey !== classFilterVal) {
      return false;
    }

    const qSubject = String(q.subject || "").trim().toLowerCase();
    if (subjectFilterVal !== "all" && qSubject !== subjectFilterVal) {
      return false;
    }

    if (keywordVal) {
      const body = String(q.questionText || q.question || "").toLowerCase();
      const opts = [
        q.optionA ?? q.options?.A ?? "",
        q.optionB ?? q.options?.B ?? "",
        q.optionC ?? q.options?.C ?? "",
        q.optionD ?? q.options?.D ?? ""
      ]
        .join(" ")
        .toLowerCase();
      if (!body.includes(keywordVal) && !opts.includes(keywordVal) && !qSubject.includes(keywordVal)) {
        return false;
      }
    }

    return true;
  });
}

window.renderFilteredQuestionsPreview = function () {
  const container = document.getElementById("saved-questions-container");
  const countEl = document.getElementById("total-q-count");
  if (!container) return;

  const listToShow = getFilteredQuestionsList();
  if (countEl) countEl.textContent = listToShow.length;

  if (!listToShow.length) {
    container.innerHTML = `<p style="color: #64748b; font-size: 13px; text-align: center;">No questions found for this class/subject selection.</p>`;
    return;
  }

  container.innerHTML = "";
  listToShow.forEach((q, idx) => {
    const clsLabel = normalizeClassKey(q) ? `Class ${normalizeClassKey(q)}` : "N/A";
    const subLabel = q.subject || "General";
    const rawId = String(q.id || q.questionId || q._id || "");
    const safeJsId = escapeJsSingle(rawId);
    const qBody = q.questionText || q.question || "";
    const qAns = q.correctOption || q.answer || "A";
    const optA = q.optionA ?? q.options?.A ?? "";
    const optB = q.optionB ?? q.options?.B ?? "";
    const optC = q.optionC ?? q.options?.C ?? "";
    const optD = q.optionD ?? q.options?.D ?? "";

    container.innerHTML += `
      <div style="background:#020617; border:1px solid #1e293b; padding:12px; border-radius:8px; margin-bottom:10px; font-size:12px; position:relative;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; color:#38bdf8; margin-bottom:4px;">
          <strong>#${idx + 1} | ${escapeHtml(clsLabel)} — ${escapeHtml(subLabel)}</strong>
          <div>
            <span style="color:#f87171; margin-right:10px;">Neg: -${escapeHtml(q.negativeMarking || 0)}</span>
            <span style="color:#facc15; font-weight:bold; margin-right:15px;">Correct: ${escapeHtml(qAns)}</span>
            <button type="button" onclick="deleteQuestion('${safeJsId}')" style="background:#dc2626; color:#fff; border:none; padding:3px 8px; font-size:10px; border-radius:4px; cursor:pointer; font-weight:bold;">🗑️ Delete</button>
          </div>
        </div>
        <p style="color:#fff; margin:4px 0 8px 0; font-weight:600;">${escapeHtml(qBody)}</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; color:#94a3b8;">
          <div>A) ${escapeHtml(optA)}</div>
          <div>B) ${escapeHtml(optB)}</div>
          <div>C) ${escapeHtml(optC)}</div>
          <div>D) ${escapeHtml(optD)}</div>
        </div>
      </div>
    `;
  });
};

window.closePrintPreviewOverlay = function () {
  const overlay = document.getElementById("print-preview-overlay");
  if (overlay) overlay.style.display = "none";
};

window.printExamQuestionPaper = function () {
  const classFilterVal = document.getElementById("filter-q-class")?.value || "ALL";
  const subjectFilterVal = document.getElementById("filter-q-subject")?.value || "ALL";
  const filtered = getFilteredQuestionsList();
  const limit = Math.max(1, parseInt(configuredExamQuestionCount, 10) || 30);
  const paperQuestions = filtered.slice(0, limit);

  if (!paperQuestions.length) {
    alert("⚠️ No questions available to print for the selected class and subject.");
    return;
  }

  const questionsHtml = paperQuestions
    .map((q, index) => {
      const qBody = q.questionText || q.question || "";
      const optA = q.optionA ?? q.options?.A ?? "";
      const optB = q.optionB ?? q.options?.B ?? "";
      const optC = q.optionC ?? q.options?.C ?? "";
      const optD = q.optionD ?? q.options?.D ?? "";

      return `
      <div style="margin-bottom: 14px; page-break-inside: avoid;">
        <div style="font-weight: 700; margin-bottom: 4px;">
          Q${index + 1}. ${escapeHtml(qBody)}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; padding-left: 14px; font-size: 13px;">
          <div>(A) ${escapeHtml(optA)}</div>
          <div>(B) ${escapeHtml(optB)}</div>
          <div>(C) ${escapeHtml(optC)}</div>
          <div>(D) ${escapeHtml(optD)}</div>
        </div>
      </div>
    `;
    })
    .join("");

  const classText = classFilterVal === "ALL" ? "Classes 1–12" : `Class ${classFilterVal}`;
  const subjectText = subjectFilterVal === "ALL" ? "All Subjects" : subjectFilterVal;

  const paperMarkup = `
    <div style="border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: baseline;">
      <div>
        <h2 style="margin: 0; font-size: 18px;">Narmada Valley Maths &amp; Science Olympiad (NVMSO)</h2>
        <div style="font-size: 12px;">${escapeHtml(classText)} | Subject: ${escapeHtml(subjectText)} | Questions: ${paperQuestions.length} (Limit: ${limit})</div>
      </div>
      <div style="font-size: 12px; text-align: right;">
        Name: _______________________<br>
        Roll No: _____________________
      </div>
    </div>
    ${questionsHtml}
  `;

  const sheetEl = document.getElementById("printable-paper-sheet");
  const overlayEl = document.getElementById("print-preview-overlay");
  const previewBodyEl = document.getElementById("print-preview-body");

  if (sheetEl) sheetEl.innerHTML = paperMarkup;
  if (previewBodyEl) previewBodyEl.innerHTML = paperMarkup;
  if (overlayEl) overlayEl.style.display = "block";

  setTimeout(() => {
    try {
      window.print();
    } catch (e) {}
  }, 120);
};

async function loadSavedQuestions() {
  setSyncStatus("Syncing...", "#facc15");
  await fetchConfiguredQuestionLimit();
  try {
    const res = await fetchWithRetry(`${SERVER_URL}/api/questions`, {}, 2, 2500);
    const data = await res.json().catch(() => ({}));
    if (data && data.status === "success" && Array.isArray(data.questions)) {
      cachedQuestionsList = data.questions;
      setSyncStatus("Connected", "#4ade80");
    } else {
      cachedQuestionsList = [];
      setSyncStatus("Connected", "#4ade80");
    }
    window.renderFilteredQuestionsPreview();
  } catch (_) {
    setSyncStatus("Offline / Waking up", "#f87171");
    const container = document.getElementById("saved-questions-container");
    if (container) {
      container.innerHTML = `<p style="color: #f87171; font-size: 13px; text-align: center;">Unable to load questions from server. Refresh after 15 seconds.</p>`;
    }
  }
}

window.deleteQuestion = async function (questionId) {
  if (!questionId) {
    alert("⚠️ Question ID missing.");
    return;
  }
  if (!confirm("Are you sure you want to delete this question?")) return;

  try {
    const res = await fetchWithRetry(
      `${SERVER_URL}/api/admin/delete_question`,
      {
        method: "POST",
        headers: getAdminHeaders(true),
        body: JSON.stringify({ questionId: questionId, id: questionId })
      },
      1,
      2000
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      alert("❌ Admin authentication required. Login in Central Panel first.");
      return;
    }
    if (data && data.status === "success") {
      alert("🗑️ Question deleted successfully!");
      await loadSavedQuestions();
    } else {
      alert("❌ Error deleting question: " + (data?.message || "Unknown error"));
    }
  } catch (err) {
    alert("❌ Network error while deleting question.");
  }
};
