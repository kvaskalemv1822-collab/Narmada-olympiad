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
  if (!passInput) { alert("Please input master authorization key."); return; }

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

        if (!autoRefreshTimer) {
          autoRefreshTimer = setInterval(() => {
            fetchAllCentralData();
            fetchSupportTickets();
          }, 8000);
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
    const isSettled = org.manualSettled;
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
    const netCashToPortal = isSettled ? 0 : Math.max(0, cashGross - directComm);

    const sett = pendingSettlementsCache.find(s => s.orgCode === code);
    let settCell = isSettled ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled (₹0 Due)</span>" : "<span style='color:#f87171;'>Pending Settlement</span>";
    if (!isSettled && sett) settCell = `<code style="color:#facc15;">UTR: ${sett.utrNumber}<br>(₹${sett.amount})</code>`;

    let actionCell = isSettled ? "<span style='color:#38bdf8; font-weight:bold;'>Completed</span>" : (sett ? `<button onclick="approveOrganizerSettlement('${code}', '${sett.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Verify UTR</button>` : "Awaiting");
    let pendingBadge = pendingReviewCount > 0 ? `<br><span style="font-size:9px; color:#f59e0b; font-weight:bold;">(${pendingReviewCount} Pending)</span>` : "";

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><code style="color:#38bdf8; font-weight:bold;">${code}</code><br><span style="font-size:12px; color:#cbd5e1;">${org.schoolName || 'School'}</span><br><span style="background:#1e293b; padding:1px 6px; border-radius:4px; font-size:10px; color:${examMode=='offline'?'#fbbf24':'#38bdf8'}">${examMode.toUpperCase()}</span></td>
        <td style="padding:10px;"><strong>${org.name || 'N/A'}</strong><br><span style="font-size:11px; color:#94a3b8;">${org.contact || ''}</span></td>
        <td style="padding:10px; color:#4ade80; font-weight:bold; text-align:center;">${totalReg} ${pendingBadge}<br><span style="font-size:10px; color:#94a3b8;">(${onlineRegs} On / ${cashRegs} Cash)</span></td>
        <td style="padding:10px; color:#facc15;">₹${directComm.toFixed(0)}</td>
        <td style="padding:10px; color:#c084fc;">₹${refComm.toFixed(0)}</td>
        <td style="padding:10px;"><strong style="color:${netCashToPortal > 0 ? '#f87171' : '#4ade80'};">₹${netCashToPortal.toFixed(0)}</strong><br><span style="font-size:10px; color:#94a3b8;">Cash Held: ₹${cashGross}</span></td>
        <td style="padding:10px;">${settCell}</td>
        <td style="padding:10px;">${actionCell}</td>
      </tr>
    `;
  });
}

function fetchSupportTickets() {
  fetch(`${SERVER_URL}/api/admin/queries`)
    .then(res => res.json())
    .then(data => {
      const listContainer = document.getElementById("support-tickets-list");
      if (!listContainer) return;
      if (data.status === "success" && data.queries && data.queries.length > 0) {
        listContainer.innerHTML = "";
        data.queries.forEach(q => {
          listContainer.innerHTML += `
            <div onclick="openChatSession('${q.ticketId}', '${q.senderName || q.orgCode}')" style="padding: 8px; margin-bottom: 6px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; cursor: pointer;">
              <p style="font-weight: bold; color: #38bdf8; font-size: 11px;">${q.senderName || q.orgCode}</p>
              <p style="color: #cbd5e1; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q.lastMessage || 'New Query'}</p>
            </div>
          `;
        });
      } else { listContainer.innerHTML = `<p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 20px;">No pending support queries.</p>`; }
    }).catch(() => {});
}

