const SERVER_URL = "https://nvmso-backend.onrender.com";
let allStudentsCache = [];
let allOrganizersCache = [];
let pendingSettlementsCache = [];
let pendingPayoutsCache = [];
let activeTicketId = null;
let activeTicketSender = null;
let autoRefreshTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("nvmso_admin_logged") === "true") {
    document.getElementById("admin-login-screen")?.classList.add("hidden");
    document.getElementById("admin-main-container")?.classList.remove("hidden");
    initializeCentralPanelData();
  }
});

window.verifyAdminPassword = async () => {
  const passInput = document.getElementById("admin-pass-input").value.trim();
  const alertBox = document.getElementById("login-security-alert");
  if (!passInput) return;

  fetch(`${SERVER_URL}/api/admin/authenticate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: passInput })
  })
  .then(res => {
    if (res.status === 200) {
      sessionStorage.setItem("nvmso_admin_logged", "true");
      if (alertBox) alertBox.style.display = "none";
      triggerGrandWelcome(); 
      initializeCentralPanelData(); 
    } else { throw new Error(); }
  })
  .catch(() => {
    if (alertBox) {
      alertBox.textContent = "🚨 Security Alert: Master Password Verification Failed!";
      alertBox.style.display = "block";
    }
  });
};

function triggerGrandWelcome() {
  document.getElementById("admin-login-screen")?.classList.add("hidden");
  const welcomeScreen = document.getElementById("grand-welcome-screen");
  const mainContainer = document.getElementById("admin-main-container");
  welcomeScreen?.classList.remove("hidden");

  let countdown = 3, progressWidth = 0;
  const progressEl = document.getElementById("welcome-progress");
  const countdownEl = document.getElementById("welcome-countdown");

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
        mainContainer?.classList.remove("hidden");
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
        if (document.getElementById("cfg-reg-active")) document.getElementById("cfg-reg-active").checked = !!config.isRegistrationOpen;
        if (document.getElementById("cfg-exam-active")) document.getElementById("cfg-exam-active").checked = !!config.isExamActive;
        if (document.getElementById("cfg-result-allowed")) document.getElementById("cfg-result-allowed").checked = !!config.isResultDeclared;
        if (document.getElementById("admin-broadcast-input")) document.getElementById("admin-broadcast-input").value = config.broadcastNotice || "";

        setupSmartSwitchesExclusiveRule();
        fetchAllCentralData();
        fetchSupportTickets();

        // REAL-TIME AUTO-SYNC TIMER (4 seconds interval for master panel coordination)
        if (!autoRefreshTimer) {
          autoRefreshTimer = setInterval(() => {
            fetchAllCentralData();
            fetchSupportTickets();
          }, 4000);
        }
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
    isRegistrationOpen: document.getElementById("cfg-reg-active").checked,
    isExamActive: document.getElementById("cfg-exam-active").checked,
    isResultDeclared: document.getElementById("cfg-result-allowed").checked,
    broadcastNotice: document.getElementById("admin-broadcast-input").value.trim()
  };
  fetch(`${SERVER_URL}/api/admin/update_config`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }).then(res => res.json()).then(data => {
    if (data.status === "success") alert("✅ Command Dispatched: Portal phases and parameters updated successfully!");
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

function renderMergedOrganizersTable() {
  const tbody = document.getElementById("admin-organizers-rows");
  if(!tbody) return;
  tbody.innerHTML = allOrganizersCache.length ? "" : "<tr><td colspan='8' style='text-align:center; color:#64748b; padding:15px;'>No organizers registered yet.</td></tr>";

  allOrganizersCache.forEach(org => {
    const code = org.code || org.orgCode;
    const isSettled = org.manualSettled; // SETTLED FIELD FOR ZERO-BALANCE LOGIC
    const verifiedStudents = allStudentsCache.filter(s => (s.orgCode || "").toUpperCase() === code.toUpperCase() && (s.paymentStatus === 'Approved' || s.paymentVerified === true));
    const allSchoolStudents = allStudentsCache.filter(s => (s.orgCode || "").toUpperCase() === code.toUpperCase());
    const totalReg = verifiedStudents.length;
    const pendingReviewCount = allSchoolStudents.filter(s => s.paymentStatus && s.paymentStatus.includes("Pending")).length;

    const onlineRegs = verifiedStudents.filter(s => (s.paymentMode || 'online').toLowerCase() === 'online').length;
    const cashRegs = verifiedStudents.filter(s => (s.paymentMode || '').toLowerCase() === 'offline' || (s.paymentMode || '').toLowerCase() === 'cash').length;
    const examMode = (org.examMode || 'online').toLowerCase();
    const feePerStudent = examMode === 'offline' ? 120 : 100;

    const cashGross = cashRegs * feePerStudent;
    const grossTotal = totalReg * feePerStudent;
    const directComm = examMode === 'offline' ? (totalReg * 15) : (grossTotal * 0.15);
    const hasReferral = org.refCode && org.refCode.trim().length > 0 && org.refCode.toUpperCase() !== "NONE";
    const refComm = hasReferral ? (grossTotal * 0.05) : 0; 
    
    // ZERO-BALANCE SETTLEMENT: IF SETTLED, NET CASH BECOMES 0
    const netCashToPortal = isSettled ? 0 : Math.max(0, cashGross - directComm);

    const sett = pendingSettlementsCache.find(s => s.orgCode === code);
    let settCell = isSettled ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled (₹0 Due)</span>" : "<span style='color:#f87171;'>Pending Settlement</span>";
    if (!isSettled && sett) settCell = `<code style="color:#facc15;">UTR: ${sett.utrNumber}<br>(₹${sett.amount})</code>`;

    let actionCell = isSettled ? "<span style='color:#38bdf8; font-weight:bold;'>Completed</span>" : (sett ? `<button onclick="approveOrganizerSettlement('${code}', '${sett.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Verify & Zero Out</button>` : "Awaiting");
    let pendingBadge = pendingReviewCount > 0 ? `<br><span style="font-size:9px; color:#f59e0b; font-weight:bold;">(${pendingReviewCount} Pending)</span>` : "";

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><code style="color:#38bdf8; font-weight:bold;">${code}</code><br><span style="font-size:12px; color:#cbd5e1;">${org.schoolName || 'School'}</span></td>
        <td style="padding:10px;"><strong>${org.name || 'N/A'}</strong></td>
        <td style="padding:10px; color:#4ade80; font-weight:bold; text-align:center;">${totalReg} ${pendingBadge}</td>
        <td style="padding:10px; color:#facc15;">₹${isSettled ? 0 : directComm.toFixed(0)}</td>
        <td style="padding:10px; color:#c084fc;">₹${isSettled ? 0 : refComm.toFixed(0)}</td>
        <td style="padding:10px;"><strong style="color:${netCashToPortal > 0 ? '#f87171' : '#4ade80'};">₹${netCashToPortal.toFixed(0)}</strong></td>
        <td style="padding:10px;">${settCell}</td>
        <td style="padding:10px;">${actionCell}</td>
      </tr>
    `;
  });
}

window.approveOrganizerSettlement = (orgCode, reqId) => {
  if (!confirm(`Approve settlement and reset balance to ₹0 for ${orgCode}?`)) return;
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgCode: orgCode, requestId: reqId }) })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("✅ Settlement verified successfully! Balance reset to ₹0.");
      fetchAllCentralData();
    }
  });
};

function fetchSupportTickets() {
  fetch(`${SERVER_URL}/api/admin/queries`)
    .then(res => res.json())
    .then(data => {
      const listContainer = document.getElementById("support-tickets-list");
      if (!listContainer) return;
      if (data.status === "success" && data.queries && data.queries.length > 0) {
        listContainer.innerHTML = "";
        data.queries.forEach(q => {
          listContainer.innerHTML += `<div onclick="openChatSession('${q.ticketId}', '${q.senderName || q.orgCode}')" style="padding: 8px; margin-bottom: 6px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; cursor: pointer;"><p style="font-weight: bold; color: #38bdf8; font-size: 11px;">${q.senderName || q.orgCode}</p></div>`;
        });
      }
    }).catch(() => {});
}

window.openChatSession = function(ticketId, senderName) {
  activeTicketId = ticketId; activeTicketSender = senderName;
  const chatBox = document.getElementById("active-chat-box");
  document.getElementById("admin-chat-input").disabled = false;
  document.getElementById("btn-send-reply").disabled = false;
  
  fetch(`${SERVER_URL}/api/admin/query_messages?ticketId=${ticketId}`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success" && data.messages) {
        chatBox.innerHTML = "";
        data.messages.forEach(m => {
          let align = m.isAdmin ? "right" : "left", bg = m.isAdmin ? "#0369a1" : "#1e293b";
          chatBox.innerHTML += `<div style="text-align: ${align}; margin-bottom: 8px;"><span style="display: inline-block; background: ${bg}; padding: 6px 10px; border-radius: 6px; max-width: 80%; color: #fff; font-size: 11px;">${m.text}</span></div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    });
};

