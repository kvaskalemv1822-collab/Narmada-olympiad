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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Run Grand Welcome Animation immediately
startGrandWelcomeAnimation();

function startGrandWelcomeAnimation() {
  const welcomeScreen = document.getElementById("grand-welcome-screen");
  welcomeScreen?.classList.remove("hidden", "reveal-open");

  let countdown = 5;
  let progressWidth = 0;

  const countdownEl = document.getElementById("welcome-countdown");
  const progressEl = document.getElementById("welcome-progress");

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
        document.getElementById("question-main-container")?.classList.remove("hidden");
        startQuestionBankListener();
      }, 800);
    }
  }, 1000);
}

window.addNewQuestionToBank = async () => {
  const targetClass = document.getElementById("q-class-select").value;
  const subject = document.getElementById("q-subject-select").value;
  const qText = document.getElementById("q-text").value.trim();
  const optA = document.getElementById("q-opt-a").value.trim();
  const optB = document.getElementById("q-opt-b").value.trim();
  const optC = document.getElementById("q-opt-c").value.trim();
  const optD = document.getElementById("q-opt-d").value.trim();
  const correctOpt = document.getElementById("q-correct-opt").value;

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
  if (confirm("Delete this question from exam database?")) {
    await deleteDoc(doc(db, "questions", id));
  }
};
