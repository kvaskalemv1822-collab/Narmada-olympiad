const SERVER_URL = "https://nvmso-backend.onrender.com"; 

document.addEventListener("DOMContentLoaded", () => {
  loadSavedQuestions();
});

window.addNewQuestionToBank = async () => {
  const qText = document.getElementById("q-text").value.trim();
  const optA = document.getElementById("q-opt-a").value.trim();
  const optB = document.getElementById("q-opt-b").value.trim();
  const optC = document.getElementById("q-opt-c").value.trim();
  const optD = document.getElementById("q-opt-d").value.trim();

  if (!qText || !optA || !optB || !optC || !optD) {
    alert("❌ Operation Blocked: Please fill out the question statement and all 4 options!");
    return;
  }

  const payload = {
    classRange: document.getElementById("q-class-select").value,
    subject: document.getElementById("q-subject-select").value,
    negativeMarking: parseFloat(document.getElementById("q-negative-marking").value) || 0,
    questionText: qText,
    optionA: optA,
    optionB: optB,
    optionC: optC,
    optionD: optD,
    correctOption: document.getElementById("q-correct-opt").value
  };

  const submitBtn = document.querySelector(".control-box button[onclick='addNewQuestionToBank()']");
  if(submitBtn) {
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
    if (data.status === "success") {
      alert("✅ Success: Question element securely published to the master database!");
      
      // Clear inputs
      document.getElementById("q-text").value = "";
      document.getElementById("q-opt-a").value = "";
      document.getElementById("q-opt-b").value = "";
      document.getElementById("q-opt-c").value = "";
      document.getElementById("q-opt-d").value = "";
      document.getElementById("q-text").focus();

      loadSavedQuestions();
    } else {
      alert("❌ Operation Terminated: " + data.message);
    }
  })
  .catch(() => {
    alert("❌ Error: Connection trace dropped.");
  })
  .finally(() => {
    if(submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "➕ Save Question to Database Engine";
    }
  });
};

function loadSavedQuestions() {
  fetch(`${SERVER_URL}/api/admin/all_questions`)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("saved-questions-container");
      const countEl = document.getElementById("total-q-count");
      if(!container) return;

      if (data.status === "success" && data.questions && data.questions.length > 0) {
        if(countEl) countEl.textContent = data.questions.length;
        container.innerHTML = "";
        
        data.questions.forEach((q, idx) => {
          container.innerHTML += `
            <div style="background:#020617; border:1px solid #1e293b; padding:12px; border-radius:8px; margin-bottom:10px; font-size:12px; position:relative;">
              <div style="display:flex; justify-content:space-between; color:#38bdf8; margin-bottom:4px;">
                <strong>#${idx + 1} | Class: ${q.classRange} (${q.subject})</strong>
                <div>
                  <span style="color:#f87171; margin-right:10px;">Neg: -${q.negativeMarking || 0}</span>
                  <span style="color:#facc15; font-weight:bold; margin-right:15px;">Correct: ${q.correctOption}</span>
                  <button onclick="deleteQuestion('${q.id}')" style="background:#dc2626; color:#fff; border:none; padding:3px 8px; font-size:10px; border-radius:4px; cursor:pointer; font-weight:bold;">🗑️ Delete</button>
                </div>
              </div>
              <p style="color:#fff; margin:4px 0 8px 0; font-weight:600;">${q.questionText}</p>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; color:#94a3b8;">
                <div>A) ${q.optionA}</div>
                <div>B) ${q.optionB}</div>
                <div>C) ${q.optionC}</div>
                <div>D) ${q.optionD}</div>
              </div>
            </div>
          `;
        });
      } else {
        if(countEl) countEl.textContent = 0;
        container.innerHTML = `<p style="color: #64748b; font-size: 13px; text-align: center;">No questions added to database yet.</p>`;
      }
    }).catch(() => {});
}

window.deleteQuestion = function(questionId) {
  if (!confirm("Are you sure you want to delete this question?")) return;

  fetch(`${SERVER_URL}/api/admin/delete-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: questionId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("🗑️ Question deleted successfully!");
      loadSavedQuestions();
    } else {
      alert("❌ Error deleting question.");
    }
  });
};