window.sendAdminReply = function() {
  const chatInput = document.getElementById("admin-chat-input");
  const msgText = chatInput ? chatInput.value.trim() : "";
  if (!msgText || !activeTicketId) return;
  fetch(`${SERVER_URL}/api/admin/reply_query`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketId: activeTicketId, message: msgText })
  }).then(() => { chatInput.value = ""; openChatSession(activeTicketId, activeTicketSender); });
};

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

window.loadSchoolRankings = function() {
  const selectedOrg = document.getElementById("ranking-school-select").value;
  const gridContainer = document.getElementById("school-rankings-grid");
  if(!gridContainer) return;

  let studentsToRank = selectedOrg === "ALL" ? allStudentsCache : allStudentsCache.filter(s => s.orgCode === selectedOrg);
  let schoolMap = {};
  studentsToRank.forEach(s => {
    if (!s.examCompleted) return;
    let code = (s.orgCode || "UNKNOWN").toUpperCase();
    if (!schoolMap[code]) schoolMap[code] = [];
    schoolMap[code].push(s);
  });

  gridContainer.innerHTML = Object.keys(schoolMap).length ? "" : "<div style='grid-column: 1 / -1; text-align: center; color: #64748b; padding: 20px;'>No ranked records found.</div>";

  Object.keys(schoolMap).forEach(code => {
    let students = schoolMap[code];
    let orgInfo = allOrganizersCache.find(o => (o.code || o.orgCode || "").toUpperCase() === code) || {};
    let schoolName = orgInfo.schoolName || `School: ${code}`;
    students.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

    let card = document.createElement("div");
    card.style.cssText = "background: rgba(2, 6, 23, 0.9); border: 1px solid #334155; border-radius: 10px; padding: 15px;";
    card.innerHTML = `<h4 style="color: #38bdf8; margin-bottom: 10px;">🏫 ${schoolName}</h4>` + students.map((s, idx) => `<div style="font-size:11px; margin-bottom:4px;">#${idx+1} ${s.studentName} - Score: ${s.score || 0}</div>`).join('');
    gridContainer.appendChild(card);
  });
};

