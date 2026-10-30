const SERVER_URL = "https://onrender.com";

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
      }
    });
}

// 🚨 SMART INTERLOCK INTERFACE MATRIX
// Ensures that only one portal phase remains active at any given moment.
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

window.logoutAdminSession = () => { location.reload(); };
