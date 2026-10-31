const SERVER_URL = "https://nvmso-backend.onrender.com";

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
        if (document.getElementById("cfg-upi")) document.getElementById("cfg-upi").value = config.upiId || "narmada@upi";
        if (document.getElementById("cfg-qr-url")) document.getElementById("cfg-qr-url").value = config.qrImageUrl || "Qrcode.jpg";
        
        if (document.getElementById("cfg-reg-active")) document.getElementById("cfg-reg-active").checked = !!config.isRegistrationOpen;
        if (document.getElementById("cfg-exam-active")) document.getElementById("cfg-exam-active").checked = !!config.isExamActive;
        if (document.getElementById("cfg-result-allowed")) document.getElementById("cfg-result-allowed").checked = !!config.isResultDeclared;
        if (document.getElementById("admin-broadcast-input")) document.getElementById("admin-broadcast-input").value = config.broadcastNotice || "";

        setupSmartSwitchesExclusiveRule();
        fetchAdminFinancialRequests();
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
    upiId: document.getElementById("cfg-upi").value,
    qrImageUrl: document.getElementById("cfg-qr-url").value,
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

// Fetch settlement and payout requests for Admin
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
