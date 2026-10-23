import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, onSnapshot, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let currentOrg = null;
let portalConfig = {};
let orgStudents = [];
let studentResults = {};
let referralOrgs = [];
let netCashPayableToNVMSO = 0;

function enforceNumericOnly(inputElement) {
  if (!inputElement) return;
  inputElement.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  enforceNumericOnly(document.getElementById("new-org-contact"));
  enforceNumericOnly(document.getElementById("reset-org-contact"));
});

onSnapshot(doc(db, "settings", "examConfig"), (docSnap) => {
  if (docSnap.exists()) {
    portalConfig = docSnap.data();

    const noticeBanner = document.getElementById("admin-notice-banner");
    const noticeText = document.getElementById("notice-text");
    if (portalConfig.broadcastNotice && noticeBanner && noticeText) {
      noticeText.textContent = portalConfig.broadcastNotice;
      noticeBanner.classList.remove("hidden");
    } else if (noticeBanner) {
      noticeBanner.classList.add("hidden");
    }

    const adminUpi = portalConfig.upiId || "narmadaolympiad@upi";
    const upiEl = document.getElementById("admin-settle-upi");
    if (upiEl) upiEl.textContent = adminUpi;

    const upiBtn = document.getElementById("admin-upi-btn");
    if (upiBtn) {
      const fee = portalConfig.onlineFee || 100;
      upiBtn.href = `upi://pay?pa=${adminUpi}&pn=NVMSO%20Admin%20Settlement&am=${fee}&cu=INR`;
    }

    const qrImg = document.getElementById("admin-settle-qr");
    if (qrImg) {
      qrImg.src = portalConfig.qrImageUrl || "Qrcode.jpg";
    }

    if (currentOrg) updateScheduleAndFeeUI();
  }
});

window.switchOrgTab = (tab) => {
  document.getElementById("org-reg-box")?.classList.add("hidden");
  document.getElementById("org-login-box")?.classList.add("hidden");
  document.getElementById("org-forgot-box")?.classList.add("hidden");

  if (tab === 'reg') document.getElementById("org-reg-box")?.classList.remove("hidden");
  else if (tab === 'forgot') document.getElementById("org-forgot-box")?.classList.remove("hidden");
  else document.getElementById("org-login-box")?.classList.remove("hidden");
};

document.getElementById("org-reg-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("new-org-name").value.trim();
  const schoolName = document.getElementById("new-org-school").value.trim();
  const contact = document.getElementById("new-org-contact").value.trim().replace(/[^0-9]/g, '');
  const password = document.getElementById("new-org-pass").value.trim();
  const refCode = document.getElementById("new-org-ref").value.trim().toUpperCase();

  if (contact.length !== 10) { alert("Enter a valid 10-digit mobile number!"); return; }

  try {
    const q = query(collection(db, "organizers"), where("contact", "==", contact));
    const snap = await getDocs(q);
    if (!snap.empty) { alert("❌ Contact number is already registered!"); return; }

    const generatedCode = `ORG${Math.floor(1000 + Math.random() * 9000)}`;

    await setDoc(doc(db, "organizers", generatedCode), {
      code: generatedCode, name, schoolName, contact, password,
      refCode: refCode || null, examMode: "online", academicYear: "2026-27", principalApproved: false, manualSettled: false, registeredAt: new Date().toISOString()
    });

    alert(`🎉 Registration Successful!\n\nOrganizer Code: ${generatedCode}\nPassword: ${password}`);
    document.getElementById("org-code-input").value = generatedCode;
    document.getElementById("org-pass-input").value = password;
    switchOrgTab('login');
  } catch (err) { alert("Error registering organizer account."); }
});

window.verifyOrgLogin = async () => {
  const code = document.getElementById("org-code-input").value.trim().toUpperCase();
  const password = document.getElementById("org-pass-input").value.trim();

  try {
    const orgDoc = await getDoc(doc(db, "organizers", code));
    if (orgDoc.exists() && orgDoc.data().password === password) {
      currentOrg = orgDoc.data();
      loadDashboardView();
    } else {
      alert("❌ Invalid Code or Password!");
    }
  } catch (err) { alert("Error logging in."); }
};

