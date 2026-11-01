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
    questionText: qText,
    optionA: optA,
    optionB: optB,
    optionC: optC,
    optionD: optD,
    correctOption: document.getElementById("q-correct-opt").value
  };

  const submitBtn = document.querySelector(".control-box button");
  if(submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Syncing Question Element with Cloud Frame...";
  }

  fetch(`${SERVER_URL}/api/admin/add-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => {
    if (!res.ok) throw new Error("Server transmission error.");
    return res.json();
  })
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
    alert("❌ Error: Connection trace dropped or unauthorized script runtime.");
  })
  .finally(() => {
    if(submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "➕ Save Question to Database Engine";
    }
  });
};

// 📋 FETCH AND RENDER SAVED QUESTIONS ON PANEL
function loadSavedQuestions() {
  fetch(`${SERVER_URL}/api/admin/all_questions`) // Ensure your backend has this route, or if using generic all_data fetch accordingly
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("saved-questions-container");
      const countEl = document.getElementById("total-q-count");
      if(!container) return;

      // Agar backend mein direct route nahi hai toh central admin all_data se filter kar sakte hain, ya niche standard endpoint assume kiya hai:
      // Agar aapne app.py mein all_questions route nahi banaya hai to batayein, main wo bhi de deta hoon.
    })
    .catch(() => {});
}