window.loadSchoolStudentLedger = function() {
  const selectedOrg = document.getElementById("ledger-school-select").value;
  const tbody = document.getElementById("ledger-student-rows");
  if(!tbody) return;

  let students = selectedOrg === "ALL" ? allStudentsCache : allStudentsCache.filter(s => s.orgCode === selectedOrg);
  tbody.innerHTML = students.length ? "" : "<tr><td colspan='5' style='text-align:center; color:#64748b;'>No students found.</td></tr>";

  students.forEach(s => {
    const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
    let actionButtons = `<button onclick="openManualScoreModal('${s.studentId || s.id}', '${s.studentName}', '${s.studentClass}')" style="background:#f59e0b; color:#fff; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">✍️ Manual Score</button>`;
    
    tbody.innerHTML += `<tr style="border-bottom:1px solid #1e293b;"><td style="padding:10px;"><strong>${s.studentName}</strong></td><td style="padding:10px;">Class ${s.studentClass}</td><td style="padding:10px;"><span style="color:${isApproved ? '#4ade80' : '#f59e0b'};">${s.paymentStatus || 'Pending'}</span></td><td style="padding:10px;"><strong style="color:#4ade80;">${s.score || 0}</strong></td><td style="padding:10px;">${actionButtons}</td></tr>`;
  });
};

window.openManualScoreModal = function(studentId, name, studentClass) {
  document.getElementById("modal-student-id").value = studentId;
  document.getElementById("modal-student-info").textContent = `Student: ${name} (Class ${studentClass})`;
  document.getElementById("modal-score").value = "";
  document.getElementById("manual-score-modal").classList.remove("hidden");
};

window.closeManualScoreModal = () => document.getElementById("manual-score-modal").classList.add("hidden");

window.saveManualScore = function() {
  const studentId = document.getElementById("modal-student-id").value;
  const score = parseFloat(document.getElementById("modal-score").value);
  const total = parseFloat(document.getElementById("modal-total").value) || 100;
  if (isNaN(score)) return;

  fetch(`${SERVER_URL}/api/admin/manual_score_entry`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, score: score, totalMarks: total })
  }).then(() => { closeManualScoreModal(); fetchAllCentralData(); });
};

window.logoutAdminSession = () => { sessionStorage.removeItem("nvmso_admin_logged"); location.reload(); };
