/**
 * Narmada Valley Maths & Science Olympiad (NVMSO)
 * Official Question Bank Administrator Script
 * Connected to Unified Live Render Server Environment
 */

const SERVER_URL = "https://nvmso-backend.onrender.com"; 

window.addNewQuestionToBank = async () => {
  const qText = document.getElementById("q-text").value.trim();
  const optA = document.getElementById("q-opt-a").value.trim();
  const optB = document.getElementById("q-opt-b").value.trim();
  const optC = document.getElementById("q-opt-c").value.trim();
  const optD = document.getElementById("q-opt-d").value.trim();

  // Input sanitization vector to prevent blank payloads
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
      
      // Clear values smoothly for next input block entries
      document.getElementById("q-text").value = "";
      document.getElementById("q-opt-a").value = "";
      document.getElementById("q-opt-b").value = "";
      document.getElementById("q-opt-c").value = "";
      document.getElementById("q-opt-d").value = "";
      document.getElementById("q-text").focus();
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
      submitBtn.innerHTML = "➕ Save Question to Database Engine";
    }
  });
};
