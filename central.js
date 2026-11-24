const SERVER_URL = "https://nvmso-backend.onrender.com";
let allStudentsCache = [];
let allOrganizersCache = [];
let pendingSettlementsCache = [];
let pendingPayoutsCache = [];
let autoRefreshTimer = null;

function int(val) {
  return Math.floor(val);
}

function getSubjectBadge(student) {
  const rawSub = String(
    student.subject ||
    student.examSubject ||
    student.stream ||
    student.selectedSubject ||
    student.course ||
    ""
  )
    .trim()
    .toLowerCase();

  if (rawSub === "m" || rawSub.startsWith("math") || rawSub.includes("maths")) {
    return ` <span style="color:#38bdf8; font-weight:800;">(M)</span>`;
  }
  if (rawSub === "s" || rawSub.startsWith("sci")) {
    return ` <span style="color:#4ade80; font-weight:800;">(S)</span>`;
  }
  return "";
}

function getOrganizerPayoutUpi(org) {
  const code = (org.code || org.orgCode || "").toUpperCase();
  const fromObj = String(org.upiId || org.payoutUpi || org.upi || "").trim();
  const fromLocal = String(localStorage.getItem(`nvmso_org_upi_${code}`) || "").trim();
  return fromObj || fromLocal || "";
}

// 🔄 PERSISTENT SESSION CHECK ON PAGE LOAD
document.addEventListener("DOMContentLoaded", () => {
  startLiveClockTracker();

  if (sessionStorage.getItem("nvmso_admin_logged") === "true") {
    const loginScreen = document.getElementById("admin-login-screen");
    const mainContainer = document.getElementById("admin-main-container");
    if (loginScreen) loginScreen.classList.add("hidden");
    if (mainContainer) mainContainer.classList.remove("hidden");
    initializeCentralPanelData();
  }
});

function startLiveClockTracker() {
  const clockEl = document.getElementById("admin-live-clock");
  if (!clockEl) return;

  const updateClock = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString() + " (" + now.toLocaleDateString() + ")";
  };

  updateClock();
  setInterval(updateClock, 1000);
}

window.verifyAdminPassword = async () => {
  const passInputEl = document.getElementById("admin-pass-input");
  const alertBox = document.getElementById("login-security-alert");
  const submitBtn = document.getElementById("btn-admin-auth");
  const passInput = passInputEl ? passInputEl.value.trim() : "";

  if (!passInput) {
    if (alertBox) {
      alertBox.textContent = "⚠️ Please input master authorization key.";
      alertBox.style.display = "block";
    }
    return;
  }

  if (alertBox) alertBox.style.display = "none";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Authenticating...";
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/admin/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passInput })
    });

    if (res.status === 200) {
      sessionStorage.setItem("nvmso_admin_logged", "true");
      triggerGrandWelcome();
      initializeCentralPanelData();
    } else {
      throw new Error("Master Password Verification Failed");
    }
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = "🚨 Security Alert: Master Password Verification Failed!";
      alertBox.style.display = "block";
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Authenticate Panel";
    }
  }
};

function triggerGrandWelcome() {
  const loginScreen = document.getElementById("admin-login-screen");
  if (loginScreen) loginScreen.classList.add("hidden");

  const welcomeScreen = document.getElementById("grand-welcome-screen");
  const mainContainer = document.getElementById("admin-main-container");
  if (welcomeScreen) {
    welcomeScreen.classList.remove("reveal-open");
    welcomeScreen.classList.remove("hidden");
  }

  let countdown = 3;
  let progressWidth = 0;
  const countdownEl = document.getElementById("welcome-countdown");
  const progressEl = document.getElementById("welcome-progress");

  if (countdownEl) countdownEl.textContent = countdown;
  if (progressEl) progressEl.style.width = "0%";

  const progressInterval = setInterval(() => {
    progressWidth += 3.34;
    if (progressEl) {
      progressEl.style.width = `${Math.min(progressWidth, 100)}%`;
    }
  }, 100);

  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = Math.max(countdown, 0);
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      clearInterval(progressInterval);
      if (progressEl) progressEl.style.width = "100%";
      if (welcomeScreen) welcomeScreen.classList.add("reveal-open");
      setTimeout(() => {
        if (welcomeScreen) welcomeScreen.classList.add("hidden");
        if (mainContainer) mainContainer.classList.remove("hidden");
      }, 800);
    }
  }, 1000);
}

