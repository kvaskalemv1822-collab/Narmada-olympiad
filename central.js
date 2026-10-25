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

window.updateAdminPasswordInFirebase = async () => {
  const newPass = sanitizeInput(document.getElementById("new-admin-pass").value.trim());
  if (!newPass) {
    alert("⚠️ Please enter a valid new password.");
    return;
  }
  if (confirm("Are you sure you want to change the NVMS Password?")) {
    await updateDoc(doc(db, "settings", "examConfig"), { adminPassword: newPass });
    NVMS_PASSWORD = newPass;
    document.getElementById("new-admin-pass").value = "";
    alert("✅ NVMS Password successfully updated!");
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

  onSnapshot(doc(db, "settings", "manualExpenses"), (docSnap) => {
    if (docSnap.exists()) {
      manualExpenses = docSnap.data();
      document.getElementById("exp-medals-cost").value = manualExpenses.medals || 0;
      document.getElementById("exp-cert-cost").value = manualExpenses.certs || 0;
      document.getElementById("exp-other-cost").value = manualExpenses.other || 0;
      calculateOverallProfit();
    }
  });

  onSnapshot(collection(db, "students"), (snapshot) => {
    allStudents = [];
    snapshot.forEach(d => allStudents.push({ id: d.id, ...d.data() }));
    renderUTRVerificationTable();
    renderAllStudentsTable();
    renderOrganizerLedger();
  });

  onSnapshot(collection(db, "organizers"), (snapshot) => {
    allOrganizers = [];
    snapshot.forEach(d => allOrganizers.push({ code: d.id, ...d.data() }));
    renderOrganizerLedger();
  });

  onSnapshot(collection(db, "results"), (snapshot) => {
    allResults = [];
    snapshot.forEach(d => allResults.push(d.data()));
  });

  onSnapshot(collection(db, "support_queries"), (snapshot) => {
    const tbody = document.querySelector("#admin-support-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (snapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No support queries found.</td></tr>`;
      return;
    }
    snapshot.forEach(d => {
      const q = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${sanitizeInput(q.orgCode)}</strong><br><small style="color:#38bdf8;">${sanitizeInput(q.schoolName)}</small></td>
        <td>${sanitizeInput(q.orgName)}</td>
        <td style="white-space:normal; max-width:300px;">${sanitizeInput(q.message)}</td>
        <td><small>${new Date(q.timestamp).toLocaleString()}</small></td>
        <td><button onclick="deleteQuery('${d.id}')" style="padding:4px 8px; font-size:11px; background:#ef4444; color:#fff;">Resolve / Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
  });

  onSnapshot(collection(db, "payout_requests"), () => renderPayoutAndSettlementTable());
  onSnapshot(collection(db, "settlement_payments"), () => renderPayoutAndSettlementTable());
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

window.saveManualExpenses = async () => {
  const medals = parseFloat(document.getElementById("exp-medals-cost").value) || 0;
  const certs = parseFloat(document.getElementById("exp-cert-cost").value) || 0;
  const other = parseFloat(document.getElementById("exp-other-cost").value) || 0;

  await setDoc(doc(db, "settings", "manualExpenses"), { medals, certs, other });
  alert("✅ Manual Expenses Saved Successfully!");
  calculateOverallProfit();
};

window.updateBroadcastNotice = async () => {
  const notice = sanitizeInput(document.getElementById("admin-broadcast-input").value.trim());
  await updateDoc(doc(db, "settings", "examConfig"), { broadcastNotice: notice });
  alert("📢 Broadcast Notice Published Live!");
};

window.deleteQuery = async (id) => {
  await deleteDoc(doc(db, "support_queries", id));
  alert("✅ Query resolved and removed.");
};

function renderPayoutAndSettlementTable() {
  const tbody = document.querySelector("#admin-payout-requests-table tbody");
  if (!tbody) return;

  getDocs(collection(db, "payout_requests")).then(pSnap => {
    getDocs(collection(db, "settlement_payments")).then(sSnap => {
      let rowsHTML = "";
      pSnap.forEach(d => {
        let req = d.data();
        rowsHTML += `
          <tr>
            <td><strong>${sanitizeInput(req.orgCode)}</strong><br><small style="color:#38bdf8;">${sanitizeInput(req.schoolName)}</small></td>
            <td>${sanitizeInput(req.orgName)}</td>
            <td><span style="color:#f97316; font-weight:bold;">Payout Claim Request</span></td>
            <td>UPI: ${sanitizeInput(req.upi)}</td>
            <td><button onclick="resolveRequest('payout_requests', '${d.id}')" style="padding:4px 8px; font-size:11px; background:#10b981; color:#fff;">Approve / Clear</button></td>
          </tr>
        `;
      });
      sSnap.forEach(d => {
        let req = d.data();
        rowsHTML += `
          <tr>
            <td><strong>${sanitizeInput(req.orgCode)}</strong><br><small style="color:#38bdf8;">${sanitizeInput(req.schoolName)}</small></td>
            <td>${sanitizeInput(req.orgName)}</td>
            <td><span style="color:#38bdf8; font-weight:bold;">Cash Settlement UTR</span></td>
            <td>UTR: ${sanitizeInput(req.utrNumber)} (₹${req.amount})</td>
            <td><button onclick="resolveRequest('settlement_payments', '${d.id}')" style="padding:4px 8px; font-size:11px; background:#10b981; color:#fff;">Approve UTR</button></td>
          </tr>
        `;
      });
      tbody.innerHTML = rowsHTML !== "" ? rowsHTML : `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No pending payout requests or UTR proofs.</td></tr>`;
    });
  });
}

window.resolveRequest = async (collName, docId) => {
  await deleteDoc(doc(db, collName, docId));
  alert("✅ Request approved and cleared!");
  renderPayoutAndSettlementTable();
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

function renderOrganizerLedger() {
  const tbody = document.querySelector("#admin-org-ledger-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  allOrganizers.forEach(async (org) => {
    let cashColl = 0;
    let onlineColl = 0;
    let orgStds = allStudents.filter(s => s.orgCode === org.code);

    orgStds.forEach(s => {
      const fee = s.fee || (org.examMode === "offline" ? (globalConfig.offlineFee || 120) : (globalConfig.onlineFee || 100));
      if (s.payMode === "cash" && s.paymentConfirmed) cashColl += fee;
      else if (s.payMode === "online") onlineColl += fee;
    });

    const totalConfirmed = orgStds.filter(s => s.paymentConfirmed || s.payMode === "online").length;
    let directComm = org.examMode === "offline" ? (totalConfirmed * 20) : ((cashColl + onlineColl) * 0.20);
    let netCashPayable = cashColl - directComm;

    let subOrgs = allOrganizers.filter(o => o.refCode === org.code);
    let refComm = 0;
    subOrgs.forEach(sub => {
      let subStds = allStudents.filter(s => s.orgCode === sub.code && (s.paymentConfirmed || s.payMode === "online"));
      let subTotalColl = subStds.reduce((sum, st) => sum + (st.fee || 100), 0);
      refComm += subTotalColl * 0.05;
    });

    let totalCurrentRevenue = cashColl + onlineColl + refComm;
    if (org.manualSettled && org.lastSettledRevenue !== undefined && totalCurrentRevenue > org.lastSettledRevenue) {
      await updateDoc(doc(db, "organizers", org.code), { manualSettled: false, lastSettledRevenue: null });
      org.manualSettled = false;
    }

    let isSettled = org.manualSettled || (cashColl === 0 && onlineColl > 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sanitizeInput(org.code)}</strong><br><small style="color:#38bdf8;">${sanitizeInput(org.schoolName)}</small></td>
      <td>${sanitizeInput(org.name)}</td>
      <td><span style="color:${org.principalApproved ? '#4ade80' : '#f87171'}; font-weight:bold;">${org.principalApproved ? 'APPROVED' : 'PENDING'}</span></td>
      <td>₹${cashColl}</td>
      <td>₹${onlineColl}</td>
      <td>₹${directComm.toFixed(2)}</td>
      <td><strong style="color:${isSettled ? '#4ade80' : '#f87171'};">${isSettled ? '₹0 (Settled)' : '₹' + (netCashPayable > 0 ? netCashPayable.toFixed(2) : 0)}</strong></td>
      <td><strong style="color:#4ade80;">₹${refComm.toFixed(2)}</strong></td>
      <td>
        ${isSettled ? 
          `<span style="color:#4ade80; font-weight:bold;">SETTLED (₹0)</span>` : 
          `<button onclick="markOrganizerSettled('${org.code}', ${totalCurrentRevenue})" style="padding:6px 12px; background:#10b981; color:#fff;">Mark Paid / Settled</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  });

  calculateOverallProfit();
}

window.markOrganizerSettled = async (orgCode, currentRevenue) => {
  if (confirm("Mark this organizer's cash account as Paid & Settled?")) {
    await updateDoc(doc(db, "organizers", orgCode), { 
      manualSettled: true,
      lastSettledRevenue: currentRevenue
    });
    alert("✅ Account marked Settled!");
    renderOrganizerLedger();
  }
};

function calculateOverallProfit() {
  let totalRevenue = 0;
  let totalCommissions = 0;

  allStudents.forEach(s => {
    if (s.paymentConfirmed || s.payMode === "online") {
      totalRevenue += (s.fee || 100);
    }
  });

  allOrganizers.forEach(org => {
    let orgStds = allStudents.filter(s => s.orgCode === org.code && (s.paymentConfirmed || s.payMode === "online"));
    let orgCashColl = orgStds.filter(s => s.payMode === "cash").reduce((sum, st) => sum + (st.fee || 100), 0);
    let orgOnlineColl = orgStds.filter(s => s.payMode === "online").reduce((sum, st) => sum + (st.fee || 100), 0);

    let directComm = org.examMode === "offline" ? (orgStds.length * 20) : ((orgCashColl + orgOnlineColl) * 0.20);

    let subOrgs = allOrganizers.filter(o => o.refCode === org.code);
    let refComm = 0;
    subOrgs.forEach(sub => {
      let subStds = allStudents.filter(s => s.orgCode === sub.code && (s.paymentConfirmed || s.payMode === "online"));
      let subTotalColl = subStds.reduce((sum, st) => sum + (st.fee || 100), 0);
      refComm += subTotalColl * 0.05;
    });

    totalCommissions += (directComm + refComm);
  });

  const medalsCost = parseFloat(document.getElementById("exp-medals-cost")?.value) || 0;
  const certsCost = parseFloat(document.getElementById("exp-cert-cost")?.value) || 0;
  const otherCost = parseFloat(document.getElementById("exp-other-cost")?.value) || 0;

  const totalExpenses = medalsCost + certsCost + otherCost;
  const netProfit = totalRevenue - (totalCommissions + totalExpenses);

  document.getElementById("stat-total-revenue").textContent = `₹${totalRevenue}`;
  document.getElementById("stat-total-commission").textContent = `₹${totalCommissions.toFixed(2)}`;
  document.getElementById("stat-total-expenses").textContent = `₹${totalExpenses.toFixed(2)}`;
  
  const profitEl = document.getElementById("stat-net-profit");
  if (profitEl) {
    profitEl.textContent = `₹${netProfit.toFixed(2)}`;
    profitEl.style.color = netProfit >= 0 ? "#4ade80" : "#f87171";
  }
}

window.loadRankingList = (category) => {
  const tbody = document.querySelector("#admin-ranking-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let filteredResults = allResults.map(r => {
    let std = allStudents.find(s => s.roll === r.roll);
    return { ...r, schoolName: std ? std.schoolName : 'Unknown', stdClass: std ? parseInt(std.stdClass) : 3 };
  });

  let catResults = filteredResults.filter(r => {
    if (category === 'cat_3_6') return r.stdClass >= 3 && r.stdClass <= 6;
    else return r.stdClass >= 7 && r.stdClass <= 12;
  });

  catResults.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
  let top6 = catResults.slice(0, 6);

  if (top6.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No results found in this category yet.</td></tr>`;
    return;
  }

  top6.forEach((res, idx) => {
    const tr = document.createElement("tr");
    let award = idx < 3 ? `🥇 Top 3 Medalist (${idx === 0 ? 'Gold' : idx === 1 ? 'Silver' : 'Bronze'})` : `📜 Top 6 Printed Certificate`;
    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td>${sanitizeInput(res.name)}</td>
      <td>${sanitizeInput(res.roll)}</td>
      <td>Class ${res.stdClass}</td>
      <td>${sanitizeInput(res.schoolName)}</td>
      <td><strong style="color:#fbbf24;">${res.marks}/${res.totalMarks} (${res.percentage}%)</strong></td>
      <td><span style="color:#38bdf8; font-weight:bold;">${award}</span></td>
    `;
    tbody.appendChild(tr);
  });
};

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
      <td><span style="color:${s.paymentConfirmed ? '#4ade80' : '#facc15'};">${s.paymentConfirmed ? 'APPROVED' : 'PENDING CASH (Unapproved)'}</span></td>
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
