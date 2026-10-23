import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVPLR8q1NpUNSpmsDdKcqPAo_z1vZOvnA",
  authDomain: "narmadaolympiad.firebaseapp.com",
  projectId: "narmadaolympiad",
  storageBucket: "narmadaolympiad.firebasestorage.app",
  messagingSenderId: "530081464040",
  appId: "1:530081464040:web:156f425df2a6850f9e535d",
  databaseURL: "https://narmadaolympiad-default-rtdb.asia-south1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'/]/g, (s) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;'
  })[s]);
}

// 5-Second Welcome Animation Handler for Question Panel
window.addEventListener("DOMContentLoaded", () => {
  let countdown = 5;
  let progressWidth = 0;

  const countdownEl = document.getElementById("welcome-countdown");
  const progressEl = document.getElementById("welcome-progress");
  const welcomeScreen = document.getElementById("grand-welcome-screen");
  const mainContainer = document.getElementById("question-main-container");

  const progressInterval = setInterval(() => {
    progressWidth += 2;
    if (progressEl) progressEl.style.width = `${progressWidth}%`;
  }, 100);

  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;

    if (countdown <= 0) {
      clearInterval(countdownInterval);
      clearInterval(progressInterval);
      
      welcomeScreen?.classList.add("reveal-open");

      setTimeout(() => {
        welcomeScreen?.classList.add("hidden");
        mainContainer?.classList.remove("hidden");
        loadQuestionBank();
      }, 800);
    }
  }, 1000);
});

window.addNewQuestionToBank = async () => {
  const classRange = document.getElementById("q-class-select").value;
  const subject = document.getElementById("q-subject-select").value;
  const questionText = sanitizeInput(document.getElementById("q-text").value.trim());
  const optA = sanitizeInput(document.getElementById("q-opt-a").value.trim());
  const optB = sanitizeInput(document.getElementById("q-opt-b").value.trim());
  const optC = sanitizeInput(document.getElementById("q-opt-c").value.trim());
  const optD = sanitizeInput(document.getElementById("q-opt-d").value.trim());
  const correctOpt = document.getElementById("q-correct-opt").value;

  if (!questionText || !optA || !optB || !optC || !optD) {
    alert("⚠️ Please fill in all question fields and options!");
    return;
  }

  try {
    await addDoc(collection(db, "question_bank"), {
      classRange,
      subject,
      questionText,
      options: { A: optA, B: optB, C: optC, D: optD },
      correctOpt,
      timestamp: Date.now()
    });

    alert("✅ Question successfully added to database!");
    document.getElementById("q-text").value = "";
    document.getElementById("q-opt-a").value = "";
    document.getElementById("q-opt-b").value = "";
    document.getElementById("q-opt-c").value = "";
    document.getElementById("q-opt-d").value = "";
    loadQuestionBank();
  } catch (err) {
    console.error(err);
    alert("❌ Error saving question: " + err.message);
  }
};

function loadQuestionBank() {
  const tbody = document.querySelector("#questions-table tbody");
  const countEl = document.getElementById("total-questions-count");
  if (!tbody) return;

  onSnapshot(collection(db, "question_bank"), (snapshot) => {
    tbody.innerHTML = "";
    if (countEl) countEl.textContent = snapshot.size;

    if (snapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 15px;">No questions added yet.</td></tr>`;
      return;
    }

    snapshot.forEach(d => {
      const q = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding: 10px;"><strong>Class ${sanitizeInput(q.classRange)}</strong></td>
        <td style="padding: 10px;">${sanitizeInput(q.subject)}</td>
        <td style="padding: 10px; white-space: normal; max-width: 300px;">${sanitizeInput(q.questionText)}</td>
        <td style="padding: 10px; font-size: 11px;">
          A: ${sanitizeInput(q.options?.A)}<br>
          B: ${sanitizeInput(q.options?.B)}<br>
          C: ${sanitizeInput(q.options?.C)}<br>
          D: ${sanitizeInput(q.options?.D)}
        </td>
        <td style="padding: 10px;"><strong style="color: #4ade80;">Option ${sanitizeInput(q.correctOpt)}</strong></td>
        <td style="padding: 10px;"><button onclick="deleteQuestion('${d.id}')" style="padding: 5px 10px; background: #ef4444; color: #fff; border-radius: 4px; font-size: 11px;">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
  });
}

window.deleteQuestion = async (id) => {
  if (confirm("Are you sure you want to delete this question?")) {
    await deleteDoc(doc(db, "question_bank", id));
    alert("✅ Question deleted successfully!");
  }
};