window.openChatSession = function(ticketId, senderName) {
  activeTicketId = ticketId; activeTicketSender = senderName;
  const chatBox = document.getElementById("active-chat-box");
  document.getElementById("admin-chat-input").disabled = false;
  document.getElementById("btn-send-reply").disabled = false;
  chatBox.innerHTML = `<p style="color: #4ade80; font-size: 11px; text-align: center;">-- Connected with ${senderName} --</p>`;
  
  fetch(`${SERVER_URL}/api/admin/query_messages?ticketId=${ticketId}`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success" && data.messages) {
        chatBox.innerHTML = "";
        data.messages.forEach(m => {
          let align = m.isAdmin ? "right" : "left", bg = m.isAdmin ? "#0369a1" : "#1e293b";
          let imageHtml = m.imageUrl ? `<br><a href="${m.imageUrl}" target="_blank"><img src="${m.imageUrl}" style="max-width: 140px; border-radius: 4px; margin-top: 5px;" /></a>` : "";
          chatBox.innerHTML += `<div style="text-align: ${align}; margin-bottom: 8px;"><span style="display: inline-block; background: ${bg}; padding: 6px 10px; border-radius: 6px; max-width: 80%; text-align: left; color: #fff; font-size: 11px;">${m.text}${imageHtml}</span></div>`;
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
    let code = (s.orgCode || "UNKNOWN").toUpperCase();
    if (!schoolMap[code]) schoolMap[code] = [];
    schoolMap[code].push(s);
  });

  gridContainer.innerHTML = Object.keys(schoolMap).length ? "" : "<div style='grid-column: 1 / -1; text-align: center; color: #64748b; padding: 20px;'>No ranked students found.</div>";

  Object.keys(schoolMap).forEach(code => {
    let students = schoolMap[code];
    let orgInfo = allOrganizersCache.find(o => (o.code || o.orgCode || "").toUpperCase() === code) || {};
    let schoolName = orgInfo.schoolName || `School Code: ${code}`;
    students.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

    let classes = students.map(s => parseInt(s.studentClass, 10)).filter(c => !isNaN(c));
    let minClass = classes.length ? Math.min(...classes) : 3;
    let maxClass = classes.length ? Math.max(...classes) : 12;
    let midClass = Math.floor((minClass + maxClass) / 2);

    let group1 = students.filter(s => { let c = parseInt(s.studentClass, 10); return c >= minClass && c <= midClass; });
    let group2 = students.filter(s => { let c = parseInt(s.studentClass, 10); return c > midClass && c <= maxClass; });

    const getRewardBadge = (idx) => {
      if (idx === 0) return `<br><span style="color:#facc15; font-size:9px;">🥇 Gold Medal</span>`;
      if (idx === 1) return `<br><span style="color:#e2e8f0; font-size:9px;">🥈 Silver Medal</span>`;
      if (idx === 2) return `<br><span style="color:#cd7f32; font-size:9px;">🥉 Bronze Medal</span>`;
      return `<br><span style="color:#38bdf8; font-size:9px;">📜 Certificate</span>`;
    };

    let card = document.createElement("div");
    card.style.cssText = "background: rgba(2, 6, 23, 0.9); border: 1px solid #334155; border-radius: 10px; padding: 15px;";
    card.innerHTML = `
      <h4 style="color: #38bdf8; margin-bottom: 10px;">🏫 ${schoolName}</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px;"><div style="color: #10b981; font-size: 11px; margin-bottom: 6px;">Class ${minClass}-${midClass}</div>
          ${group1.map((s, idx) => `<div style="font-size:11px; margin-bottom:4px;">#${idx+1} ${s.studentName} (${s.score || 0})${getRewardBadge(idx)}</div>`).join('') || '<span style="color:#64748b; font-size:10px;">No records</span>'}
        </div>
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px;"><div style="color: #38bdf8; font-size: 11px; margin-bottom: 6px;">Class ${midClass+1}-${maxClass}</div>
          ${group2.map((s, idx) => `<div style="font-size:11px; margin-bottom:4px;">#${idx+1} ${s.studentName} (${s.score || 0})${getRewardBadge(idx)}</div>`).join('') || '<span style="color:#64748b; font-size:10px;">No records</span>'}
        </div>
      </div>`;
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
    const payMode = (s.paymentMode || 'online').toUpperCase();
    let utrInfo = s.utrNumber ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>` : "";

    let actionButtons = `<button onclick="openManualScoreModal('${s.id}', '${s.studentName}', '${s.studentClass}')" style="background:#f59e0b; color:#fff; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">✍️ Manual Score</button>`;
    actionButtons += `<button onclick="triggerReExam('${s.id}')" style="background:#7c3aed; color:#fff; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">🔄 Re-Exam</button>`;

    if (s.paymentMode === 'online' && !isApproved) {
      actionButtons += `<br><button onclick="approveOnlinePayment('${s.id}')" style="background:#10b981; color:#fff; padding:3px 6px; font-size:9px; margin-top:4px;">✔️ Approve UTR</button>`;
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><strong>${s.studentName}</strong><br><span style="font-size:11px; color:#94a3b8;">Roll: ${s.rollNumber}</span></td>
        <td style="padding:10px;">Class ${s.studentClass}<br><span style="font-size:10px; color:#38bdf8;">${payMode}</span></td>
        <td style="padding:10px;"><span style="color:${isApproved ? '#4ade80' : '#f59e0b'};">${s.paymentStatus || 'Pending'}</span>${utrInfo}</td>
        <td style="padding:10px;"><strong style="color:#4ade80;">${s.score || 0}</strong> <span style="font-size:11px; color:#38bdf8;">(${s.percentage || 0}%)</span> ${s.manualEntry ? '<span style="color:#f59e0b; font-size:9px;">(Manual)</span>' : ''}</td>
        <td style="padding:10px;">${actionButtons}</td>
      </tr>
    `;
  });
};

// MANUAL SCORE MODAL HANDLERS
window.openManualScoreModal = function(studentId, name, studentClass) {
  document.getElementById("modal-student-id").value = studentId;
  document.getElementById("modal-student-info").textContent = `Student: ${name} (Class ${studentClass})`;
  document.getElementById("modal-score").value = "";
  document.getElementById("manual-score-modal").classList.remove("hidden");
};

window.closeManualScoreModal = function() {
  document.getElementById("manual-score-modal").classList.add("hidden");
};

window.saveManualScore = function() {
  const studentId = document.getElementById("modal-student-id").value;
  const score = parseFloat(document.getElementById("modal-score").value);
  const total = parseFloat(document.getElementById("modal-total").value) || 100;
  if (isNaN(score)) { alert("Please enter a valid score."); return; }

  fetch(`${SERVER_URL}/api/admin/manual_score_entry`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, score: score, totalMarks: total })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("✅ Manual score saved successfully!");
      closeManualScoreModal();
      fetchAllCentralData();
    } else { alert("❌ Error: " + data.message); }
  });
};

window.approveOnlinePayment = (id) => {
  fetch(`${SERVER_URL}/api/admin/approve_payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: id }) })
  .then(() => fetchAllCentralData());
};

window.triggerReExam = (id) => {
  if(!confirm("Reset exam status?")) return;
  fetch(`${SERVER_URL}/api/admin/reexam`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: id }) })
  .then(() => alert("✅ Re-Exam triggered!"));
};

window.approveOrganizerSettlement = (orgCode, reqId) => {
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgCode: orgCode, requestId: reqId }) })
  .then(() => fetchAllCentralData());
};

window.logoutAdminSession = () => { sessionStorage.removeItem("nvmso_admin_logged"); location.reload(); };