function initializeCentralPanelData() {
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        const config = data.config || {};
        if (document.getElementById("cfg-online-fee")) {
          document.getElementById("cfg-online-fee").value = config.onlineFee || 100;
        }
        if (document.getElementById("cfg-offline-fee")) {
          document.getElementById("cfg-offline-fee").value = config.offlineFee || 120;
        }
        if (document.getElementById("cfg-reg-active")) {
          document.getElementById("cfg-reg-active").checked = !!config.isRegistrationOpen;
        }
        if (document.getElementById("cfg-exam-active")) {
          document.getElementById("cfg-exam-active").checked = !!config.isExamActive;
        }
        if (document.getElementById("cfg-result-allowed")) {
          document.getElementById("cfg-result-allowed").checked = !!config.isResultDeclared;
        }
        if (document.getElementById("admin-broadcast-input")) {
          document.getElementById("admin-broadcast-input").value = config.broadcastNotice || "";
        }

        setupSmartSwitchesExclusiveRule();
        fetchAllCentralData();

        // 🔄 AUTO-REFRESH LIVE SYNC (8s poll)
        if (!autoRefreshTimer) {
          autoRefreshTimer = setInterval(() => {
            fetchAllCentralData();
          }, 8000);
        }
      }
    })
    .catch(() => {});
}

function setupSmartSwitchesExclusiveRule() {
  const regChk = document.getElementById("cfg-reg-active");
  const examChk = document.getElementById("cfg-exam-active");
  const resultChk = document.getElementById("cfg-result-allowed");

  if (regChk && examChk && resultChk) {
    regChk.addEventListener("change", () => {
      if (regChk.checked) {
        examChk.checked = false;
        resultChk.checked = false;
      }
    });
    examChk.addEventListener("change", () => {
      if (examChk.checked) {
        regChk.checked = false;
        resultChk.checked = false;
      }
    });
    resultChk.addEventListener("change", () => {
      if (resultChk.checked) {
        regChk.checked = false;
        examChk.checked = false;
      }
    });
  }
}

