const SERVER_URL = "https://nvmso-backend.onrender.com";

window.addNewQuestionToBank = async () => {
  const payload = {
    classRange: document.getElementById("q-class-select").value,
    subject: document.getElementById("q-subject-select").value,
    questionText: document.getElementById("q-text").value.trim(),
    optionA: document.getElementById("q-opt-a").value.trim(),
    optionB: document.getElementById("q-opt-b").value.trim(),
    optionC: document.getElementById("q-opt-c").value.trim(),
    optionD: document.getElementById("q-opt-d").value.trim(),
    correctOption: document.getElementById("q-correct-opt").value
  };

  fetch(`${SERVER_URL}/api/admin/add-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("✅ Question Saved to Backend Safely!");
      document.getElementById("q-text").value = "";
    } else {
      alert("❌ Failed to save question.");
    }
  });
};
