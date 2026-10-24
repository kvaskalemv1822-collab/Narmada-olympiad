import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, collection, addDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVPLR8q1NpUNSpmsDdKcqPAo_z1vZOvnA",
  authDomain: "narmadaolympiad.firebaseapp.com",
  projectId: "narmadaolympiad",
  storageBucket: "narmadaolympiad.firebasestorage.app",
  messagingSenderId: "530081464040",
  appId: "1:530081464040:web:156f425df2a6850f9e535d",
  databaseURL: "https://narmadaolympiad-default-rtdb.asia-south1.firebasedatabase.app"
};

let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

// Safely start animation whether DOM is ready or still loading
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startGrandWelcomeAnimation);
} else {
  startGrandWelcomeAnimation();
}

function startGrandWelcomeAnimation() {
  const welcomeScreen = document.getElementById("grand-welcome-screen");
  const countdownEl = document.getElementById("welcome-countdown");
  const progressEl = document.getElementById("welcome-progress");
  const mainContainer = document.getElementById("question-main-container");

  if (!welcomeScreen) return;

  welcomeScreen.classList.remove("hidden", "reveal-open");

  let countdown = 3; // Yahan 5 se badal kar 3 kar diya hai
  let progressWidth = 0;

  // 3 second ke hisab se progress speed adjust ki gayi hai (~33% har 100ms mein)
  const progressInterval = setInterval(() => {
    progressWidth += 3.33;
    if (progressEl) progressEl.style.width = `${Math.min(progressWidth, 100)}%`;
  }, 100);

  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = countdown;

    if (countdown <= 0) {
      clearInterval(countdownInterval);
      clearInterval(progressInterval);
      
      welcomeScreen.classList.add("reveal-open");

      setTimeout(() => {
        welcomeScreen.classList.add("hidden");
        if (mainContainer) mainContainer.classList.remove("hidden");
        if (db) startQuestionBankListener();
      }, 800);
    }
  }, 1000);
}

window.addNewQuestionToBank = async () => {
  if (!db) {
    alert("Database connection error!");
    return;
  }
  const targetClass = document.getElementById("q-class-select")?.value;
  const subject = document.getElementById("q-subject-select")?.value;
  const qText = document.getElementById("q-text")?.value.trim();
  const optA = document.getElementById("q-opt-a")?.value.trim();
  const optB = document.getElementById("q-opt-b")?.value.trim();
  const optC = document.getElementById("q-opt-c")?.value.trim();
  const optD = document.getElementById("q-opt-d")?.value.trim();
  const correctOpt = document.getElementById("q-correct-opt")?.value;

  if (!qText || !optA || !optB || !optC || !optD) {
    alert("Please fill question statement and all 4 options!");
    return;
  }

  try {
    await addDoc(collection(db, "questions"), {
      targetClass,
      subject,
      qText,
      optA, optB, optC, optD,
      correctOpt,
      createdAt: new Date().toISOString()
    });

    alert("Question saved to database successfully!");
    document.getElementById("q-text").value = "";
    document.getElementById("q-opt-a").value = "";
    document.getElementById("q-opt-b").value = "";
    document.getElementById("q-opt-c").value = "";
    document.getElementById("q-opt-d").value = "";
  } catch (e) {
    alert("Error saving question to database.");
  }
};

function startQuestionBankListener() {
  if (!db) return;
  onSnapshot(collection(db, "questions"), (snapshot) => {
    const tbody = document.querySelector("#questions-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const countEl = document.getElementById("total-questions-count");
    if (countEl) countEl.textContent = snapshot.size;

    let count = 0;
    snapshot.forEach(d => {
      count++;
      const q = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color:#c084fc;">Class ${q.targetClass}</strong></td>
        <td>${q.subject}</td>
        <td><strong>${q.qText}</strong></td>
        <td>
          <small>A: ${q.optA} | B: ${q.optB}<br>C: ${q.optC} | D: ${q.optD}</small>
        </td>
        <td style="color:#4ade80; font-weight:bold;">Option ${q.correctOpt}</td>
        <td>
          <button onclick="deleteQuestion('${d.id}')" style="padding:4px 8px; font-size:11px; background:#ef4444; color:#fff; border-radius:4px; cursor:pointer;">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:15px;">No questions added yet.</td></tr>`;
    }
  });
}

window.deleteQuestion = async (id) => {
  if (!db) return;
  if (confirm("Delete this question from exam database?")) {
    await deleteDoc(doc(db, "questions", id));
  }
};