window.saveGlobalConfig = async () => {
  const adminUpiEl = document.getElementById("cfg-admin-upi");
  const payload = {
    onlineFee: Number(document.getElementById("cfg-online-fee").value),
    offlineFee: Number(document.getElementById("cfg-offline-fee").value),
    adminUpiId: adminUpiEl ? (adminUpiEl.value.trim() || "narmada@upi") : "narmada@upi",
    isRegistrationOpen: document.getElementById("cfg-reg-active").checked,
    isExamActive: document.getElementById("cfg-exam-active").checked,
    isResultDeclared: document.getElementById("cfg-result-allowed").checked,
    broadcastNotice: document.getElementById("admin-broadcast-input").value.trim()
  };

  fetch(`${SERVER_URL}/api/admin/update_config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("✅ Command Dispatched: Portal phases and parameters updated successfully!");
      renderMergedOrganizersTable();
    }
  });
};

function fetchAllCentralData() {
  Promise.all([
    fetch(`${SERVER_URL}/api/admin/all_data`, { method: "POST" }).then(res => res.json()),
    fetch(`${SERVER_URL}/api/admin/financial_requests`).then(res => res.json())
  ]).then(([data1, data2]) => {
    if (data1 && data1.status === "success") {
      allOrganizersCache = data1.organizers || [];
      allStudentsCache = data1.students || [];
    }
    if (data2 && data2.status === "success") {
      pendingSettlementsCache = data2.settlements || [];
      pendingPayoutsCache = data2.payouts || [];
    }

    renderMergedOrganizersTable();
    populateSchoolDropdowns();
    loadSchoolRankings();
    loadSchoolStudentLedger();
  }).catch(() => {});
}

function renderMergedOrganizersTable() {
  const tbody = document.getElementById("admin-organizers-rows");
  if (!tbody) return;
  tbody.innerHTML = allOrganizersCache.length
    ? ""
    : "<tr><td colspan='8' style='text-align:center; color:#64748b; padding:15px;'>No organizers registered yet.</td></tr>";

  const onlineFeeConfig = Number(document.getElementById("cfg-online-fee")?.value) || 100;
  const offlineFeeConfig = Number(document.getElementById("cfg-offline-fee")?.value) || 120;

  allOrganizersCache.forEach(org => {
    const code = (org.code || org.orgCode || "").toUpperCase();
    const isSettled = !!org.manualSettled;

    const allSchoolStudents = allStudentsCache.filter(
      s => (s.orgCode || "").toUpperCase() === code
    );
    const verifiedStudents = allSchoolStudents.filter(
      s => s.paymentStatus === "Approved" || s.paymentVerified === true
    );

    const totalReg = verifiedStudents.length || 0;
    const pendingReviewCount = allSchoolStudents.filter(
      s => s.paymentStatus && s.paymentStatus.includes("Pending")
    ).length;

    const onlineRegs = verifiedStudents.filter(
      s => (s.paymentMode || "online").toLowerCase() === "online"
    ).length;
    const cashRegs = verifiedStudents.filter(
      s =>
        (s.paymentMode || "").toLowerCase() === "offline" ||
        (s.paymentMode || "").toLowerCase() === "cash"
    ).length;

    const examMode = (org.examMode || "online").toLowerCase();

    const cashGross = cashRegs * (examMode === "offline" ? offlineFeeConfig : onlineFeeConfig);
    const baseFeeTotal = totalReg * onlineFeeConfig;

    const directComm = int(baseFeeTotal * 0.15);
    const refCodeStr = org.refCode ? String(org.refCode).trim() : "";
    const hasReferral = refCodeStr.length > 0 && refCodeStr.toUpperCase() !== "NONE";
    const refComm = hasReferral ? int(baseFeeTotal * 0.05) : 0;
    const totalComm = directComm + refComm;

    const netBalance = cashGross - totalComm;
    const netCashToPortal = isSettled ? 0 : Math.max(0, netBalance);

    const sett = pendingSettlementsCache.find(s => (s.orgCode || "").toUpperCase() === code);

    let settCell = isSettled
      ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled (₹0 Due)</span>"
      : "<span style='color:#f87171;'>Pending Settlement</span>";

    if (!isSettled && sett) {
      settCell = `<code style="color:#facc15;">UTR: ${sett.utrNumber}<br>(₹${sett.amount})</code>`;
    }

    let actionCell = isSettled
      ? "<span style='color:#38bdf8; font-weight:bold;'>Completed</span>"
      : sett
      ? `<button type="button" onclick="approveOrganizerSettlement('${code}', '${sett.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Verify UTR</button>`
      : "Awaiting";

    const pendingBadge =
      pendingReviewCount > 0
        ? `<br><span style="font-size:9px; color:#f59e0b; font-weight:bold;">(${pendingReviewCount} Pending)</span>`
        : "";

    // Coordinator's own saved UPI ID (never fallback to admin UPI)
    const orgUpi = getOrganizerPayoutUpi(org);

    let directCommHtml = `₹${directComm}`;
    if (directComm > 0 && !isSettled) {
      if (orgUpi) {
        const directUpiLink = `upi://pay?pa=${encodeURIComponent(orgUpi)}&pn=${encodeURIComponent(org.schoolName || "Organizer")}&am=${directComm}&cu=INR`;
        directCommHtml += `<br><a href="${directUpiLink}" style="background:#10b981; color:#fff; padding:2px 7px; font-size:9px; border-radius:3px; text-decoration:none; display:inline-block; margin-top:3px; font-weight:bold;">Pay</a><br><span style="font-size:9px; color:#cbd5e1; word-break:break-all;">${orgUpi}</span>`;
      } else {
        directCommHtml += `<br><span style="font-size:9px; color:#f87171; font-weight:bold;">Pay</span><br><span style="font-size:9px; color:#f87171;">No UPI</span>`;
      }
    }

    let refCommHtml = `₹${refComm}`;
    if (refComm > 0 && !isSettled) {
      if (orgUpi) {
        const refUpiLink = `upi://pay?pa=${encodeURIComponent(orgUpi)}&pn=${encodeURIComponent(org.schoolName || "Organizer")}&am=${refComm}&cu=INR`;
        refCommHtml += `<br><a href="${refUpiLink}" style="background:#f59e0b; color:#020617; padding:2px 7px; font-size:9px; border-radius:3px; text-decoration:none; display:inline-block; margin-top:3px; font-weight:bold;">Pay</a><br><span style="font-size:9px; color:#cbd5e1; word-break:break-all;">${orgUpi}</span>`;
      } else {
        refCommHtml += `<br><span style="font-size:9px; color:#f87171; font-weight:bold;">Pay</span><br><span style="font-size:9px; color:#f87171;">No UPI</span>`;
      }
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;">
          <code style="color:#38bdf8; font-weight:bold; font-size:13px;">${code}</code><br>
          <span style="font-size:12px; color:#cbd5e1; font-weight:600;">${org.schoolName || "School"}</span><br>
          <span style="background:#1e293b; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:bold; color:${examMode === "offline" ? "#fbbf24" : "#38bdf8"}">${examMode.toUpperCase()}</span>
        </td>
        <td style="padding:10px;">
          <strong>${org.name || org.coordinatorName || "N/A"}</strong><br>
          <span style="font-size:11px; color:#94a3b8;">${org.contact || ""}</span><br>
          <span style="font-size:10px; color:${orgUpi ? "#4ade80" : "#f87171"};">UPI: ${orgUpi || "Not Set"}</span>
        </td>
        <td style="padding:10px; color:#4ade80; font-weight:bold; text-align:center;">
          ${totalReg} ${pendingBadge}<br><span style="font-size:10px; color:#94a3b8;">(${onlineRegs} On / ${cashRegs} Cash)</span>
        </td>
        <td style="padding:10px; color:#facc15; font-weight:bold;">${directCommHtml}</td>
        <td style="padding:10px; color:#c084fc; font-weight:bold;">${refCommHtml}</td>
        <td style="padding:10px;">
          <strong style="color:${netCashToPortal > 0 ? "#f87171" : "#4ade80"}; font-size:14px;">₹${netCashToPortal}</strong><br>
          <span style="font-size:10px; color:#94a3b8;">Cash Held: ₹${cashGross}</span>
        </td>
        <td style="padding:10px;">${settCell}</td>
        <td style="padding:10px;">${actionCell}</td>
      </tr>
    `;
  });
}

function populateSchoolDropdowns() {
  const rankSelect = document.getElementById("ranking-school-select");
  const ledgerSelect = document.getElementById("ledger-school-select");

  let optionsHtml = '<option value="ALL">-- All Schools Combined --</option>';
  allOrganizersCache.forEach(org => {
    const code = org.code || org.orgCode;
    optionsHtml += `<option value="${code}">${code} - ${org.schoolName}</option>`;
  });

  if (rankSelect) rankSelect.innerHTML = optionsHtml;
  if (ledgerSelect) ledgerSelect.innerHTML = optionsHtml;
}

window.loadSchoolRankings = function() {
  const selectedOrg = document.getElementById("ranking-school-select")?.value || "ALL";
  const gridContainer = document.getElementById("school-rankings-grid");
  if (!gridContainer) return;

  let studentsToRank = allStudentsCache;
  if (selectedOrg !== "ALL") {
    studentsToRank = allStudentsCache.filter(
      s => (s.orgCode || "").toUpperCase() === selectedOrg.toUpperCase()
    );
  }

  const schoolMap = {};
  studentsToRank.forEach(s => {
    const code = (s.orgCode || "UNKNOWN").toUpperCase();
    if (!schoolMap[code]) schoolMap[code] = [];
    schoolMap[code].push(s);
  });

  gridContainer.innerHTML = Object.keys(schoolMap).length
    ? ""
    : "<div style='grid-column: 1 / -1; text-align: center; color: #64748b; padding: 20px;'>No ranked students found for this selection.</div>";

  Object.keys(schoolMap).forEach(code => {
    const students = schoolMap[code];
    const orgInfo =
      allOrganizersCache.find(o => (o.code || o.orgCode || "").toUpperCase() === code) || {};
    const schoolName = orgInfo.schoolName || `School Code: ${code}`;

    students.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

    const classes = students.map(s => parseInt(s.studentClass, 10)).filter(c => !isNaN(c));
    const minClass = classes.length > 0 ? Math.min(...classes) : 3;
    const maxClass = classes.length > 0 ? Math.max(...classes) : 12;
    const midClass = Math.floor((minClass + maxClass) / 2);

    const group1 = students.filter(s => {
      const c = parseInt(s.studentClass, 10);
      return c >= minClass && c <= midClass;
    });
    const group2 = students.filter(s => {
      const c = parseInt(s.studentClass, 10);
      return c > midClass && c <= maxClass;
    });

    const getRewardBadge = index => {
      const rank = index + 1;
      if (rank === 1) return `<br><span style="color:#facc15; font-size:9px; font-weight:bold;">🥇 Gold Medal + Physical Cert</span>`;
      if (rank === 2) return `<br><span style="color:#e2e8f0; font-size:9px; font-weight:bold;">🥈 Silver Medal + Physical Cert</span>`;
      if (rank === 3) return `<br><span style="color:#cd7f32; font-size:9px; font-weight:bold;">🥉 Bronze Medal + Physical Cert</span>`;
      if (rank >= 4 && rank <= 6) return `<br><span style="color:#38bdf8; font-size:9px; font-weight:bold;">📜 Physical Certificate</span>`;
      return `<br><span style="color:#94a3b8; font-size:9px; font-weight:bold;">📱 Digital Certificate</span>`;
    };

    const card = document.createElement("div");
    card.style.cssText =
      "background: rgba(2, 6, 23, 0.9); border: 1px solid #334155; border-radius: 10px; padding: 15px;";

    card.innerHTML = `
      <div style="border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <h4 style="margin: 0; color: #38bdf8; font-size: 15px;">🏫 ${schoolName}</h4>
        <span style="background: #1e293b; color: #facc15; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${students.length} Total</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <div style="color: #10b981; font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            Classes ${minClass} to ${midClass}
          </div>
          <table style="width: 100%; font-size: 11px; text-align: left; border-collapse: collapse;">
            <tbody>
              ${group1.length === 0
                ? `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:8px;">No records</td></tr>`
                : group1
                    .map(
                      (s, idx) => `
                  <tr style="border-bottom: 1px solid #0f172a;">
                    <td style="padding:4px 3px; color:#facc15; font-weight:bold; vertical-align:top;">#${idx + 1}</td>
                    <td style="padding:4px 3px; color:#fff; vertical-align:top;">${s.studentName}${getSubjectBadge(s)} <span style="color:#94a3b8;">(${s.studentClass})</span>${getRewardBadge(idx)}</td>
                    <td style="padding:4px 3px; text-align:right; color:#38bdf8; font-weight:bold; vertical-align:top;">${s.score || 0}</td>
                  </tr>
                `
                    )
                    .join("")}
            </tbody>
          </table>
        </div>
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <div style="color: #38bdf8; font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            Classes ${midClass + 1} to ${maxClass}
          </div>
          <table style="width: 100%; font-size: 11px; text-align: left; border-collapse: collapse;">
            <tbody>
              ${group2.length === 0
                ? `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:8px;">No records</td></tr>`
                : group2
                    .map(
                      (s, idx) => `
                  <tr style="border-bottom: 1px solid #0f172a;">
                    <td style="padding:4px 3px; color:#facc15; font-weight:bold; vertical-align:top;">#${idx + 1}</td>
                    <td style="padding:4px 3px; color:#fff; vertical-align:top;">${s.studentName}${getSubjectBadge(s)} <span style="color:#94a3b8;">(${s.studentClass})</span>${getRewardBadge(idx)}</td>
                    <td style="padding:4px 3px; text-align:right; color:#38bdf8; font-weight:bold; vertical-align:top;">${s.score || 0}</td>
                  </tr>
                `
                    )
                    .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    gridContainer.appendChild(card);
  });
};

window.loadSchoolStudentLedger = function() {
  const selectedOrg = document.getElementById("ledger-school-select")?.value || "ALL";
  const tbody = document.getElementById("ledger-student-rows");
  if (!tbody) return;

  let students = allStudentsCache;
  if (selectedOrg !== "ALL") {
    students = allStudentsCache.filter(
      s => (s.orgCode || "").toUpperCase() === selectedOrg.toUpperCase()
    );
  }

  tbody.innerHTML = students.length
    ? ""
    : "<tr><td colspan='5' style='text-align:center; color:#64748b;'>No students registered under this selection.</td></tr>";

  students.forEach(s => {
    const isApproved =
      s.paymentStatus === "Approved" ||
      s.paymentStatus === "Cash Handover" ||
      s.paymentVerified === true;
    const isRejected = s.paymentStatus === "Rejected";
    const payMode = (s.paymentMode || "online").toUpperCase();
    const isOffline = payMode === "OFFLINE" || payMode === "CASH";

    let utrInfo = s.utrNumber
      ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>`
      : "<br><span style='color:#f87171; font-size:10px;'>No UTR Provided</span>";
    if (isRejected && s.rejectionReason) {
      utrInfo += `<br><span style="color:#f87171; font-size:11px; font-weight:bold;">Reason: ${s.rejectionReason}</span>`;
    }

    let statusColor = "#f59e0b";
    if (isApproved) statusColor = "#4ade80";
    if (isRejected) statusColor = "#f87171";

    const paymentBadge = `<span style="color:${statusColor}; font-weight:bold;">${s.paymentStatus || "Pending Verification"} (${payMode})</span>${utrInfo}`;

    let actionButtons = "";
    if (isOffline) {
      actionButtons += `<button type="button" onclick="openManualScoreModal('${s.id}', '${s.studentName}', '${s.studentClass}')" style="background:#f59e0b; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">✍️ Manual Score</button>`;
    } else {
      actionButtons += `<span style="color:#38bdf8; font-size:10px; font-weight:bold; margin-right:6px;">⚡ Auto Score</span>`;
    }
    actionButtons += `<button type="button" onclick="triggerReExam('${s.id}')" style="background:#7c3aed; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">🔄 Re-Exam</button>`;

    if (s.paymentMode === "online" && !isApproved && !isRejected) {
      actionButtons += `<button type="button" onclick="approveOnlinePayment('${s.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">✔️ Approve</button>`;
      actionButtons += `<button type="button" onclick="rejectOnlinePayment('${s.id}')" style="background:#dc2626; color:#fff; border:none; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">❌ Reject</button>`;
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><strong>${s.studentName}${getSubjectBadge(s)}</strong><br><span style="font-size:11px; color:#94a3b8;">Roll: ${s.rollNumber}</span></td>
        <td style="padding:10px;">Class ${s.studentClass}</td>
        <td style="padding:10px;">${paymentBadge}</td>
        <td style="padding:10px;"><strong style="color:#4ade80;">${s.score || 0}/${s.totalMarks || 30}</strong> <span style="color:#38bdf8; font-size:11px;">(${s.percentage || 0}%)</span></td>
        <td style="padding:10px;">${actionButtons}</td>
      </tr>
    `;
  });
};

// 🛑 MANUAL SCORE ENTRY MODAL FUNCTIONS
window.openManualScoreModal = function(studentId, name, studentClass) {
  document.getElementById("modal-student-id").value = studentId;
  document.getElementById("modal-student-info").textContent = `Student: ${name} (Class ${studentClass})`;
  document.getElementById("modal-score").value = "";
  document.getElementById("manual-score-modal").classList.remove("hidden");
};

window.closeManualScoreModal = () =>
  document.getElementById("manual-score-modal").classList.add("hidden");

window.saveManualScore = function() {
  const studentId = document.getElementById("modal-student-id").value;
  const score = parseFloat(document.getElementById("modal-score").value);
  const total = parseFloat(document.getElementById("modal-total").value) || 30;

  if (isNaN(score)) {
    alert("⚠️ Please enter a valid score.");
    return;
  }

  fetch(`${SERVER_URL}/api/admin/manual_score_entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, score: score, totalMarks: total })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("✅ Offline student score saved successfully via Central Panel!");
      closeManualScoreModal();
      fetchAllCentralData();
    } else {
      alert("❌ Error: " + data.message);
    }
  });
};

window.approveOnlinePayment = function(studentId) {
  if (!confirm("Are you sure you want to approve this online payment UTR?")) return;

  fetch(`${SERVER_URL}/api/admin/approve_payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("✅ Online payment approved successfully!");
      fetchAllCentralData();
    }
  });
};

