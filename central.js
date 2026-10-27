import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, deleteDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let allStudents = [];
let allOrganizers = [];
let allPayouts = [];
let allSupports = [];
let allSettlementPayments = [];
let portalConfigData = {};
let currentYearSession = "2026";

// 1. Password Verification & Grand Welcome Trigger
window.verifyAdminPassword = async () => {
  const passInput = document.getElementById("admin-pass-input").value.trim();
  const alertBox = document.getElementById("login-security-alert");

  try {
    const docRef = doc(db, "settings", "portal_config");
    const docSnap = await getDoc(docRef);
    let masterPass = "narmada2026";

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
  loadOrganizersAndStudentsData();
  loadPayoutRequests();
  loadSupportQueries();
}

function loadMasterConfig() {
  onSnapshot(doc(db, "settings", "portal_config"), (docSnap) => {
    if (docSnap.exists()) {
      portalConfigData = docSnap.data();
      if (document.getElementById("cfg-online-fee")) document.getElementById("cfg-online-fee").value = portalConfigData.onlineFee || 100;
      if (document.getElementById("cfg-offline-fee")) document.getElementById("cfg-offline-fee").value = portalConfigData.offlineFee || 120;
      if (document.getElementById("cfg-duration")) document.getElementById("cfg-duration").value = portalConfigData.examDuration || 30;
      if (document.getElementById("cfg-upi")) document.getElementById("cfg-upi").value = portalConfigData.upiId || "narmada@upi";
      if (document.getElementById("cfg-qr-url")) document.getElementById("cfg-qr-url").value = portalConfigData.qrImageUrl || "Qrcode.jpg";
      
      if (document.getElementById("cfg-reg-active")) document.getElementById("cfg-reg-active").checked = !!portalConfigData.isRegistrationOpen;
      if (document.getElementById("cfg-exam-active")) document.getElementById("cfg-exam-active").checked = !!portalConfigData.isExamActive;
      if (document.getElementById("cfg-result-allowed")) document.getElementById("cfg-result-allowed").checked = !!portalConfigData.isResultDeclared;

      if (portalConfigData.manualExpenses) {
        if (document.getElementById("exp-medals-cost")) document.getElementById("exp-medals-cost").value = portalConfigData.manualExpenses.medals || 0;
        if (document.getElementById("exp-cert-cost")) document.getElementById("exp-cert-cost").value = portalConfigData.manualExpenses.certificates || 0;
        if (document.getElementById("exp-other-cost")) document.getElementById("exp-other-cost").value = portalConfigData.manualExpenses.other || 0;
      }
    }
  });
}

window.saveGlobalConfig = async () => {
  const onlineFee = Number(document.getElementById("cfg-online-fee").value);
  const offlineFee = Number(document.getElementById("cfg-offline-fee").value);
  const examDuration = Number(document.getElementById("cfg-duration").value);
  const upiId = document.getElementById("cfg-upi").value;
  const qrImageUrl = document.getElementById("cfg-qr-url").value;
  
  const isRegistrationOpen = document.getElementById("cfg-reg-active").checked;
  const isExamActive = document.getElementById("cfg-exam-active").checked;
  const isResultDeclared = document.getElementById("cfg-result-allowed").checked;

  try {
    await setDoc(doc(db, "settings", "portal_config"), {
      ...portalConfigData,
      onlineFee, offlineFee, examDuration, upiId, qrImageUrl,
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
    computeOverallLedgerAndProfit();
  } catch (e) {
    alert("Error saving expenses.");
  }
};

function loadOrganizersAndStudentsData() {
  onSnapshot(collection(db, "organizers"), (orgSnap) => {
    allOrganizers = [];
    orgSnap.forEach(d => allOrganizers.push({ code: d.id, ...d.data() }));

    onSnapshot(collection(db, "students"), (stuSnap) => {
      allStudents = [];
      stuSnap.forEach(d => {
        const sData = d.data();
        const sYear = sData.academicYear || "2026";
        allStudents.push({ id: d.id, academicYear: sYear, ...sData });
      });

      onSnapshot(collection(db, "settlement_payments"), (settleSnap) => {
        allSettlementPayments = [];
        settleSnap.forEach(d => allSettlementPayments.push({ id: d.id, ...d.data() }));

        renderAllTablesAndLedgers();
        renderOfflineStudentsTable();
      });
    });
  });
}

window.filterByAcademicYear = (year) => {
  currentYearSession = year;
  renderAllTablesAndLedgers();
  renderOfflineStudentsTable();
};

function renderAllTablesAndLedgers() {
  let totalRevenue = 0;
  let totalDirectCommission = 0;
  let totalReferralCommission = 0;

  const utrTbody = document.querySelector("#admin-utr-table tbody");
  const allStuTbody = document.querySelector("#admin-all-students-table tbody");
  const orgLedgerTbody = document.querySelector("#admin-org-ledger-table tbody");

  if (utrTbody) utrTbody.innerHTML = "";
  if (allStuTbody) allStuTbody.innerHTML = "";
  if (orgLedgerTbody) orgLedgerTbody.innerHTML = "";

  const filteredStudents = allStudents.filter(s => s.academicYear === currentYearSession);

  // 1. Process Students & Revenue
  filteredStudents.forEach(s => {
    const payMode = s.paymentMode || s.payMode;
    const isPaid = s.cashApproved || s.paymentConfirmed || payMode === "online";
    const feePaid = Number(s.feePaid || s.fee) || 100;

    if (isPaid) {
      totalRevenue += feePaid;
    }

    if (utrTbody && (s.utrNumber || payMode === "online")) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.rollNumber || s.roll || 'N/A'}</td>
        <td>${s.studentName || s.name || 'N/A'}</td>
        <td>${s.orgCode || 'N/A'}</td>
        <td>ONLINE</td>
        <td style="color:#38bdf8; font-weight:bold;">${s.utrNumber || 'Verified Online'}</td>
        <td>₹${feePaid}</td>
        <td><span style="color:#4ade80; font-weight:bold;">VERIFIED</span></td>
      `;
      utrTbody.appendChild(tr);
    }

    if (allStuTbody) {
      const tr = document.createElement("tr");
      const isBlocked = !!s.blocked;
      tr.innerHTML = `
        <td>${s.rollNumber || s.roll || 'N/A'}</td>
        <td>${s.studentName || s.name || 'N/A'}</td>
        <td>${s.orgCode || 'N/A'}</td>
        <td>Class ${s.studentClass || s.stdClass || 'N/A'} (<span style="color:#38bdf8;">${s.academicYear}</span>)</td>
        <td>
          <span style="color:${isPaid ? '#4ade80' : '#facc15'}; font-weight:bold;">${isPaid ? 'CONFIRMED' : 'PENDING CASH (Org)'}</span>
        </td>
        <td><span style="color:${isBlocked ? '#f87171' : '#4ade80'}; font-weight:bold;">${isBlocked ? 'BLOCKED 🔴' : 'ACTIVE 🟢'}</span></td>
        <td>
          <button onclick="toggleBlockStudent('${s.id}', ${!isBlocked})" style="padding:4px 8px; background:${isBlocked ? '#10b981' : '#f59e0b'}; color:#fff; border-radius:4px; font-size:11px; cursor:pointer;">${isBlocked ? 'Unblock' : 'Block'}</button>
          <button onclick="resetStudentExam('${s.id}')" style="padding:4px 8px; background:#0284c7; color:#fff; border-radius:4px; font-size:11px; cursor:pointer; margin-left:4px;">Re-Exam / Reset</button>
          <button onclick="deleteStudent('${s.id}')" style="padding:4px 8px; background:#ef4444; color:#fff; border-radius:4px; font-size:11px; cursor:pointer; margin-left:4px;">Delete</button>
        </td>
      `;
      allStuTbody.appendChild(tr);
    }
  });

  // 2. Process Organizers with Combined Format & 15% Direct / 5% Referral Split Colors
  allOrganizers.forEach(org => {
    const orgCode = org.code || org.orgCode;
    const schoolName = org.schoolName || org.name || "Unknown School";
    const examMode = (org.examMode || "online").toUpperCase();
    
    const orgStudentsList = filteredStudents.filter(s => s.orgCode === orgCode && (s.cashApproved || s.paymentConfirmed || (s.paymentMode || s.payMode) === "online"));
    const totalConfirmedCount = orgStudentsList.length;

    let cashColl = 0;
    let onlineColl = 0;
    orgStudentsList.forEach(s => {
      const fee = Number(s.feePaid || s.fee) || 100;
      if ((s.paymentMode || s.payMode) === "cash") cashColl += fee;
      else onlineColl += fee;
    });

    let directComm = 0;
    if (org.examMode === "offline") {
      directComm = totalConfirmedCount * 15; 
    } else {
      directComm = (cashColl + onlineColl) * 0.15; 
    }

    totalDirectCommission += directComm;

    let netPayable = cashColl - directComm;
    if (netPayable < 0) netPayable = 0;

    let lastSettledCash = org.lastSettledCash || 0;
    let currentDues = netPayable;
    if (org.manualSettled) {
      currentDues = Math.max(0, netPayable - lastSettledCash);
      if (currentDues > 0) {
        org.manualSettled = false;
      }
    }

    const isEligibleForPhysicalAwards = totalConfirmedCount >= 25;
    const thresholdBadge = isEligibleForPhysicalAwards ? 
      `<span style="color:#4ade80; font-size:10px; display:block;">🟢 Eligible (Physical Awards)</span>` : 
      `<span style="color:#f59e0b; font-size:10px; display:block;">⚠️ Low Strength (<25): E-Cert Only</span>`;

    let utrStatusHtml = org.manualSettled ? `<span style="color:#4ade80; font-weight:bold;">✅ Settled (Paid)</span>` : (currentDues > 0 ? `<span style="color:#f87171; font-weight:bold;">₹${currentDues.toFixed(2)} Due</span>` : `<span style="color:#10b981;">Fully Cleared</span>`);

    if (orgLedgerTbody) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <strong>${orgCode} - <span style="color: ${examMode === 'OFFLINE' ? '#fbbf24' : '#38bdf8'};">${examMode}</span></strong><br>
          <small style="color:#94a3b8;">${schoolName}</small>
          ${thresholdBadge}
        </td>
        <td>${org.name}</td>
        <td><span style="color:${org.principalApproved ? '#4ade80' : '#f87171'}; font-weight:bold;">${org.principalApproved ? 'APPROVED 🟢' : 'PENDING 🔴'}</span></td>
        <td>₹${cashColl} (${totalConfirmedCount} St.)</td>
        <td>₹${onlineColl}</td>
        <td><span style="color:#4ade80; font-weight:bold;">₹${directComm.toFixed(2)} (15%)</span></td>
        <td><strong style="color:${currentDues > 0 ? '#f87171' : '#10b981'};">₹${currentDues.toFixed(2)}</strong></td>
        <td>${utrStatusHtml}</td>
        <td>
          ${!org.manualSettled && currentDues > 0 ? 
            `<button onclick="markOrgSettled('${orgCode}', ${netPayable})" class="btn-primary" style="padding:6px 12px; font-size:12px; background:#10b981; width:auto;">Mark Paid</button>` : 
            `<button onclick="resetOrgSettlement('${orgCode}')" class="btn-secondary" style="padding:6px 12px; font-size:12px; background:#334155; color:#fff; width:auto;">Reset</button>`}
        </td>
      `;
      orgLedgerTbody.appendChild(tr);
    }
  });

  // 3. Referral Commission (5%) with Distinct Sky Blue Color
  allOrganizers.forEach(org => {
    const orgCode = org.code || org.orgCode;
    const subOrgs = allOrganizers.filter(sub => sub.refCode === orgCode);
    subOrgs.forEach(sub => {
      const subStudents = filteredStudents.filter(s => s.orgCode === (sub.code || sub.orgCode) && (s.cashApproved || s.paymentConfirmed || (s.paymentMode || s.payMode) === "online"));
      let subTotalColl = 0;
      subStudents.forEach(st => subTotalColl += Number(st.feePaid || st.fee) || 100);
      totalReferralCommission += subTotalColl * 0.05;
    });
  });

  let totalCombinedCommission = totalDirectCommission + totalReferralCommission;

  if (document.getElementById("stat-total-revenue")) document.getElementById("stat-total-revenue").textContent = `₹${totalRevenue}`;
  
  // Update UI Elements with Color Coding for Direct vs Referral Commissions
  const statCommEl = document.getElementById("stat-total-commission");
  if (statCommEl) {
    statCommEl.innerHTML = `
      <span style="color:#4ade80;" title="15% Direct Commission">₹${totalDirectCommission.toFixed(2)} (15% Direct)</span><br>
      <span style="color:#38bdf8;" title="5% Referral Commission">₹${totalReferralCommission.toFixed(2)} (5% Referral)</span>
    `;
  }
  
  computeOverallLedgerAndProfit(totalRevenue, totalCombinedCommission);
}

// Render Offline Students for Manual Marks Entry
function renderOfflineStudentsTable() {
  const tbody = document.querySelector("#admin-offline-marks-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const offlineStudents = allStudents.filter(s => {
    if (s.academicYear !== currentYearSession) return false;
    const org = allOrganizers.find(o => (o.code || o.orgCode) === s.orgCode);
    return org && org.examMode === "offline";
  });

  if (offlineStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No offline exam students found for year ${currentYearSession}.</td></tr>`;
    return;
  }

  offlineStudents.forEach(s => {
    const tr = document.createElement("tr");
    const currentScore = s.score !== undefined ? s.score : "";
    const currentTotal = s.totalMarks || 45;

    tr.innerHTML = `
      <td><strong>${s.rollNumber || s.roll}</strong></td>
      <td>${s.studentName || s.name}</td>
      <td>${s.orgCode || 'N/A'}</td>
      <td>Class ${s.studentClass || s.stdClass}</td>
      <td><span style="color:#d97706; font-weight:bold;">OFFLINE</span></td>
      <td>
        <input type="number" id="marks_${s.id}" value="${currentScore}" placeholder="Marks" style="width: 70px; display:inline-block; padding:4px; text-align:center;" /> / 
        <input type="number" id="total_${s.id}" value="${currentTotal}" placeholder="Total" style="width: 70px; display:inline-block; padding:4px; text-align:center;" />
      </td>
      <td>
        <button onclick="saveOfflineStudentMarks('${s.id}')" class="btn-primary" style="padding:6px 12px; font-size:12px; background:#10b981; width:auto;">Save Marks</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

window.saveOfflineStudentMarks = async (studentId) => {
  const marksInput = document.getElementById(`marks_${studentId}`).value;
  const totalInput = document.getElementById(`total_${studentId}`).value;

  const score = Number(marksInput);
  const totalMarks = Number(totalInput);

  if (isNaN(score) || isNaN(totalMarks) || totalMarks <= 0) {
    alert("Please enter valid numbers for marks and total!");
    return;
  }

  const percentage = Number(((score / totalMarks) * 100).toFixed(2));

  try {
    await updateDoc(doc(db, "students", studentId), {
      examCompleted: true,
      score: score,
      totalMarks: totalMarks,
      percentage: percentage,
      evaluatedBy: "Central Admin (Offline)"
    });

    alert(`✅ Offline Marks Updated Successfully!\n\nScore: ${score}/${totalMarks} (${percentage}%)`);
  } catch (err) {
    console.error(err);
    alert("Error updating offline student marks.");
  }
};

function loadPayoutRequests() {
  onSnapshot(collection(db, "payout_requests"), (snapshot) => {
    allPayouts = [];
    snapshot.forEach(d => allPayouts.push({ id: d.id, ...d.data() }));
    renderPayoutRequestsTable();
  });
}

function renderPayoutRequestsTable() {
  const tbody = document.querySelector("#admin-payout-requests-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (allPayouts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No pending payout requests.</td></tr>`;
    return;
  }

  allPayouts.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${p.orgCode}</strong><br><small style="color:#94a3b8;">${p.schoolName}</small></td>
      <td>${p.orgName}</td>
      <td>Commission Payout Request</td>
      <td><code style="color:#38bdf8;">${p.upi}</code></td>
      <td>
        <button onclick="resolvePayout('${p.id}')" class="btn-primary" style="padding:6px 12px; font-size:12px; background:#10b981; width:auto;">Mark Paid</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.resolvePayout = async (payoutId) => {
  if (confirm("Mark this payout request as processed and paid?")) {
    await deleteDoc(doc(db, "payout_requests", payoutId));
    alert("✅ Payout marked as resolved.");
  }
};

function loadSupportQueries() {
  onSnapshot(collection(db, "support_queries"), (snapshot) => {
    allSupports = [];
    snapshot.forEach(d => allSupports.push({ id: d.id, ...d.data() }));
    renderSupportTable();
  });
}

function renderSupportTable() {
  const tbody = document.querySelector("#admin-support-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (allSupports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No support queries found.</td></tr>`;
    return;
  }

  allSupports.forEach(sup => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sup.orgCode}</strong><br><small style="color:#94a3b8;">${sup.schoolName}</small></td>
      <td>${sup.orgName}</td>
      <td style="white-space:normal; max-width:250px;">${sup.message}</td>
      <td><small>${new Date(sup.timestamp).toLocaleString()}</small></td>
      <td>
        <button onclick="resolveSupport('${sup.id}')" class="btn-primary" style="padding:6px 12px; font-size:12px; background:#0284c7; width:auto;">Resolve</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.resolveSupport = async (supId) => {
  await deleteDoc(doc(db, "support_queries", supId));
  alert("✅ Support query resolved and removed.");
};

window.markOrgSettled = async (orgCode, currentNetPayable) => {
  if (confirm(`Confirm manual settlement and clear cash balance for organizer ${orgCode}?`)) {
    await updateDoc(doc(db, "organizers", orgCode), { 
      manualSettled: true,
      lastSettledCash: currentNetPayable,
      settledAt: new Date().toISOString()
    });
    alert("✅ Organizer cash balance marked as Settled!");
  }
};

window.resetOrgSettlement = async (orgCode) => {
  if (confirm(`Reset settlement status for organizer ${orgCode}?`)) {
    await updateDoc(doc(db, "organizers", orgCode), { 
      manualSettled: false,
      lastSettledCash: 0
    });
    alert("✅ Settlement reset successfully.");
  }
};

window.resetStudentExam = async (studentId) => {
  if (confirm("Reset exam attempt for this student? This will allow them to retake the online exam.")) {
    await updateDoc(doc(db, "students", studentId), {
      examCompleted: false,
      score: 0,
      percentage: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      unattempted: 0
    });
    alert("✅ Exam status reset successfully! Student can now log in and retake the exam.");
  }
};

window.computeOverallLedgerAndProfit = (rev = 0, comm = 0) => {
  const medals = Number(document.getElementById("exp-medals-cost")?.value) || 0;
  const cert = Number(document.getElementById("exp-cert-cost")?.value) || 0;
  const other = Number(document.getElementById("exp-other-cost")?.value) || 0;
  const totalExp = medals + cert + other;

  if (document.getElementById("stat-total-expenses")) document.getElementById("stat-total-expenses").textContent = `₹${totalExp}`;
  
  const currentRev = rev || Number(document.getElementById("stat-total-revenue")?.textContent.replace('₹', '')) || 0;
  const currentComm = comm || Number(document.getElementById("stat-total-commission")?.textContent.replace('₹', '')) || 0;
  
  const netProfit = currentRev - currentComm - totalExp;
  if (document.getElementById("stat-net-profit")) {
    const profitEl = document.getElementById("stat-net-profit");
    profitEl.textContent = `₹${netProfit.toFixed(2)}`;
    profitEl.style.color = netProfit >= 0 ? "#4ade80" : "#f87171";
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
  tbody.innerHTML = "";

  const filtered = allStudents.filter(s => {
    if (s.academicYear !== currentYearSession || !s.examCompleted) return false;
    const stdClass = parseInt(s.studentClass || s.stdClass);
    if (category === 'cat_3_6') return stdClass >= 3 && stdClass <= 6;
    if (category === 'cat_7_12') return stdClass >= 7 && stdClass <= 12;
    return false;
  });

  filtered.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
  const topSix = filtered.slice(0, 6);

  if (topSix.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No evaluated exam results found for this year category.</td></tr>`;
    return;
  }

  topSix.forEach((s, idx) => {
    const rank = idx + 1;
    let award = "💻 Digital E-Certificate";
    if (rank === 1) award = "🥇 Gold Medal + Memento";
    else if (rank === 2) award = "🥈 Silver Medal + Memento";
    else if (rank === 3) award = "🥉 Bronze Medal + Memento";
    else if (rank >= 4 && rank <= 6) award = "📜 Printed Cert + Memento";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>#${rank}</strong></td>
      <td>${s.studentName || s.name}</td>
      <td>${s.rollNumber || s.roll}</td>
      <td>Class ${s.studentClass || s.stdClass}</td>
      <td>${s.orgCode || 'N/A'}</td>
      <td><strong style="color:#fbbf24;">${s.score || 0} (${s.percentage || 0}%)</strong></td>
      <td><span style="color:#38bdf8; font-weight:bold;">${award}</span></td>
    `;
    tbody.appendChild(tr);
  });
};
