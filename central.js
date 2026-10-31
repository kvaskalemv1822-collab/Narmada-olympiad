const SERVER_URL = "https://nvmso-backend.onrender.com";
let allStudentsCache = [];

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
        fetchAdminFinancialRequests();
        fetchOrganizersAndStudentsData();
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
      alert("✅ Command Dispatched: Portal phases and parameters updated across server nodes!");
    }
  }).catch(() => alert("❌ Sync Connection Error."));
};

// Fetch Organizers & Students for detailed tracking and rankings
function fetchOrganizersAndStudentsData() {
  fetch(`${SERVER_URL}/api/admin/all_data`, { method: "POST" })
    .then(res => res.json())
    .then(data => {
      if(data.status === "success") {
        // 4. Organizers Tracker
        const orgRows = document.getElementById("admin-organizers-rows");
        if(orgRows) {
          orgRows.innerHTML = data.organizers.length ? "" : "<tr><td colspan='6' style='text-align:center; color:#64748b;'>No organizers registered yet.</td></tr>";
          data.organizers.forEach(org => {
            orgRows.innerHTML += `
              <tr style="border-bottom:1px solid #1e293b;">
                <td style="padding:10px;"><code>${org.orgCode}</code></td>
                <td style="padding:10px;"><strong>${org.schoolName}</strong></td>
                <td style="padding:10px;">${org.name}</td>
                <td style="padding:10px;">${org.contact}</td>
                <td style="padding:10px;"><span style="background:#1e293b; padding:2px 6px; border-radius:4px; font-weight:bold; color:${org.examMode=='offline'?'#fbbf24':'#38bdf8'}">${(org.examMode || 'online').toUpperCase()}</span></td>
                <td style="padding:10px; color:#4ade80; font-weight:bold;">${org.totalRegistrations || 0}</td>
              </tr>
            `;
          });
        }

        // 5. Student Details Blocks Cache
        allStudentsCache = data.students || [];
        renderStudentBlocks(allStudentsCache);

        // 6. Rankings Load
        loadClassRankings();
      }
    }).catch(() => {});
}

function renderStudentBlocks(students) {
  const container = document.getElementById("student-blocks-container");
  if(!container) return;
  container.innerHTML = students.length ? "" : "<p style='color:#64748b;'>No students found.</p>";

  students.forEach(s => {
    container.innerHTML += `
      <div style="background:#020617; padding:12px; border-radius:8px; border:1px solid #334155;">
        <p style="font-weight:bold; color:#38bdf8; margin-bottom:4px;">${s.studentName} <span style="font-size:11px; color:#94a3b8;">(Roll: ${s.rollNumber})</span></p>
        <p style="font-size:12px; color:#cbd5e1; margin-bottom:2px;">Class: ${s.studentClass} | School Code: <code>${s.orgCode}</code></p>
        <p style="font-size:12px; color:#cbd5e1; margin-bottom:8px;">Payment: <span style="color:${s.paymentStatus=='Approved'?'#4ade80':'#f87171'}">${s.paymentStatus}</span> | Score: <strong style="color:#facc15;">${s.score || 0}</strong></p>
        <button onclick="triggerReExam('${s.id}')" style="background:#7c3aed; color:#fff; border:none; padding:4px 10px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">🔄 Trigger Re-Exam</button>
      </div>
    `;
  });
}

window.filterStudentBlocks = function() {
  const query = document.getElementById("student-search-input").value.trim().toLowerCase();
  const filtered = allStudentsCache.filter(s => s.studentName.toLowerCase().includes(query) || s.rollNumber.toLowerCase().includes(query));
  renderStudentBlocks(filtered);
};

window.triggerReExam = function(studentId) {
  if(!confirm("Reset this student's exam status to allow Re-Exam?")) return;
  fetch(`${SERVER_URL}/api/admin/reexam`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId })
  }).then(res => res.json()).then(d => {
    if(d.status === "success") alert("✅ Re-Exam triggered successfully for student!");
  });
};