document.getElementById("btn-reset-exec")?.addEventListener("click", async () => {
  const contact = document.getElementById("reset-org-contact").value.trim().replace(/[^0-9]/g, '');
  const newPass = document.getElementById("reset-org-pass").value.trim();

  try {
    const q = query(collection(db, "organizers"), where("contact", "==", contact));
    const snap = await getDocs(q);
    if (snap.empty) { alert("❌ Mobile number not found!"); return; }

    let targetCode = "";
    snap.forEach(d => targetCode = d.id);

    await updateDoc(doc(db, "organizers", targetCode), { password: newPass });
    alert(`✅ Password Reset! Code is: ${targetCode}`);
    switchOrgTab('login');
  } catch (err) { alert("Error resetting password."); }
});

function loadDashboardView() {
  document.getElementById("org-login-box")?.classList.add("hidden");
  document.getElementById("org-view")?.classList.remove("hidden");

  document.getElementById("display-org-name").textContent = currentOrg.name;
  document.getElementById("display-org-code").textContent = currentOrg.code;
  document.getElementById("display-org-school").textContent = currentOrg.schoolName;

  updatePermissionUI(currentOrg.principalApproved);
  updateScheduleAndFeeUI();
  startRealtimeStudentsListener();
  startResultsListener();
  startReferralTrackingListener();
  listenToAdminManualSettlement();
}

window.togglePrincipalPermission = async (isChecked) => {
  if (!currentOrg) return;

  try {
    await updateDoc(doc(db, "organizers", currentOrg.code), {
      principalApproved: isChecked,
      approvedAt: isChecked ? new Date().toISOString() : null
    });

    currentOrg.principalApproved = isChecked;
    updatePermissionUI(isChecked);

    if (isChecked) {
      alert("✅ Official Permission Confirmed! Your Organizer Code is now ACTIVE for Student Registrations.");
    } else {
      alert("⚠️ Organizer Code Locked! Student registrations will be blocked until permission is checked.");
    }
  } catch (err) { alert("Error updating permission status."); }
};

function updatePermissionUI(isApproved) {
  const checkbox = document.getElementById("principal-perm-checkbox");
  const statusText = document.getElementById("perm-status-text");

  if (checkbox) checkbox.checked = !!isApproved;
  if (statusText) {
    if (isApproved) {
      statusText.textContent = "OFFICIAL PERMISSION CONFIRMED (Student Registration ACTIVE 🚀)";
      statusText.style.color = "#4ade80";
    } else {
      statusText.textContent = "OFFICIAL PERMISSION PENDING (Student Registration Locked 🔒)";
      statusText.style.color = "#f87171";
    }
  }
}

function listenToAdminManualSettlement() {
  onSnapshot(doc(db, "organizers", currentOrg.code), (docSnap) => {
    if (docSnap.exists()) {
      currentOrg = docSnap.data();
      recalculateFinancials();
    }
  });
}

function updateScheduleAndFeeUI() {
  const mode = currentOrg.examMode || "online";
  const selectedYear = currentOrg.academicYear || portalConfig.academicYear || "2026-27";
  const fee = mode === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);

  const selectedYearEl = document.getElementById("display-selected-year");
  if (selectedYearEl) selectedYearEl.textContent = selectedYear;

  const modeEl = document.getElementById("display-exam-mode");
  if (modeEl) modeEl.textContent = mode.toUpperCase();

  const feeEl = document.getElementById("current-applicable-fee");
  if (feeEl) feeEl.textContent = fee;

  const durEl = document.getElementById("display-exam-duration");
  if (durEl) durEl.textContent = portalConfig.duration || 30;

  const yearSelect = document.getElementById("org-academic-year-select");
  if (yearSelect) yearSelect.value = selectedYear;

  const startEl = document.getElementById("display-exam-start");
  if (startEl) startEl.textContent = portalConfig.examStartTime ? new Date(portalConfig.examStartTime).toLocaleString() : "Not Scheduled Yet";

  const closeEl = document.getElementById("display-exam-close");
  if (closeEl) closeEl.textContent = portalConfig.examEndTime ? new Date(portalConfig.examEndTime).toLocaleString() : "Not Scheduled Yet";

  const regBadge = document.getElementById("status-reg-badge");
  const examBadge = document.getElementById("status-exam-badge");
  const resultBadge = document.getElementById("status-result-badge");

  if (regBadge) {
    regBadge.textContent = portalConfig.regActive ? "ACTIVE 🟢" : "INACTIVE 🔴";
    regBadge.style.color = portalConfig.regActive ? "#4ade80" : "#f87171";
  }
  if (examBadge) {
    examBadge.textContent = portalConfig.examActive ? "ACTIVE 🚀" : "INACTIVE 🔴";
    examBadge.style.color = portalConfig.examActive ? "#4ade80" : "#f87171";
  }
  if (resultBadge) {
    resultBadge.textContent = portalConfig.resultAllowed ? "ACTIVE 🏆" : "INACTIVE 🔴";
    resultBadge.style.color = portalConfig.resultAllowed ? "#4ade80" : "#f87171";
  }
}

