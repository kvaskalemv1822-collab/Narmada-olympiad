const SERVER_URL = "https://nvmso-backend.onrender.com";
let allStudentsCache = [];
let allOrganizersCache = [];
let pendingSettlementsCache = [];
let pendingPayoutsCache = [];

window.verifyAdminPassword = async () => {
  const passInput = document.getElementById("admin-pass-input").value.trim();
  const alertBox = document.getElementById("login-security-alert");

  if (!passInput) { alert("Please input master authorization key."); return; }

  fetch(`${SERVER_URL}/api/admin/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: passInput })
  })
  .then(res => {
    if (res.status === 200) {
      if (alertBox) alertBox.style.display = "none";
      triggerGrandWelcome(); 
      initializeCentralPanelData(); 
    } else {
      throw new Error();
    }
  })
  .catch(() => {
    if (alertBox) {
      alertBox.textContent = "🚨 Security Alert: Master Password Verification Failed!";
      alertBox.style.display = "block";
    }
  });
};

function triggerGrandWelcome() {
  const loginScreen = document.getElementById("admin-login-screen");
  if (loginScreen) loginScreen.classList.add("hidden");

  const welcomeScreen = document.getElementById("grand-welcome-screen");
  const mainContainer = document.getElementById("admin-main-container");
  if (welcomeScreen) welcomeScreen.classList.remove("hidden");

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
        const config = data.config;
        if (document.getElementById("cfg-online-fee")) document.getElementById("cfg-online-fee").value = config.onlineFee || 100;
        if (document.getElementById("cfg-offline-fee")) document.getElementById("cfg-offline-fee").value = config.offlineFee || 120;
        if (document.getElementById("cfg-duration")) document.getElementById("cfg-duration").value = config.examDuration || 30;
        
        if (document.getElementById("cfg-reg-active")) document.getElementById("cfg-reg-active").checked = !!config.isRegistrationOpen;
        if (document.getElementById("cfg-exam-active")) document.getElementById("cfg-exam-active").checked = !!config.isExamActive;
        if (document.getElementById("cfg-result-allowed")) document.getElementById("cfg-result-allowed").checked = !!config.isResultDeclared;
        if (document.getElementById("admin-broadcast-input")) document.getElementById("admin-broadcast-input").value = config.broadcastNotice || "";

        setupSmartSwitchesExclusiveRule();
        fetchAllCentralData();
      }
    });
}

function setupSmartSwitchesExclusiveRule() {
  const regChk = document.getElementById("cfg-reg-active");
  const examChk = document.getElementById("cfg-exam-active");
  const resultChk = document.getElementById("cfg-result-allowed");

  if(regChk && examChk && resultChk) {
    regChk.addEventListener("change", () => { if(regChk.checked) { examChk.checked = false; resultChk.checked = false; } });
    examChk.addEventListener("change", () => { if(examChk.checked) { regChk.checked = false; resultChk.checked = false; } });
    resultChk.addEventListener("change", () => { if(resultChk.checked) { regChk.checked = false; examChk.checked = false; } });
  }
}

window.saveGlobalConfig = async () => {
  const payload = {
    onlineFee: Number(document.getElementById("cfg-online-fee").value),
    offlineFee: Number(document.getElementById("cfg-offline-fee").value),
    examDuration: Number(document.getElementById("cfg-duration").value),
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
    }
  });
};

function fetchAllCentralData() {
  Promise.all([
    fetch(`${SERVER_URL}/api/admin/all_data`, { method: "POST" }).then(res => res.json()),
    fetch(`${SERVER_URL}/api/admin/financial_requests`).then(res => res.json())
  ]).then(([data1, data2]) => {
    if (data1.status === "success") {
      allOrganizersCache = data1.organizers || [];
      allStudentsCache = data1.students || [];
    }
    if (data2.status === "success") {
      pendingSettlementsCache = data2.settlements || [];
      pendingPayoutsCache = data2.payouts || [];
    }

    renderMergedOrganizersTable();
    populateSchoolDropdowns();
    loadSchoolRankings();
    loadSchoolStudentLedger();
  });
}

// 1. MERGED ORGANIZER, EXAM MODE & SETTLEMENT MANAGER
function renderMergedOrganizersTable() {
  const tbody = document.getElementById("admin-organizers-rows");
  if(!tbody) return;
  tbody.innerHTML = allOrganizersCache.length ? "" : "<tr><td colspan='6' style='text-align:center; color:#64748b;'>No organizers registered yet.</td></tr>";

  allOrganizersCache.forEach(org => {
    const code = org.code || org.orgCode;
    const isSettled = org.manualSettled;

    // Find pending settlement for this org
    const sett = pendingSettlementsCache.find(s => s.orgCode === code);
    const payout = pendingPayoutsCache.find(p => p.orgCode === code);

    let settCell = isSettled ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled (Paid)</span>" : "<span style='color:#f87171;'>Pending Settlement</span>";
    if (sett) {
      settCell = `<code style="color:#facc15;">UTR: ${sett.utrNumber} (₹${sett.amount})</code>`;
    }

    let actionCell = isSettled ? "<span style='color:#38bdf8;'>Payout Unlocked</span>" : (sett ? `<button onclick="approveOrganizerSettlement('${code}', '${sett.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 10px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">Verify Settlement</button>` : "N/A");

    if (payout) {
      actionCell += `<br><button onclick="markPayoutCompleted('${payout.id}')" style="margin-top:4px; background:#f59e0b; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Pay Payout (₹${payout.amount})</button>`;
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><code style="color:#38bdf8; font-weight:bold;">${code}</code><br><span style="font-size:12px; color:#cbd5e1;">${org.schoolName}</span></td>
        <td style="padding:10px;">${org.name}<br><span style="font-size:11px; color:#94a3b8;">${org.contact}</span></td>
        <td style="padding:10px;"><span style="background:#1e293b; padding:2px 6px; border-radius:4px; font-weight:bold; color:${org.examMode=='offline'?'#fbbf24':'#38bdf8'}">${(org.examMode || 'online').toUpperCase()}</span></td>
        <td style="padding:10px; color:#4ade80; font-weight:bold;">${org.totalRegistrations || 0}</td>
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

  if(rankSelect) rankSelect.innerHTML = optionsHtml;
  if(ledgerSelect) ledgerSelect.innerHTML = optionsHtml;
}

// 2. SCHOOL-WISE RANKING (TOP 6 IN 2 COLUMNS)
window.loadSchoolRankings = function() {
  const selectedOrg = document.getElementById("ranking-school-select").value;
  const gridContainer = document.getElementById("school-rankings-grid");
  if(!gridContainer) return;

  let studentsToRank = allStudentsCache;
  if (selectedOrg !== "ALL") {
    studentsToRank = allStudentsCache.filter(s => s.orgCode === selectedOrg);
  }

  // Sort descending by score
  studentsToRank.sort((a, b) => (b.score || 0) - (a.score || 0));
  const top6 = studentsToRank.slice(0, 6);

  gridContainer.innerHTML = top6.length ? "" : "<p style='color:#64748b;'>No ranked students found for this selection.</p>";

  top6.forEach((s, idx) => {
    const rank = idx + 1;
    let tierText = "Digital Certificate";
    let tierColor = "#38bdf8";

    if (rank === 1) { tierText = "🥇 1st Rank - Gold Medal + Physical Cert"; tierColor = "#facc15"; }
    else if (rank === 2) { tierText = "🥈 2nd Rank - Silver Medal + Physical Cert"; tierColor = "#e2e8f0"; }
    else if (rank === 3) { tierText = "🥉 3rd Rank - Bronze Medal + Physical Cert"; tierColor = "#fb923c"; }
    else if (rank >= 4 && rank <= 6) { tierText = "📜 Top 6 - Physical Certificate"; tierColor = "#4ade80"; }

    gridContainer.innerHTML += `
      <div style="background:#020617; padding:15px; border-radius:8px; border:1px solid #334155;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="background:#1e293b; color:${tierColor}; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:12px;">Rank #${rank}</span>
          <span style="color:#4ade80; font-weight:bold;">Score: ${s.score || 0} (${(s.score || 0)}%)</span>
        </div>
        <p style="font-weight:bold; font-size:15px; color:#fff; margin-bottom:4px;">${s.studentName}</p>
        <p style="font-size:12px; color:#94a3b8; margin-bottom:2px;">Class: ${s.studentClass} | Roll: <code>${s.rollNumber}</code></p>
        <p style="font-size:12px; color:${tierColor}; font-weight:bold; margin-top:6px;">${tierText}</p>
      </div>
    `;
  });
};

// 3. SCHOOL-WISE STUDENT DETAILS LEDGER
window.loadSchoolStudentLedger = function() {
  const selectedOrg = document.getElementById("ledger-school-select").value;
  const tbody = document.getElementById("ledger-student-rows");
  if(!tbody) return;

  let students = allStudentsCache;
  if (selectedOrg !== "ALL") {
    students = allStudentsCache.filter(s => s.orgCode === selectedOrg);
  }

  tbody.innerHTML = students.length ? "" : "<tr><td colspan='5' style='text-align:center; color:#64748b;'>No students registered under this selection.</td></tr>";

  students.forEach(s => {
    const isApproved = s.paymentStatus === "Approved";
    const payMode = (s.paymentMode || 'online').toUpperCase();
    const utrInfo = s.utrNumber ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>` : "";
    const paymentBadge = `<span style="color:${isApproved?'#4ade80':'#f87171'}; font-weight:bold;">${s.paymentStatus} (${payMode})</span>${utrInfo}`;

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><strong>${s.studentName}</strong><br><span style="font-size:11px; color:#94a3b8;">Roll: ${s.rollNumber}</span></td>
        <td style="padding:10px;">Class ${s.studentClass}</td>
        <td style="padding:10px;">${paymentBadge}</td>
        <td style="padding:10px;"><strong style="color:#4ade80;">${s.score || 0}</strong> <span style="color:#38bdf8; font-size:11px;">(${(s.score || 0)}%)</span></td>
        <td style="padding:10px;">
          <button onclick="triggerReExam('${s.id}')" style="background:#7c3aed; color:#fff; border:none; padding:4px 10px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">🔄 Re-Exam</button>
        </td>
      </tr>
    `;
  });
};

window.triggerReExam = function(studentId) {
  if(!confirm("Reset this student's exam status to allow Re-Exam?")) return;
  fetch(`${SERVER_URL}/api/admin/reexam`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId })
  }).then(res => res.json()).then(d => {
    if(d.status === "success") alert("✅ Re-Exam triggered successfully!");
  });
};

window.approveOrganizerSettlement = function(orgCode, reqId) {
  if(!confirm(`Confirm settlement approval for ${orgCode}?`)) return;
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, requestId: reqId })
  }).then(res => res.json()).then(d => {
    if(d.status === "success") {
      alert("✅ Settlement Verified!");
      fetchAllCentralData();
    }
  });
};

window.markPayoutCompleted = function(payoutId) {
  if(!confirm("Mark commission payout as completed?")) return;
  fetch(`${SERVER_URL}/api/admin/complete_payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payoutId: payoutId })
  }).then(res => res.json()).then(d => {
    if(d.status === "success") {
      alert("🎉 Payout marked as completed!");
      fetchAllCentralData();
    }
  });
};

window.logoutAdminSession = () => { location.reload(); };
