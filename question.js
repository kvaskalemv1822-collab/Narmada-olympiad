const SERVER_URL = "https://nvmso-backend.onrender.com"; 

document.addEventListener("DOMContentLoaded", () => {
  loadSavedQuestions();
  loadExamConfig();
});

function loadExamConfig() {
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success" && data.config) {
        if (document.getElementById("config-exam-duration")) {
          document.getElementById("config-exam-duration").value = data.config.examDuration || 30;
        }
      }
    }).catch(() => {});
}

window.saveExamDurationConfig = function() {
  const duration = parseInt(document.getElementById("config-exam-duration").value) || 30;
  
  fetch(`${SERVER_URL}/api/admin/update_config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ examDuration: duration })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("✅ Exam Duration updated successfully!");
    } else {
      alert("❌ Error updating duration.");
    }
  });
};

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

      // Refresh live preview list
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
            <div style="background:#020617; border:1px solid #1e293b; padding:12px; border-radius:8px; margin-bottom:10px; font-size:12px;">
              <div style="display:flex; justify-content:space-between; color:#38bdf8; margin-bottom:4px;">
                <strong>#${idx + 1} | Class: ${q.classRange} (${q.subject})</strong>
                <span style="color:#facc15; font-weight:bold;">Correct: ${q.correctOption}</span>
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
    }).catch(() => {
      const container = document.getElementById("saved-questions-container");
      if(container) container.innerHTML = `<p style="color: #f87171; font-size: 13px; text-align: center;">Could not load questions.</p>`;
    });
}
