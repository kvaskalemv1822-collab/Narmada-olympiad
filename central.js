import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let NVMS_PASSWORD = "NVMSO"; 
let failedAttempts = 0;
let lockoutTimer = null;

let allStudents = [];
let allOrganizers = [];
let allResults = [];
let globalConfig = {};
let manualExpenses = { medals: 0, certs: 0, other: 0 };

function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'/]/g, (s) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;'
  })[s]);
}

onSnapshot(doc(db, "settings", "examConfig"), (docSnap) => {
  if (docSnap.exists()) {
    globalConfig = docSnap.data();
    if (globalConfig.adminPassword) {
      NVMS_PASSWORD = globalConfig.adminPassword;
    }
  }
});

window.verifyAdminPassword = () => {
  const alertEl = document.getElementById("login-security-alert");
  const btnEl = document.getElementById("btn-admin-auth");

  if (lockoutTimer && Date.now() < lockoutTimer) {
    const remainingSecs = Math.ceil((lockoutTimer - Date.now()) / 1000);
    if (alertEl) {
      alertEl.textContent = `🚨 SECURITY LOCKOUT: Too many failed attempts! Try again in ${remainingSecs} seconds.`;
      alertEl.style.display = "block";
    }
    return;
  }

  const enteredPass = sanitizeInput(document.getElementById("admin-pass-input")?.value.trim());

  if (enteredPass === NVMS_PASSWORD) {
    failedAttempts = 0;
    sessionStorage.setItem("NVMSO_ADMIN_AUTH_TOKEN", "AUTHORIZED_COMMAND_KEY_" + Date.now());
    document.getElementById("admin-login-screen")?.classList.add("hidden");
    startGrandWelcomeAnimation();
  } else {
    failedAttempts++;
    if (alertEl) {
      alertEl.textContent = `❌ Invalid Security Password! (Attempt ${failedAttempts} of 3)`;
      alertEl.style.display = "block";
    }

    if (failedAttempts >= 3) {
      lockoutTimer = Date.now() + 300000;
      if (alertEl) {
        alertEl.textContent = "🚨 SECURITY ALERT: 3 Failed Attempts! Portal locked for 5 Minutes.";
      }
      if (btnEl) btnEl.disabled = true;
      setTimeout(() => {
        failedAttempts = 0;
        lockoutTimer = null;
        if (btnEl) btnEl.disabled = false;
        if (alertEl) alertEl.style.display = "none";
      }, 300000);
    }
  }
};

window.logoutAdminSession = () => {
  if (confirm("Logout from NVMS Central Command Panel?")) {
    sessionStorage.removeItem("NVMSO_ADMIN_AUTH_TOKEN");
    document.getElementById("admin-main-container")?.classList.add("hidden");
    document.getElementById("admin-login-screen")?.classList.remove("hidden");
    document.getElementById("admin-pass-input").value = "";
    alert("🔒 Session Terminated Safely.");
  }
};

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
        document.getElementById("admin-main-container")?.classList.remove("hidden");
        initializeAdminDataSync();
      }, 800);
    }
  }, 1000);
}

function initializeAdminDataSync() {
  onSnapshot(doc(db, "settings", "examConfig"), (docSnap) => {
    if (docSnap.exists()) {
      globalConfig = docSnap.data();
      document.getElementById("cfg-online-fee").value = globalConfig.onlineFee || 100;
      document.getElementById("cfg-offline-fee").value = globalConfig.offlineFee || 120;
      document.getElementById("cfg-duration").value = globalConfig.duration || 30;
      document.getElementById("cfg-upi").value = globalConfig.upiId || "";
      document.getElementById("cfg-qr-url").value = globalConfig.qrImageUrl || "Qrcode.jpg";
      document.getElementById("cfg-reg-active").checked = !!globalConfig.regActive;
      document.getElementById("cfg-exam-active").checked = !!globalConfig.examActive;
      document.getElementById("cfg-result-allowed").checked = !!globalConfig.resultAllowed;
      if (globalConfig.broadcastNotice) {
        document.getElementById("admin-broadcast-input").value = globalConfig.broadcastNotice;
      }
    }
  });

  onSnapshot(collection(db, "students"), (snapshot) => {
    allStudents = [];
    snapshot.forEach(d => allStudents.push({ id: d.id, ...d.data() }));
    renderUTRVerificationTable();
    renderAllStudentsTable();
  });
}

