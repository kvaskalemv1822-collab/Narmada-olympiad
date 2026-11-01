const SERVER_URL = "https://nvmso-backend.onrender.com";
let allStudentsCache = [];
let allOrganizersCache = [];
let pendingSettlementsCache = [];
let pendingPayoutsCache = [];
let activeTicketId = null;
let activeTicketSender = null;
let autoRefreshTimer = null;

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
        fetchSupportTickets();

        // 🔄 AUTO-REFRESH LIVE SYNC (Har 8 seconds mein data automatically update hoga, bina logout/refresh ke)
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

// 1. MERGED ORGANIZER & COMMISSION SETTLEMENT MANAGER
function renderMergedOrganizersTable() {
  const tbody = document.getElementById("admin-organizers-rows");
  if(!tbody) return;
  tbody.innerHTML = allOrganizersCache.length ? "" : "<tr><td colspan='8' style='text-align:center; color:#64748b; padding:15px;'>No organizers registered yet.</td></tr>";

  allOrganizersCache.forEach(org => {
    const code = org.code || org.orgCode;
    const isSettled = org.manualSettled;

    const allSchoolStudents = allStudentsCache.filter(s => (s.orgCode || "").toUpperCase() === code.toUpperCase());
    const verifiedStudents = allSchoolStudents.filter(s => s.paymentStatus === 'Approved' || s.paymentVerified === true);

    const totalReg = verifiedStudents.length || 0;
    const pendingReviewCount = allSchoolStudents.filter(s => s.paymentStatus && s.paymentStatus.includes("Pending")).length;

    const onlineRegs = verifiedStudents.filter(s => (s.paymentMode || 'online').toLowerCase() === 'online').length;
    const cashRegs = verifiedStudents.filter(s => (s.paymentMode || '').toLowerCase() === 'offline' || (s.paymentMode || '').toLowerCase() === 'cash').length;

    const examMode = (org.examMode || 'online').toLowerCase();
    const feePerStudent = examMode === 'offline' ? 120 : 100;

    const cashGross = cashRegs * feePerStudent;
    const grossTotal = totalReg * feePerStudent;

    const directComm = examMode === 'offline' ? (totalReg * 15) : (grossTotal * 0.15);
    const refComm = grossTotal * 0.05; 
    const netCashToPortal = cashGross - directComm;

    const sett = pendingSettlementsCache.find(s => s.orgCode === code);
    const organizerUpi = org.upiId || org.upi || "org@upi"; 

    let settCell = isSettled ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled</span>" : "<span style='color:#f87171;'>Pending UTR</span>";
    if (sett) {
      settCell = `<code style="color:#facc15;">UTR: ${sett.utrNumber}<br>(₹${sett.amount})</code>`;
    }

    let actionCell = isSettled ? "<span style='color:#38bdf8; font-weight:bold;'>Completed</span>" : (sett ? `<button onclick="approveOrganizerSettlement('${code}', '${sett.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Verify UTR</button>` : "Awaiting");

    if (refComm > 0) {
      actionCell += `<br><button onclick="payCommissionViaPhonePe('${organizerUpi}', ${refComm}, '${code}')" style="margin-top:6px; background:#f59e0b; color:#fff; border:none; padding:5px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">📲 Pay Comm (₹${refComm.toFixed(0)})</button>`;
    }

    let pendingBadge = pendingReviewCount > 0 ? `<br><span style="font-size:9px; color:#f59e0b; font-weight:bold;">(${pendingReviewCount} Pending)</span>` : "";

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;">
          <code style="color:#38bdf8; font-weight:bold; font-size:13px;">${code}</code><br>
          <span style="font-size:12px; color:#cbd5e1; font-weight:600;">${org.schoolName || 'School'}</span><br>
          <span style="background:#1e293b; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:bold; color:${examMode=='offline'?'#fbbf24':'#38bdf8'}">${examMode.toUpperCase()}</span>
        </td>
        <td style="padding:10px;">
          <strong>${org.name || org.coordinatorName || 'N/A'}</strong><br>
          <span style="font-size:11px; color:#94a3b8;">${org.contact || ''}</span><br>
          <span style="font-size:10px; color:#38bdf8;">UPI: ${organizerUpi}</span>
        </td>
        <td style="padding:10px; color:#4ade80; font-weight:bold; text-align:center;">
          ${totalReg} ${pendingBadge}<br><span style="font-size:10px; color:#94a3b8;">(${onlineRegs} On / ${cashRegs} Cash)</span>
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

// 2. LIVE CHAT SUPPORT SYSTEM
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
            <div onclick="openChatSession('${q.ticketId}', '${q.senderName || q.orgCode}')" style="padding: 8px; margin-bottom: 6px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; cursor: pointer; transition: background 0.2s;">
              <p style="font-weight: bold; color: #38bdf8; font-size: 11px;">${q.senderName || q.orgCode}</p>
              <p style="color: #cbd5e1; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q.lastMessage || 'New Query'}</p>
            </div>
          `;
        });
      } else {
        listContainer.innerHTML = `<p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 20px;">No pending support queries.</p>`;
      }
    }).catch(() => {});
}