window.updateAcademicYear = async (newYear) => {
  if (!currentOrg) return;
  currentOrg.academicYear = newYear;
  await updateDoc(doc(db, "organizers", currentOrg.code), { academicYear: newYear });
  
  const stdQuery = query(collection(db, "students"), where("orgCode", "==", currentOrg.code));
  const snap = await getDocs(stdQuery);
  snap.forEach(async (d) => {
    await updateDoc(doc(db, "students", d.id), { academicYear: newYear });
  });

  updateScheduleAndFeeUI();
  alert(`🎓 Academic Session Year updated to: ${newYear}`);
};

window.updateExamMode = async (newMode) => {
  currentOrg.examMode = newMode;
  await updateDoc(doc(db, "organizers", currentOrg.code), { examMode: newMode });
  updateScheduleAndFeeUI();
  recalculateFinancials();
  alert(`Exam mode updated to: ${newMode.toUpperCase()}`);
};

function startRealtimeStudentsListener() {
  const stdQuery = query(collection(db, "students"), where("orgCode", "==", currentOrg.code));
  onSnapshot(stdQuery, (snapshot) => {
    orgStudents = [];
    snapshot.forEach(d => orgStudents.push({ id: d.id, ...d.data() }));
    renderStudentsTable();
    recalculateFinancials();
  });
}

function startResultsListener() {
  onSnapshot(collection(db, "results"), (snapshot) => {
    studentResults = {};
    snapshot.forEach(d => {
      const data = d.data();
      studentResults[data.roll] = data;
    });
    renderStudentsTable();
  });
}