window.saveGlobalConfig = async () => {
  await updateDoc(doc(db, "settings", "examConfig"), {
    onlineFee: parseFloat(document.getElementById("cfg-online-fee").value),
    offlineFee: parseFloat(document.getElementById("cfg-offline-fee").value),
    duration: parseInt(document.getElementById("cfg-duration").value),
    upiId: sanitizeInput(document.getElementById("cfg-upi").value.trim()),
    qrImageUrl: sanitizeInput(document.getElementById("cfg-qr-url").value.trim()),
    regActive: document.getElementById("cfg-reg-active").checked,
    examActive: document.getElementById("cfg-exam-active").checked,
    resultAllowed: document.getElementById("cfg-result-allowed").checked
  });
  alert("✅ Master switches and global settings updated successfully!");
};

window.updateBroadcastNotice = async () => {
  const notice = sanitizeInput(document.getElementById("admin-broadcast-input").value.trim());
  await updateDoc(doc(db, "settings", "examConfig"), { broadcastNotice: notice });
  alert("📢 Broadcast Notice Published Live!");
};

function renderUTRVerificationTable() {
  const tbody = document.querySelector("#admin-utr-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let utrCounts = {};
  allStudents.forEach(s => {
    if (s.utr) utrCounts[s.utr] = (utrCounts[s.utr] || 0) + 1;
  });

  allStudents.forEach(s => {
    if (s.payMode !== "online") return;
    const isDuplicate = s.utr && utrCounts[s.utr] > 1;
    const tr = document.createElement("tr");

    if (isDuplicate) tr.style.background = "rgba(239, 68, 68, 0.25)";

    tr.innerHTML = `
      <td><strong>${sanitizeInput(s.roll)}</strong></td>
      <td>${sanitizeInput(s.name)}</td>
      <td>${sanitizeInput(s.schoolName || s.orgCode)}</td>
      <td>ONLINE</td>
      <td><strong style="color:${isDuplicate ? '#f87171' : '#38bdf8'};">${sanitizeInput(s.utr || 'No UTR')}</strong></td>
      <td><strong style="color:#4ade80;">₹${s.fee || 100}</strong></td>
      <td>${isDuplicate ? `<span style="color:#f87171; font-weight:bold;">🚨 ALERT: UTR MATCHED / DUPLICATE!</span>` : `<span style="color:#4ade80; font-weight:bold;">✅ Valid UTR</span>`}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAllStudentsTable() {
  const tbody = document.querySelector("#admin-all-students-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  allStudents.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sanitizeInput(s.roll)}</strong></td>
      <td>${sanitizeInput(s.name)}</td>
      <td>${sanitizeInput(s.schoolName || s.orgCode)}</td>
      <td>Class ${s.stdClass}</td>
      <td><span style="color:${s.paymentConfirmed ? '#4ade80' : '#facc15'};">${s.paymentConfirmed ? 'APPROVED' : 'PENDING CASH'}</span></td>
      <td><span style="color:${s.blocked ? '#f87171' : '#4ade80'};">${s.blocked ? 'BLOCKED' : 'ACTIVE'}</span></td>
      <td>
        <button onclick="toggleBlockStudent('${s.id}', ${!s.blocked})" style="padding:4px 8px; font-size:11px; background:${s.blocked ? '#10b981' : '#f59e0b'}; color:#fff; margin-right:4px;">${s.blocked ? 'Unblock' : 'Block'}</button>
        <button onclick="allowReExam('${s.roll}')" style="padding:4px 8px; font-size:11px; background:#3b82f6; color:#fff; margin-right:4px;">Re-Exam</button>
        <button onclick="deleteStudent('${s.id}')" style="padding:4px 8px; font-size:11px; background:#ef4444; color:#fff;">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleBlockStudent = async (docId, status) => {
  await updateDoc(doc(db, "students", docId), { blocked: status });
  alert("✅ Student status updated!");
};

window.allowReExam = async (roll) => {
  if (confirm(`Allow re-exam for Roll No ${roll}? This will delete their previous result.`)) {
    await deleteDoc(doc(db, "results", roll));
    alert("✅ Previous result cleared. Student can take the exam again.");
  }
};

window.deleteStudent = async (docId) => {
  if (confirm("Delete this student permanently?")) {
    await deleteDoc(doc(db, "students", docId));
    alert("✅ Student deleted!");
  }
};