// 6. Class-wise Ranking & Top 6 Tier System
window.loadClassRankings = function() {
  const stream = document.getElementById("ranking-stream-select").value;
  const tbody = document.getElementById("ranking-table-rows");
  if(!tbody) return;

  // Filter students based on class block (3-7 or 8-12)
  const targetStudents = allStudentsCache.filter(s => {
    const clsNum = parseInt(s.studentClass) || 0;
    if (stream === "3-7") return clsNum >= 3 && clsNum <= 7;
    if (stream === "8-12") return clsNum >= 8 && clsNum <= 12;
    return false;
  });

  // Sort by score descending
  targetStudents.sort((a, b) => (b.score || 0) - (a.score || 0));

  tbody.innerHTML = targetStudents.length ? "" : "<tr><td colspan='6' style='text-align:center; color:#64748b;'>No student records found in this block.</td></tr>";

  targetStudents.forEach((s, idx) => {
    const rank = idx + 1;
    let tierBadge = "<span style='color:#38bdf8;'>💻 Digital Certificate</span>";

    if (rank === 1) tierBadge = "<span style='color:#facc15; font-weight:bold;'>🥇 1st Rank - Gold Medal + Physical Cert</span>";
    else if (rank === 2) tierBadge = "<span style='color:#e2e8f0; font-weight:bold;'>🥈 2nd Rank - Silver Medal + Physical Cert</span>";
    else if (rank === 3) tierBadge = "<span style='color:#fb923c; font-weight:bold;'>🥉 3rd Rank - Bronze Medal + Physical Cert</span>";
    else if (rank >= 4 && rank <= 6) tierBadge = "<span style='color:#4ade80; font-weight:bold;'>📜 Top 6 Rank - Physical Certificate</span>";

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><strong>#${rank}</strong></td>
        <td style="padding:10px;">${s.studentName}</td>
        <td style="padding:10px;">Class ${s.studentClass}</td>
        <td style="padding:10px;"><code>${s.orgCode}</code></td>
        <td style="padding:10px;"><strong style="color:#4ade80;">${s.score || 0}</strong> <span style="color:#94a3b8; font-size:11px;">(${(s.score || 0)}%)</span></td>
        <td style="padding:10px;">${tierBadge}</td>
      </tr>
    `;
  });
};

function fetchAdminFinancialRequests() {
  fetch(`${SERVER_URL}/api/admin/financial_requests`)
    .then(res => res.json())
    .then(data => {
      if(data.status === "success") {
        const settContainer = document.getElementById("admin-settlement-list");
        const payoutContainer = document.getElementById("admin-payout-list");

        if(settContainer) {
          settContainer.innerHTML = data.settlements.length ? "" : "<p style='color:#64748b;'>No settlement proofs submitted yet.</p>";
          data.settlements.forEach(st => {
            settContainer.innerHTML += `
              <div style="background:#0f172a; padding:10px; border-radius:6px; margin-bottom:8px; border:1px solid #334155;">
                <p><strong>School Code:</strong> <span style="color:#38bdf8;">${st.orgCode}</span></p>
                <p><strong>UTR:</strong> <code>${st.utrNumber}</code> | <strong>Amount:</strong> ₹${st.amount}</p>
                <button onclick="approveOrganizerSettlement('${st.orgCode}', '${st.id}')" style="margin-top:6px; background:#10b981; color:#fff; border:none; padding:4px 10px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">✔️ Verify & Unlock Payouts</button>
              </div>
            `;
          });
        }

        if(payoutContainer) {
          payoutContainer.innerHTML = data.payouts.length ? "" : "<p style='color:#64748b;'>No payout requests pending.</p>";
          data.payouts.forEach(p => {
            payoutContainer.innerHTML += `
              <div style="background:#0f172a; padding:10px; border-radius:6px; margin-bottom:8px; border:1px solid #334155;">
                <p><strong>School:</strong> <span style="color:#facc15;">${p.orgCode}</span> | <strong>Amount:</strong> ₹${p.amount}</p>
                <p><strong>UPI ID:</strong> <code>${p.upiId}</code></p>
                <button onclick="markPayoutCompleted('${p.id}')" style="margin-top:6px; background:#f59e0b; color:#fff; border:none; padding:4px 10px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">💸 Mark Paid</button>
              </div>
            `;
          });
        }
      }
    }).catch(() => {});
}

window.approveOrganizerSettlement = function(orgCode, reqId) {
  if(!confirm(`Confirm settlement approval for ${orgCode}? This will unlock their commission payouts.`)) return;
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, requestId: reqId })
  }).then(res => res.json()).then(d => {
    if(d.status === "success") {
      alert("✅ Settlement Verified! Commission payouts unlocked for this school.");
      fetchAdminFinancialRequests();
    }
  });
};

window.markPayoutCompleted = function(payoutId) {
  if(!confirm("Mark this commission payout as completed?")) return;
  fetch(`${SERVER_URL}/api/admin/complete_payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payoutId: payoutId })
  }).then(res => res.json()).then(d => {
    if(d.status === "success") {
      alert("🎉 Payout marked as completed!");
      fetchAdminFinancialRequests();
    }
  });
};

window.logoutAdminSession = () => { location.reload(); };