function renderStudentsTable() {
  const tbody = document.querySelector("#org-all-students-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (orgStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:15px; color:#94a3b8;">No registered students found.</td></tr>`;
    return;
  }

  let classWiseGroup = {};
  orgStudents.forEach(s => {
    const stdClass = parseInt(s.stdClass);
    const category = (stdClass >= 3 && stdClass <= 6) ? "cat_3_6" : "cat_7_12";
    if (!classWiseGroup[category]) classWiseGroup[category] = [];
    
    const res = studentResults[s.roll];
    const score = res ? (res.percentage || res.marks || 0) : 0;
    classWiseGroup[category].push({ ...s, score, res });
  });

  let rankMap = {};
  Object.keys(classWiseGroup).forEach(cat => {
    classWiseGroup[cat].sort((a, b) => b.score - a.score);
    classWiseGroup[cat].forEach((st, idx) => {
      rankMap[st.roll] = idx + 1;
    });
  });

  orgStudents.forEach((s) => {
    const tr = document.createElement("tr");
    const isPaid = s.paymentConfirmed || s.payMode === "online";
    const res = studentResults[s.roll];
    const rank = rankMap[s.roll] || 0;

    let awardBadge = "⏳ Pending Exam";
    if (portalConfig.resultAllowed && res) {
      if (rank === 1) awardBadge = "🥇 Gold Medal + Memento";
      else if (rank === 2) awardBadge = "🥈 Silver Medal + Memento";
      else if (rank === 3) awardBadge = "🥉 Bronze Medal + Memento";
      else if (rank >= 4 && rank <= 6) awardBadge = "📜 Printed Cert + Memento";
      else awardBadge = "💻 Digital E-Certificate";
    }

    tr.innerHTML = `
      <td><strong>${s.roll}</strong></td>
      <td>${s.name}</td>
      <td><code style="background:#0f172a; padding:3px 6px; border-radius:4px; color:#38bdf8;">${s.password || 'N/A'}</code></td>
      <td>Class ${s.stdClass}${s.stream ? ` (${s.stream})` : ''}</td>
      <td><span style="text-transform:uppercase;">${s.payMode || 'cash'}</span></td>
      <td><span style="color:${isPaid ? '#4ade80' : '#facc15'}; font-weight:bold;">${isPaid ? 'CONFIRMED' : 'PENDING CASH'}</span></td>
      <td>${portalConfig.resultAllowed && res ? `<strong style="color:#fbbf24;">${res.marks}/${res.totalMarks} (${res.percentage}%)</strong>` : `<span style="color:#94a3b8;">Hidden until result</span>`}</td>
      <td><span style="color:#38bdf8; font-weight:bold;">${awardBadge}</span></td>
      <td>
        ${!isPaid && s.payMode === 'cash' ? 
          `<button onclick="confirmCashPayment('${s.id}')" class="btn-primary" style="padding:6px 10px; font-size:12px; background:#10b981;">Approve Cash</button>` : 
          `<span style="color:#38bdf8;">Verified</span>`}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.confirmCashPayment = async (studentDocId) => {
  if (confirm("Confirm Cash receipt for this student?")) {
    await updateDoc(doc(db, "students", studentDocId), { paymentConfirmed: true });
    alert("✅ Cash Payment Approved!");
  }
};

function recalculateFinancials() {
  let cashColl = 0;
  let onlineColl = 0;

  orgStudents.forEach(s => {
    const fee = s.fee || (currentOrg.examMode === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100));
    if (s.payMode === "cash" && s.paymentConfirmed) cashColl += fee;
    else if (s.payMode === "online") onlineColl += fee;
  });

  const totalConfirmed = orgStudents.filter(s => s.paymentConfirmed || s.payMode === "online").length;
  let directComm = currentOrg.examMode === "offline" ? (totalConfirmed * 20) : ((cashColl + onlineColl) * 0.20);

  let refComm = 0;
  referralOrgs.forEach(sub => refComm += (sub.totalColl || 0) * 0.05);

  document.getElementById("stat-cash-coll").textContent = `₹${cashColl}`;
  document.getElementById("stat-online-coll").textContent = `₹${onlineColl}`;
  document.getElementById("stat-direct-comm").textContent = `₹${directComm.toFixed(2)}`;
  document.getElementById("stat-ref-comm").textContent = `₹${refComm.toFixed(2)}`;

  netCashPayableToNVMSO = cashColl - directComm;
  if (netCashPayableToNVMSO < 0) netCashPayableToNVMSO = 0;

  const settText = document.getElementById("settlement-text");
  const settPayContainer = document.getElementById("settlement-pay-container");

  if (currentOrg.manualSettled || netCashPayableToNVMSO === 0) {
    if (settText) {
      settText.textContent = `✅ Cash Cleared & Settled Successfully! (Net Payable Balance: ₹0)`;
      settText.style.color = "#4ade80";
    }
    netCashPayableToNVMSO = 0;
    settPayContainer?.classList.add("hidden");
    return;
  }

  if (settText) {
    if (netCashPayableToNVMSO > 0) {
      settText.textContent = `⚠️ Excess Cash Pending. Net Amount Payable to NVMSO Admin (After Deducting Commission): ₹${netCashPayableToNVMSO.toFixed(2)}`;
      settText.style.color = "#f87171";
      settPayContainer?.classList.remove("hidden");
    } else {
      settText.textContent = `✅ Commission Adjusted! No Excess Cash Pending (Payable Balance: ₹0)`;
      settText.style.color = "#4ade80";
      settPayContainer?.classList.add("hidden");
    }
  }
}

function startReferralTrackingListener() {
  const refQuery = query(collection(db, "organizers"), where("refCode", "==", currentOrg.code));
  onSnapshot(refQuery, async (snapshot) => {
    referralOrgs = [];
    const tbody = document.querySelector("#org-referral-tracking-table tbody");
    if (tbody) tbody.innerHTML = "";

    if (snapshot.empty) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:10px; color:#94a3b8;">No referral records found yet.</td></tr>`;
      recalculateFinancials();
      return;
    }

    snapshot.forEach(d => {
      const sub = d.data();
      referralOrgs.push({ code: d.id, name: sub.name, schoolName: sub.schoolName, joinedAt: sub.registeredAt, totalColl: 0 });
    });

    for (let sub of referralOrgs) {
      const subStds = await getDocs(query(collection(db, "students"), where("orgCode", "==", sub.code)));
      let subTotal = 0;
      subStds.forEach(sd => {
        if (sd.data().paymentConfirmed || sd.data().payMode === "online") subTotal += sd.data().fee || 100;
      });
      sub.totalColl = subTotal;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding:8px;"><strong>${sub.name}</strong><br><small style="color:#38bdf8;">${sub.schoolName} (${sub.code})</small></td>
        <td style="padding:8px;">Sub-Organizer</td>
        <td style="padding:8px;"><small>${sub.joinedAt ? new Date(sub.joinedAt).toLocaleDateString() : 'N/A'}</small></td>
        <td style="padding:8px; color:#4ade80; font-weight:bold;">₹${(subTotal * 0.05).toFixed(2)} (Paid by NVMSO)</td>
      `;
      tbody?.appendChild(tr);
    }
    recalculateFinancials();
  });
}

document.getElementById("settlement-pay-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const utr = document.getElementById("settlement-utr").value.trim();

  if (!utr || utr.length < 6) { alert("Enter a valid UTR Number!"); return; }

  await setDoc(doc(db, "settlement_payments", currentOrg.code), {
    orgCode: currentOrg.code, orgName: currentOrg.name, schoolName: currentOrg.schoolName,
    utrNumber: utr, amount: netCashPayableToNVMSO, submittedAt: new Date().toISOString(), status: "PENDING"
  });

  alert("✅ Cash Settlement UTR Proof Submitted Successfully!\n\nAdmin will verify the UTR and settle your account within 48 hours to 10 days.");
  document.getElementById("settlement-utr").value = "";
});

document.getElementById("payout-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (netCashPayableToNVMSO > 0) {
    alert(`⛔ Payout Blocked!\n\nYou have ₹${netCashPayableToNVMSO.toFixed(2)} un-cleared cash payable to NVMSO.\n\nPlease clear/pay the remaining cash balance to NVMSO first before requesting a payout.`);
    return;
  }

  const upi = document.getElementById("payout-upi").value.trim();
  const qrUrl = document.getElementById("payout-qr-url").value.trim();

  if (!upi) { alert("Enter your UPI ID or Payment Number!"); return; }

  await setDoc(doc(db, "payout_requests", currentOrg.code), {
    orgCode: currentOrg.code, orgName: currentOrg.name, schoolName: currentOrg.schoolName,
    upi, qrUrl: qrUrl || null, requestedAt: new Date().toISOString(), status: "PENDING"
  });

  alert("✅ Payout Claim Submitted Successfully!\n\nTimeline: NVMSO will credit your payout within 48 Hours to 10 Working Days.");
});

window.sendHelpQuery = async () => {
  const message = document.getElementById("support-msg")?.value.trim();
  if (!message) { alert("Enter your query message!"); return; }

  await addDoc(collection(db, "support_queries"), {
    orgCode: currentOrg.code, orgName: currentOrg.name, schoolName: currentOrg.schoolName,
    message, status: "PENDING", timestamp: new Date().toISOString()
  });

  alert("✅ Query sent to NVMSO support team!");
  document.getElementById("support-msg").value = "";
};

window.exitOrganizerAccount = () => {
  if (confirm("Exit / Switch organizer account?")) {
    currentOrg = null;
    window.location.href = window.location.pathname;
  }
};