window.openChatSession = function(ticketId, senderName) {
  activeTicketId = ticketId;
  activeTicketSender = senderName;
  
  const chatBox = document.getElementById("active-chat-box");
  const chatInput = document.getElementById("admin-chat-input");
  const sendBtn = document.getElementById("btn-send-reply");

  if(chatInput) chatInput.disabled = false;
  if(sendBtn) sendBtn.disabled = false;

  chatBox.innerHTML = `<p style="color: #4ade80; font-size: 11px; text-align: center; margin-bottom: 10px;">-- Connected with ${senderName} --</p>`;
  
  fetch(`${SERVER_URL}/api/admin/query_messages?ticketId=${ticketId}`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success" && data.messages) {
        chatBox.innerHTML = "";
        data.messages.forEach(m => {
          let align = m.isAdmin ? "right" : "left";
          let bg = m.isAdmin ? "#0369a1" : "#1e293b";
          chatBox.innerHTML += `
            <div style="text-align: ${align}; margin-bottom: 6px;">
              <span style="display: inline-block; background: ${bg}; padding: 6px 10px; border-radius: 6px; max-width: 80%; text-align: left; color: #fff;">${m.text}</span>
            </div>
          `;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }).catch(() => {});
};

window.sendAdminReply = function() {
  const chatInput = document.getElementById("admin-chat-input");
  const chatBox = document.getElementById("active-chat-box");
  const msgText = chatInput.value.trim();

  if (!msgText || !activeTicketId) return;

  chatBox.innerHTML += `
    <div style="text-align: right; margin-bottom: 6px;">
      <span style="display: inline-block; background: #0369a1; padding: 6px 10px; border-radius: 6px; max-width: 80%; text-align: left; color: #fff;">${msgText}</span>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;
  chatInput.value = "";

  fetch(`${SERVER_URL}/api/admin/reply_query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketId: activeTicketId, message: msgText })
  }).then(res => res.json());
};

window.payCommissionViaPhonePe = function(upiId, amount, orgCode) {
  if (!upiId || upiId === "org@upi") {
    let customUpi = prompt("Please enter organizer's correct UPI ID for payment:", "");
    if (!customUpi) return;
    upiId = customUpi;
  }

  let upiIntentUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=NVMSO_Commission_Payout&am=${amount.toFixed(2)}&cu=INR`;
  window.location.href = upiIntentUrl;

  setTimeout(() => {
    if (confirm("Did you complete the payment on PhonePe? Click OK to mark this commission payout as completed.")) {
      fetch(`${SERVER_URL}/api/admin/complete_payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgCode: orgCode, amount: amount })
      }).then(res => res.json()).then(d => {
        if(d.status === "success") {
          alert("🎉 Commission payout recorded successfully!");
          fetchAllCentralData();
        }
      });
    }
  }, 3000);
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

