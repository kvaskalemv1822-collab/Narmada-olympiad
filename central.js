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

// 1. MERGED ORGANIZER, EXAM MODE & ACCURATE COMMISSION SETTLEMENT MANAGER
function renderMergedOrganizersTable() {
  const tbody = document.getElementById("admin-organizers-rows");
  if(!tbody) return;
  tbody.innerHTML = allOrganizersCache.length ? "" : "<tr><td colspan='8' style='text-align:center; color:#64748b; padding:15px;'>No organizers registered yet.</td></tr>";

  allOrganizersCache.forEach(org => {
    const code = org.code || org.orgCode;
    const isSettled = org.manualSettled;

    const schoolStudents = allStudentsCache.filter(s => (s.orgCode || "").toUpperCase() === code.toUpperCase());
    const totalReg = schoolStudents.length || org.totalRegistrations || 0;

    // Separate Online vs Cash/Offline students
    const onlineRegs = schoolStudents.filter(s => (s.paymentMode || 'online').toLowerCase() === 'online').length;
    const cashRegs = schoolStudents.filter(s => (s.paymentMode || '').toLowerCase() === 'offline' || (s.paymentMode || '').toLowerCase() === 'cash').length;

    const examMode = (org.examMode || 'online').toLowerCase();
    const feePerStudent = examMode === 'offline' ? 120 : 100;

    // Gross Totals
    const onlineGross = onlineRegs * feePerStudent; // Direct with Portal
    const cashGross = cashRegs * feePerStudent;     // Collected by Organizer in Cash
    const grossTotal = totalReg * feePerStudent;

    // Direct Commission Rules:
    // If Offline Mode -> Fixed ₹15 per student.
    // If Online Mode -> 15% of gross total.
    const directComm = examMode === 'offline' ? (totalReg * 15) : (grossTotal * 0.15);

    // Referral Commission (5%) - Portal pays this separately, cannot be deducted from cash
    const refComm = grossTotal * 0.05;

    // Net Cash Settlement: Cash collected by organizer minus their direct commission
    // Organizer keeps direct commission from cash, remaining cash is paid to NVMSO portal via UTR.
    const netCashToPortal = cashGross - directComm;

    const sett = pendingSettlementsCache.find(s => s.orgCode === code);
    const payout = pendingPayoutsCache.find(p => p.orgCode === code);

    let settCell = isSettled ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled</span>" : "<span style='color:#f87171;'>Pending UTR</span>";
    if (sett) {
      settCell = `<code style="color:#facc15;">UTR: ${sett.utrNumber}<br>(₹${sett.amount})</code>`;
    }

    let actionCell = isSettled ? "<span style='color:#38bdf8; font-weight:bold;'>Completed</span>" : (sett ? `<button onclick="approveOrganizerSettlement('${code}', '${sett.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Verify UTR</button>` : "Awaiting");

    if (payout || refComm > 0) {
      actionCell += `<br><button onclick="processPortalPayout('${code}', ${refComm})" style="margin-top:4px; background:#f59e0b; color:#fff; border:none; padding:4px 6px; font-size:9px; border-radius:4px; font-weight:bold; cursor:pointer;">Pay Ref (₹${refComm.toFixed(0)})</button>`;
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;">
          <code style="color:#38bdf8; font-weight:bold; font-size:13px;">${code}</code><br>
          <span style="font-size:12px; color:#cbd5e1; font-weight:600;">${org.schoolName || 'School'}</span><br>
          <span style="background:#1e293b; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:bold; color:${examMode=='offline'?'#fbbf24':'#38bdf8'}">${examMode.toUpperCase()}</span>
        </td>
        <td style="padding:10px;">
          <strong>${org.name || org.coordinatorName || 'N/A'}</strong><br>
          <span style="font-size:11px; color:#94a3b8;">${org.contact || ''}</span>
        </td>
        <td style="padding:10px; color:#4ade80; font-weight:bold; text-align:center;">
          ${totalReg}<br><span style="font-size:10px; color:#94a3b8;">(${onlineRegs} On / ${cashRegs} Cash)</span>
        </td>
        <td style="padding:10px; color:#facc15; font-weight:bold;">₹${directComm.toFixed(0)}</td>
        <td style="padding:10px; color:#c084fc; font-weight:bold;">₹${refComm.toFixed(0)} <span style="font-size:9px; color:#94a3b8;">(Portal Pay)</span></td>
        <td style="padding:10px;">
          <strong style="color:#38bdf8;">₹${netCashToPortal > 0 ? netCashToPortal.toFixed(0) : 0}</strong><br>
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

  if(rankSelect) rankSelect.innerHTML = optionsHtml;
  if(ledgerSelect) ledgerSelect.innerHTML = optionsHtml;
}

// 🏆 SCHOOL-WISE DUAL-COLUMN SPLIT RANKINGS (Class Range Split into 2 Columns)
window.loadSchoolRankings = function() {
  const selectedOrg = document.getElementById("ranking-school-select").value;
  const gridContainer = document.getElementById("school-rankings-grid");
  if(!gridContainer) return;

  let studentsToRank = allStudentsCache;
  if (selectedOrg !== "ALL") {
    studentsToRank = allStudentsCache.filter(s => s.orgCode === selectedOrg);
  }

  let schoolMap = {};
  studentsToRank.forEach(s => {
    let code = (s.orgCode || "UNKNOWN").toUpperCase();
    if (!schoolMap[code]) schoolMap[code] = [];
    schoolMap[code].push(s);
  });

  gridContainer.innerHTML = Object.keys(schoolMap).length ? "" : "<div style='grid-column: 1 / -1; text-align: center; color: #64748b; padding: 20px;'>No ranked students found for this selection.</div>";

  Object.keys(schoolMap).forEach(code => {
    let students = schoolMap[code];
    let orgInfo = allOrganizersCache.find(o => (o.code || o.orgCode || "").toUpperCase() === code) || {};
    let schoolName = orgInfo.schoolName || `School Code: ${code}`;

    students.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

    let classes = students.map(s => parseInt(s.studentClass, 10)).filter(c => !isNaN(c));
    let minClass = classes.length > 0 ? Math.min(...classes) : 3;
    let maxClass = classes.length > 0 ? Math.max(...classes) : 12;
    let midClass = Math.floor((minClass + maxClass) / 2);

    let group1 = students.filter(s => { let c = parseInt(s.studentClass, 10); return c >= minClass && c <= midClass; });
    let group2 = students.filter(s => { let c = parseInt(s.studentClass, 10); return c > midClass && c <= maxClass; });

    let card = document.createElement("div");
    card.style.cssText = "background: rgba(2, 6, 23, 0.9); border: 1px solid #334155; border-radius: 10px; padding: 15px;";

    card.innerHTML = `
      <div style="border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <h4 style="margin: 0; color: #38bdf8; font-size: 15px;">🏫 ${schoolName}</h4>
        <span style="background: #1e293b; color: #facc15; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${students.length} Total</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        
        <!-- COLUMN 1: LOWER CLASSES RANGE -->
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <div style="color: #10b981; font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            Classes ${minClass} to ${midClass}
          </div>
          <table style="width: 100%; font-size: 11px; text-align: left; border-collapse: collapse;">
            <tbody>
              ${group1.length === 0 ? `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:8px;">No records</td></tr>` : 
                group1.slice(0, 6).map((s, idx) => `
                  <tr style="border-bottom: 1px solid #0f172a;">
                    <td style="padding:3px; color:#facc15; font-weight:bold;">#${idx+1}</td>
                    <td style="padding:3px; color:#fff;">${s.studentName} <span style="color:#94a3b8;">(${s.studentClass})</span></td>
                    <td style="padding:3px; text-align:right; color:#38bdf8; font-weight:bold;">${s.score || 0}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>

        <!-- COLUMN 2: HIGHER CLASSES RANGE -->
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <div style="color: #38bdf8; font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            Classes ${midClass + 1} to ${maxClass}
          </div>
          <table style="width: 100%; font-size: 11px; text-align: left; border-collapse: collapse;">
            <tbody>
              ${group2.length === 0 ? `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:8px;">No records</td></tr>` : 
                group2.slice(0, 6).map((s, idx) => `
                  <tr style="border-bottom: 1px solid #0f172a;">
                    <td style="padding:3px; color:#facc15; font-weight:bold;">#${idx+1}</td>
                    <td style="padding:3px; color:#fff;">${s.studentName} <span style="color:#94a3b8;">(${s.studentClass})</span></td>
                    <td style="padding:3px; text-align:right; color:#38bdf8; font-weight:bold;">${s.score || 0}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `;
    gridContainer.appendChild(card);
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

window.processPortalPayout = function(orgCode, amount) {
  if(!confirm(`Process separate portal payout of ₹${amount.toFixed(0)} for referral commission to ${orgCode}?`)) return;
  fetch(`${SERVER_URL}/api/admin/complete_payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, amount: amount })
  }).then(res => res.json()).then(d => {
    if(d.status === "success") {
      alert("🎉 Referral commission payout processed successfully by portal!");
      fetchAllCentralData();
    } else {
      alert("✅ Payout action registered.");
    }
  });
};

window.logoutAdminSession = () => { location.reload(); };
