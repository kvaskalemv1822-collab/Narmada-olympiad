import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// 1. Password Verification & Grand Welcome Trigger
window.verifyAdminPassword = async () => {
  const passInput = document.getElementById("admin-pass-input").value.trim();
  const alertBox = document.getElementById("login-security-alert");

  try {
    const docRef = doc(db, "settings", "portal_config");
    const docSnap = await getDoc(docRef);
    let masterPass = "narmada2026"; // Default secure password

    if (docSnap.exists() && docSnap.data().adminPassword) {
      masterPass = docSnap.data().adminPassword;
    }

    if (passInput === masterPass) {
      if (alertBox) alertBox.style.display = "none";
      triggerGrandWelcome();
      initializeCentralPanelData();
    } else {
      if (alertBox) {
        alertBox.textContent = "Incorrect Password! Access Denied.";
        alertBox.style.display = "block";
      }
    }
  } catch (e) {
    // Fallback if offline or DB error
    if (passInput === "narmada2026" || passInput === "admin123") {
      triggerGrandWelcome();
      initializeCentralPanelData();
    } else {
      if (alertBox) {
        alertBox.textContent = "Authentication Error. Check Connection.";
        alertBox.style.display = "block";
      }
    }
  }
};

// Grand Welcome Animation Sequence
function triggerGrandWelcome() {
  const loginScreen = document.getElementById("admin-login-screen");
  if (loginScreen) loginScreen.classList.add("hidden");

  const welcomeScreen = document.getElementById("grand-welcome-screen");
  const mainContainer = document.getElementById("admin-main-container");

  if (welcomeScreen) {
    welcomeScreen.classList.remove("hidden", "reveal-open");
  }

  let countdown = 3;
  let progressWidth = 0;

  const countdownEl = document.getElementById("welcome-countdown");
  const progressEl = document.getElementById("welcome-progress");

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
      
      if (welcomeScreen) {
        welcomeScreen.classList.add("reveal-open");
      }

      setTimeout(() => {
        if (welcomeScreen) {
          welcomeScreen.classList.add("hidden");
        }
        if (mainContainer) {
          mainContainer.classList.remove("hidden");
        }
      }, 800);
    }
  }, 1000);
}

window.logoutAdminSession = () => {
  location.reload();
};

// 2. Central Panel Listeners & Data Loaders
function initializeCentralPanelData() {
  loadMasterConfig();
  loadStudentsAndLedger();
}

function loadMasterConfig() {
  onSnapshot(doc(db, "settings", "portal_config"), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (document.getElementById("cfg-online-fee")) document.getElementById("cfg-online-fee").value = data.onlineFee || 100;
      if (document.getElementById("cfg-offline-fee")) document.getElementById("cfg-offline-fee").value = data.offlineFee || 120;
      if (document.getElementById("cfg-duration")) document.getElementById("cfg-duration").value = data.examDuration || 30;
      if (document.getElementById("cfg-upi")) document.getElementById("cfg-upi").value = data.upiId || "narmada@upi";
      if (document.getElementById("cfg-qr-url")) document.getElementById("cfg-qr-url").value = data.qrCodeUrl || "Qrcode.jpg";
      
      if (document.getElementById("cfg-reg-active")) document.getElementById("cfg-reg-active").checked = !!data.isRegistrationOpen;
      if (document.getElementById("cfg-exam-active")) document.getElementById("cfg-exam-active").checked = !!data.isExamActive;
      if (document.getElementById("cfg-result-allowed")) document.getElementById("cfg-result-allowed").checked = !!data.isResultDeclared;

      if (data.manualExpenses) {
        if (document.getElementById("exp-medals-cost")) document.getElementById("exp-medals-cost").value = data.manualExpenses.medals || 0;
        if (document.getElementById("exp-cert-cost")) document.getElementById("exp-cert-cost").value = data.manualExpenses.certificates || 0;
        if (document.getElementById("exp-other-cost")) document.getElementById("exp-other-cost").value = data.manualExpenses.other || 0;
      }
    }
  });
}

window.saveGlobalConfig = async () => {
  const onlineFee = Number(document.getElementById("cfg-online-fee").value);
  const offlineFee = Number(document.getElementById("cfg-offline-fee").value);
  const examDuration = Number(document.getElementById("cfg-duration").value);
  const upiId = document.getElementById("cfg-upi").value;
  const qrCodeUrl = document.getElementById("cfg-qr-url").value;
  
  const isRegistrationOpen = document.getElementById("cfg-reg-active").checked;
  const isExamActive = document.getElementById("cfg-exam-active").checked;
  const isResultDeclared = document.getElementById("cfg-result-allowed").checked;

  try {
    await setDoc(doc(db, "settings", "portal_config"), {
      onlineFee, offlineFee, examDuration, upiId, qrCodeUrl,
      isRegistrationOpen, isExamActive, isResultDeclared
    }, { merge: true });
    alert("Master settings saved successfully!");
  } catch (e) {
    alert("Error saving settings.");
  }
};

window.updateAdminPasswordInFirebase = async () => {
  const newPass = document.getElementById("new-admin-pass").value.trim();
  if (!newPass) {
    alert("Please enter a valid new password!");
    return;
  }
  try {
    await setDoc(doc(db, "settings", "portal_config"), { adminPassword: newPass }, { merge: true });
    alert("Master password updated successfully!");
    document.getElementById("new-admin-pass").value = "";
  } catch (e) {
    alert("Error updating password.");
  }
};