window.rejectOnlinePayment = function(studentId) {
  const reason = prompt(
    "Enter reason for rejecting this UTR (e.g., Fake UTR / Payment not received):",
    "Fake or Invalid UTR Number"
  );
  if (!reason) return;

  fetch(`${SERVER_URL}/api/admin/reject_payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, reason: reason })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("❌ UTR rejected successfully!");
      fetchAllCentralData();
    }
  });
};

window.triggerReExam = function(studentId) {
  if (!confirm("Reset this student's exam status to allow Re-Exam?")) return;
  fetch(`${SERVER_URL}/api/admin/reexam`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId })
  })
  .then(res => res.json())
  .then(d => {
    if (d.status === "success") alert("✅ Re-Exam triggered successfully!");
  });
};

window.approveOrganizerSettlement = function(orgCode, reqId) {
  if (!confirm(`Confirm settlement approval for ${orgCode}? This will reset their Net Payable balance to ₹0.`)) return;
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, requestId: reqId })
  })
  .then(res => res.json())
  .then(d => {
    if (d.status === "success") {
      alert("✅ Settlement Verified & Account Reset to ₹0 Payable!");
      fetchAllCentralData();
    }
  });
};

window.logoutAdminSession = () => {
  sessionStorage.removeItem("nvmso_admin_logged");
  location.reload();
};
