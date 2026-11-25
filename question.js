const SERVER_URL = "https://nvmso-backend.onrender.com";
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

function getDefaultSubjectForClassRange(classRange) {
  if (classRange === "11-12-Maths") return "Maths";
  if (classRange === "11-12-Science") return "Science";
  return "General";
}

function syncQuestionLimitLabels() {
  const limit = Math.max(1, parseInt(configuredExamQuestionCount, 10) || 30);
  configuredExamQuestionCount = limit;
  const badgeEl = document.getElementById("exam-q-limit-badge");
  const printBtnLabelEl = document.getElementById("print-q-limit-label");
  if (badgeEl) badgeEl.textContent = limit;
  if (printBtnLabelEl) printBtnLabelEl.textContent = limit;
}

function fetchConfiguredQuestionLimit() {
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success" && data.config) {
        const cfgLimit = Number(data.config.totalQuestions || data.config.questionCount);
        if (cfgLimit > 0) {
          configuredExamQuestionCount = cfgLimit;
          syncQuestionLimitLabels();
        }
      }
    })
    .catch(() => {});
}

document.addEventListener("DOMContentLoaded", () => {
  syncQuestionLimitLabels();
  fetchConfiguredQuestionLimit();
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

  const selectedClassRange = document.getElementById("q-class-select")?.value || "6-8";
  const selectedSubject = getDefaultSubjectForClassRange(selectedClassRange);

  const payload = {
    classRange: selectedClassRange,
    classGroup: selectedClassRange,
    subject: selectedSubject,
    negativeMarking: parseFloat(document.getElementById("q-negative-marking")?.value) || 0,
    questionText: qText,
    optionA: optA,
    optionB: optB,
    optionC: optC,
    optionD: optD,
    correctOption: document.getElementById("q-correct-opt")?.value || "A"
  };

  const submitBtn = document.querySelector(".control-box button[onclick='addNewQuestionToBank()']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Syncing Question Element with Cloud Frame...";
  }

  fetch(`${SERVER_URL}/api/admin/add-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert("✅ Success: Question element securely published to the master database!");

        document.getElementById("q-text").value = "";
        document.getElementById("q-opt-a").value = "";
        document.getElementById("q-opt-b").value = "";
        document.getElementById("q-opt-c").value = "";
        document.getElementById("q-opt-d").value = "";
        document.getElementById("q-text").focus();

        loadSavedQuestions();
      } else {
        alert("❌ Operation Terminated: " + (data?.message || "Failed to save question"));
      }
    })
    .catch(() => {
      alert("❌ Error: Connection trace dropped.");
    })
    .finally(() => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "➕ Save Question to Database Engine";
      }
    });
};

function getFilteredQuestionsList() {
  const filterVal = document.getElementById("filter-q-class")?.value || "ALL";
  if (filterVal === "ALL") return cachedQuestionsList;
  return cachedQuestionsList.filter(
    q => String(q.classRange || q.classGroup || "").trim() === filterVal
  );
}

window.renderFilteredQuestionsPreview = function () {
  const container = document.getElementById("saved-questions-container");
  const countEl = document.getElementById("total-q-count");
  if (!container) return;

  const listToShow = getFilteredQuestionsList();
  if (countEl) countEl.textContent = listToShow.length;

  if (!listToShow.length) {
    container.innerHTML = `<p style="color: #64748b; font-size: 13px; text-align: center;">No questions found for this selection.</p>`;
    return;
  }

  container.innerHTML = "";
  listToShow.forEach((q, idx) => {
    const grp = q.classRange || q.classGroup || "N/A";
    const qId = escapeHtml(q.id);
    container.innerHTML += `
      <div style="background:#020617; border:1px solid #1e293b; padding:12px; border-radius:8px; margin-bottom:10px; font-size:12px; position:relative;">
        <div style="display:flex; justify-content:space-between; color:#38bdf8; margin-bottom:4px;">
          <strong>#${idx + 1} | Class: ${escapeHtml(grp)}</strong>
          <div>
            <span style="color:#f87171; margin-right:10px;">Neg: -${escapeHtml(q.negativeMarking || 0)}</span>
            <span style="color:#facc15; font-weight:bold; margin-right:15px;">Correct: ${escapeHtml(q.correctOption)}</span>
            <button type="button" onclick="deleteQuestion('${qId}')" style="background:#dc2626; color:#fff; border:none; padding:3px 8px; font-size:10px; border-radius:4px; cursor:pointer; font-weight:bold;">🗑️ Delete</button>
          </div>
        </div>
        <p style="color:#fff; margin:4px 0 8px 0; font-weight:600;">${escapeHtml(q.questionText)}</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; color:#94a3b8;">
          <div>A) ${escapeHtml(q.optionA)}</div>
          <div>B) ${escapeHtml(q.optionB)}</div>
          <div>C) ${escapeHtml(q.optionC)}</div>
          <div>D) ${escapeHtml(q.optionD)}</div>
        </div>
      </div>
    `;
  });
};

window.printExamQuestionPaper = function () {
  const filterVal = document.getElementById("filter-q-class")?.value || "ALL";
  const filtered = getFilteredQuestionsList();
  const limit = Math.max(1, parseInt(configuredExamQuestionCount, 10) || 30);
  const paperQuestions = filtered.slice(0, limit);

  if (!paperQuestions.length) {
    alert("⚠️ No questions available to print for the selected class range.");
    return;
  }

  const sheetEl = document.getElementById("printable-paper-sheet");
  if (!sheetEl) return;

  const questionsHtml = paperQuestions
    .map(
      (q, index) => `
      <div style="margin-bottom: 14px; page-break-inside: avoid;">
        <div style="font-weight: 700; margin-bottom: 4px;">
          Q${index + 1}. ${escapeHtml(q.questionText)}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; padding-left: 14px; font-size: 13px;">
          <div>(A) ${escapeHtml(q.optionA)}</div>
          <div>(B) ${escapeHtml(q.optionB)}</div>
          <div>(C) ${escapeHtml(q.optionC)}</div>
          <div>(D) ${escapeHtml(q.optionD)}</div>
        </div>
      </div>
    `
    )
    .join("");

  sheetEl.innerHTML = `
    <div style="border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: baseline;">
      <div>
        <h2 style="margin: 0; font-size: 18px;">Narmada Valley Maths &amp; Science Olympiad (NVMSO)</h2>
        <div style="font-size: 12px;">Class Group: ${escapeHtml(filterVal)} | Total Questions: ${paperQuestions.length} (Configured Limit: ${limit})</div>
      </div>
      <div style="font-size: 12px; text-align: right;">
        Name: _______________________<br>
        Roll No: _____________________
      </div>
    </div>
    ${questionsHtml}
  `;

  window.print();
};

function loadSavedQuestions() {
  fetchConfiguredQuestionLimit();
  fetch(`${SERVER_URL}/api/admin/all_questions`)
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success" && Array.isArray(data.questions)) {
        cachedQuestionsList = data.questions;
      } else {
        cachedQuestionsList = [];
      }
      renderFilteredQuestionsPreview();
    })
    .catch(() => {
      const container = document.getElementById("saved-questions-container");
      if (container) {
        container.innerHTML = `<p style="color: #f87171; font-size: 13px; text-align: center;">Unable to load questions from server.</p>`;
      }
    });
}

window.deleteQuestion = function (questionId) {
  if (!confirm("Are you sure you want to delete this question?")) return;

  fetch(`${SERVER_URL}/api/admin/delete-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: questionId })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert("🗑️ Question deleted successfully!");
        loadSavedQuestions();
      } else {
        alert("❌ Error deleting question: " + (data?.message || "Unknown error"));
      }
    })
    .catch(() => alert("❌ Network error while deleting question."));
};