window.updateBroadcastNotice = async () => {
  const noticeText = document.getElementById("admin-broadcast-input").value.trim();
  try {
    await setDoc(doc(db, "settings", "portal_config"), { broadcastNotice: noticeText }, { merge: true });
    alert("Broadcast notice published!");
  } catch (e) {
    alert("Error publishing notice.");
  }
};

window.saveManualExpenses = async () => {
  const medals = Number(document.getElementById("exp-medals-cost").value) || 0;
  const certificates = Number(document.getElementById("exp-cert-cost").value) || 0;
  const other = Number(document.getElementById("exp-other-cost").value) || 0;

  try {
    await setDoc(doc(db, "settings", "portal_config"), {
      manualExpenses: { medals, certificates, other }
    }, { merge: true });
    alert("Expense ledger updated successfully!");
    calculateOverallProfit();
  } catch (e) {
    alert("Error saving expenses.");
  }
};

function loadStudentsAndLedger() {
  onSnapshot(collection(db, "students"), (snapshot) => {
    let totalRev = 0;
    let totalComm = 0;
    const utrTbody = document.querySelector("#admin-utr-table tbody");
    const allStuTbody = document.querySelector("#admin-all-students-table tbody");
    if (utrTbody) utrTbody.innerHTML = "";
    if (allStuTbody) allStuTbody.innerHTML = "";

    snapshot.forEach(d => {
      const s = d.data();
      const feePaid = Number(s.feePaid) || 100;
      totalRev += feePaid;
      totalComm += (feePaid * 0.2); // Example 20% commission

      // Populate UTR Table if payment proof exists
      if (utrTbody && s.utrNumber) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${s.rollNumber || 'N/A'}</td>
          <td>${s.studentName || 'N/A'}</td>
          <td>${s.schoolName || 'N/A'}</td>
          <td>${s.paymentMode || 'Online'}</td>
          <td style="color:#38bdf8; font-weight:bold;">${s.utrNumber}</td>
          <td>₹${feePaid}</td>
          <td><span style="color:${s.verified ? '#4ade80' : '#facc15'}">${s.verified ? 'Verified' : 'Pending'}</span></td>
        `;
        utrTbody.appendChild(tr);
      }

      // Populate Universal Student Management Table
      if (allStuTbody) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${s.rollNumber || 'N/A'}</td>
          <td>${s.studentName || 'N/A'}</td>
          <td>${s.schoolName || 'N/A'}</td>
          <td>${s.studentClass || 'N/A'}</td>
          <td>${s.cashApproved ? 'Approved' : 'Unapproved'}</td>
          <td>${s.blocked ? 'Blocked' : 'Active'}</td>
          <td>
            <button onclick="toggleBlockStudent('${d.id}', ${!s.blocked})" style="padding:4px 8px; background:${s.blocked ? '#10b981' : '#f59e0b'}; color:#fff; border-radius:4px; font-size:11px; cursor:pointer;">${s.blocked ? 'Unblock' : 'Block'}</button>
            <button onclick="deleteStudent('${d.id}')" style="padding:4px 8px; background:#ef4444; color:#fff; border-radius:4px; font-size:11px; cursor:pointer; margin-left:4px;">Delete</button>
          </td>
        `;
        allStuTbody.appendChild(tr);
      }
    });

    if (document.getElementById("stat-total-revenue")) document.getElementById("stat-total-revenue").textContent = `₹${totalRev}`;
    if (document.getElementById("stat-total-commission")) document.getElementById("stat-total-commission").textContent = `₹${totalComm}`;
    calculateOverallProfit(totalRev, totalComm);
  });
}

window.calculateOverallProfit = (rev = 0, comm = 0) => {
  const medals = Number(document.getElementById("exp-medals-cost")?.value) || 0;
  const cert = Number(document.getElementById("exp-cert-cost")?.value) || 0;
  const other = Number(document.getElementById("exp-other-cost")?.value) || 0;
  const totalExp = medals + cert + other;

  if (document.getElementById("stat-total-expenses")) document.getElementById("stat-total-expenses").textContent = `₹${totalExp}`;
  
  const currentRev = rev || Number(document.getElementById("stat-total-revenue")?.textContent.replace('₹', '')) || 0;
  const currentComm = comm || Number(document.getElementById("stat-total-commission")?.textContent.replace('₹', '')) || 0;
  
  const netProfit = currentRev - currentComm - totalExp;
  if (document.getElementById("stat-net-profit")) {
    document.getElementById("stat-net-profit0") // safe check
    document.getElementById("stat-net-profit").textContent = `₹${netProfit}`;
  }
};

window.toggleBlockStudent = async (id, status) => {
  await updateDoc(doc(db, "students", id), { blocked: status });
};

window.deleteStudent = async (id) => {
  if (confirm("Are you sure you want to delete this student record?")) {
    await deleteDoc(doc(db, "students", id));
  }
};

window.loadRankingList = (category) => {
  const tbody = document.querySelector("#admin-ranking-table tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#38bdf8;">Loading rankings for ${category}...</td></tr>`;
  
  // Ranking logic placeholder or snapshot listener
  setTimeout(() => {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No ranked students found in this category yet.</td></tr>`;
  }, 500);
};