// 3. SCHOOL-WISE DUAL-COLUMN RANKINGS WITH "GOLD MEDAL + CERTIFICATE" BADGE FOR RANK 1
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
                group1.slice(0, 6).map((s, idx) => {
                  let badge = idx === 0 ? `<br><span style="color:#facc15; font-size:9px; font-weight:bold;">🥇 Gold Medal + Certificate</span>` : "";
                  return `
                    <tr style="border-bottom: 1px solid #0f172a;">
                      <td style="padding:4px 3px; color:#facc15; font-weight:bold; vertical-align:top;">#${idx+1}</td>
                      <td style="padding:4px 3px; color:#fff; vertical-align:top;">${s.studentName} <span style="color:#94a3b8;">(${s.studentClass})</span>${badge}</td>
                      <td style="padding:4px 3px; text-align:right; color:#38bdf8; font-weight:bold; vertical-align:top;">${s.score || 0}</td>
                    </tr>
                  `;
                }).join('')}
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
                group2.slice(0, 6).map((s, idx) => {
                  let badge = idx === 0 ? `<br><span style="color:#facc15; font-size:9px; font-weight:bold;">🥇 Gold Medal + Certificate</span>` : "";
                  return `
                    <tr style="border-bottom: 1px solid #0f172a;">
                      <td style="padding:4px 3px; color:#facc15; font-weight:bold; vertical-align:top;">#${idx+1}</td>
                      <td style="padding:4px 3px; color:#fff; vertical-align:top;">${s.studentName} <span style="color:#94a3b8;">(${s.studentClass})</span>${badge}</td>
                      <td style="padding:4px 3px; text-align:right; color:#38bdf8; font-weight:bold; vertical-align:top;">${s.score || 0}</td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `;
    gridContainer.appendChild(card);
  });
};

// 4. SCHOOL-WISE STUDENT DETAILS LEDGER & APPROVAL / REJECTION ACTIONS
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
    const isApproved = s.paymentStatus === "Approved" || s.paymentStatus === "Cash Handover" || s.paymentVerified === true;
    const isRejected = s.paymentStatus === "Rejected";
    const payMode = (s.paymentMode || 'online').toUpperCase();
    
    let utrInfo = s.utrNumber ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>` : "<br><span style='color:#f87171; font-size:10px;'>No UTR Provided</span>";
    if (isRejected && s.rejectionReason) {
      utrInfo += `<br><span style="color:#f87171; font-size:11px; font-weight:bold;">Reason: ${s.rejectionReason}</span>`;
    }

    let statusColor = '#f59e0b'; // Pending
    if (isApproved) statusColor = '#4ade80';
    if (isRejected) statusColor = '#f87171';

    let paymentBadge = `<span style="color:${statusColor}; font-weight:bold;">${s.paymentStatus || 'Pending Verification'} (${payMode})</span>${utrInfo}`;

    let actionButtons = `<button onclick="triggerReExam('${s.id}')" style="background:#7c3aed; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">🔄 Re-Exam</button>`;

    // Guaranteeing Approve & Reject buttons for pending online payments
    if (s.paymentMode === 'online' && !isApproved && !isRejected) {
      actionButtons += `<button onclick="approveOnlinePayment('${s.id}')" style="background:#10b981; color:#fff; border:none; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">✔️ Approve</button>`;
      actionButtons += `<button onclick="rejectOnlinePayment('${s.id}')" style="background:#dc2626; color:#fff; border:none; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">❌ Reject</button>`;
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><strong>${s.studentName}</strong><br><span style="font-size:11px; color:#94a3b8;">Roll: ${s.rollNumber}</span></td>
        <td style="padding:10px;">Class ${s.studentClass}</td>
        <td style="padding:10px;">${paymentBadge}</td>
        <td style="padding:10px;"><strong style="color:#4ade80;">${s.score || 0}</strong> <span style="color:#38bdf8; font-size:11px;">(${(s.score || 0)}%)</span></td>
        <td style="padding:10px;">${actionButtons}</td>
      </tr>
    `;
  });
};

window.approveOnlinePayment = function(studentId) {
  if (!confirm(`Are you sure you want to approve this online payment UTR?`)) return;

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
    } else {
      alert("❌ Error: " + (data.message || "Could not approve payment."));
    }
  })
  .catch(() => {
    alert("❌ Server connection error while approving payment.");
  });
};

window.rejectOnlinePayment = function(studentId) {
  let reason = prompt("Enter reason for rejecting this UTR (e.g., Fake UTR / Payment not received):", "Fake or Invalid UTR Number");
  if (!reason) return;

  fetch(`${SERVER_URL}/api/admin/reject_payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, reason: reason })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("❌ UTR rejected successfully! The reason is now visible to the coordinator.");
      fetchAllCentralData();
    } else {
      alert("❌ Error: " + (data.message || "Could not reject payment."));
    }
  })
  .catch(() => {
    alert("❌ Server connection error while rejecting payment.");
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

window.logoutAdminSession = () => { location.reload(); };
