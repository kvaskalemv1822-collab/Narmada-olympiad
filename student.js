const SERVER_URL = "https://nvmso-backend.onrender.com"; 
let activeUpiString = "";
let isOrganizerVerified = false;
let verifiedOrgExamMode = "online";
let portalConfigData = {};

document.addEventListener("DOMContentLoaded", () => {
  fetchPortalConfig();
});

function fetchPortalConfig() {
  const statusMsg = document.getElementById("portal-status-msg");
  const btnReg = document.getElementById("nav-btn-reg");
  const btnLogin = document.getElementById("nav-btn-login");

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalConfigData = data.config;
        activeUpiString = portalConfigData.upiId || "narmada@upi";

        const isRegOpen = !!portalConfigData.isRegistrationOpen;
        const isExamActive = !!portalConfigData.isExamActive;
        const isResultDeclared = !!portalConfigData.isResultDeclared;

        if (isResultDeclared) {
          if (btnReg) btnReg.style.display = "none";
          if (btnLogin) btnLogin.style.display = "block";
          btnLogin.textContent = "🏆 View Result / Scorecard";
          switchTab('login'); 
          if (statusMsg) {
            statusMsg.textContent = "🏆 Exam Results Declared! Check your scorecard below.";
            statusMsg.style.color = "#facc15";
          }
        } else if (isRegOpen) {
          if (btnReg) btnReg.style.display = "block";
          if (btnLogin) btnLogin.style.display = "none";
          switchTab('reg'); 
          if (statusMsg) {
            statusMsg.textContent = "🟢 NVMSO Registration is Live & Active.";
            statusMsg.style.color = "#10b981";
          }
        } else if (isExamActive) {
          if (btnReg) btnReg.style.display = "none";
          if (btnLogin) btnLogin.style.display = "block";
          btnLogin.textContent = "✍️ Take Online Exam";
          switchTab('login'); 
          if (statusMsg) {
            statusMsg.textContent = "✍️ Online Exam Portal is Active.";
            statusMsg.style.color = "#0275d8";
          }
        } else {
          if (btnReg) btnReg.style.display = "none";
          if (btnLogin) btnLogin.style.display = "none";
          document.getElementById("registration-view").classList.add("hidden");
          document.getElementById("login-view").classList.add("hidden");
          if (statusMsg) {
            statusMsg.textContent = "🔴 Portal is currently offline / locked.";
            statusMsg.style.color = "#ef4444";
          }
        }
      }
    }).catch(() => {
      if (statusMsg) statusMsg.textContent = "Offline Mode / Server Pipeline Blocked";
    });
}

window.fetchSchoolName = function(val) {
  const display = document.getElementById("school-name-display");
  const modeBadge = document.getElementById("display-student-exam-mode");
  const onlineSection = document.getElementById("online-payment-section");
  
  if (!val || val.trim().length < 4) {
    if (display) display.innerText = "";
    isOrganizerVerified = false;
    if (onlineSection) onlineSection.style.display = "none";
    return;
  }

  fetch(`${SERVER_URL}/api/student/verify-school`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: val })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      // 📌 School name bold formatting & Fee display
      display.innerHTML = `✅ School Authorized: <strong style="color:#10b981; font-size:13px;">${data.schoolName}</strong>`;
      display.style.color = "#10b981";
      modeBadge.innerText = data.examMode.toUpperCase();
      isOrganizerVerified = true;
      verifiedOrgExamMode = data.examMode;

      // Update fee text
      const feeDisplay = document.getElementById("fee-amount-display");
      if (feeDisplay) feeDisplay.innerText = data.applicableFee;

      // Show QR code section if online payment mode is selected
      const payMode = document.getElementById("payment-mode").value;
      if (payMode === "online" && onlineSection) {
        onlineSection.style.display = "block";
      }

      renderDynamicUPIQR();
    } else if (data.status === "locked") {
      display.innerText = `🔒 ${data.message}`;
      display.style.color = "#f59e0b";
      isOrganizerVerified = false;
      if (onlineSection) onlineSection.style.display = "none";
    } else {
      display.innerText = "❌ Invalid Organizer Code!";
      display.style.color = "#ef4444";
      isOrganizerVerified = false;
      if (onlineSection) onlineSection.style.display = "none";
    }
  });
};

function renderDynamicUPIQR() {
  const qrBox = document.getElementById("dynamic-qr-container");
  if (!qrBox) return;
  qrBox.innerHTML = "";
  
  // 🔒 Do not show QR code until organizer code is verified
  if (!isOrganizerVerified) {
    qrBox.innerHTML = "<p style='color:#94a3b8; font-size:12px;'>🔒 Enter valid School Code first to generate QR.</p>";
    return;
  }

  let fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  let upiUrl = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
  if (typeof QRCode !== "undefined") {
    new QRCode(qrBox, { text: upiUrl, width: 160, height: 160 });
  }
}

window.openDirectUpiApp = function() {
  if (!isOrganizerVerified) { alert("Please verify School Organizer Code first!"); return; }
  let fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  window.location.href = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
};

document.getElementById('reg-form').addEventListener('submit', function(e) {
  e.preventDefault();
  if (!isOrganizerVerified) { alert("Please verify School Organizer Code first!"); return; }

  const termsChecked = document.getElementById('terms-checkbox').checked;
  if (!termsChecked) {
    alert("⚠️ Please accept the Terms & Conditions policy before submitting registration.");
    return;
  }

  const payload = {
    orgCode: document.getElementById('org-code').value.toUpperCase(),
    studentName: document.getElementById('std-name').value,
    motherName: document.getElementById('std-mother').value,
    fatherName: document.getElementById('std-father').value,
    studentClass: document.getElementById('std-class').value,
    rollNumber: document.getElementById('std-roll').value,
    stream: document.getElementById('std-stream') ? document.getElementById('std-stream').value : '',
    contactNumber: document.getElementById('std-contact').value,
    paymentMode: document.getElementById('payment-mode').value,
    utrNumber: document.getElementById('std-utr') ? document.getElementById('std-utr').value : ''
  };

  fetch(`${SERVER_URL}/api/student/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("🎉 Registration Saved Successfully to Cloud Database!");
      document.getElementById('reg-form').reset();
      isOrganizerVerified = false;
      document.getElementById("online-payment-section").style.display = "none";
      document.getElementById("school-name-display").innerText = "";
    } else {
      alert("❌ Error: " + data.message);
    }
  });
});

window.switchTab = (tabName) => {
  if (tabName === 'reg') {
    document.getElementById("registration-view").classList.remove("hidden");
    document.getElementById("login-view").classList.add("hidden");
  } else {
    document.getElementById("registration-view").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
  }
};

window.handlePaymentModeChange = (mode) => {
  const onlineSection = document.getElementById("online-payment-section");
  if (mode === "online" && isOrganizerVerified) {
    onlineSection.style.display = "block";
  } else {
    onlineSection.style.display = "none";
  }
};

window.handleClassChange = (val) => {
  const streamGroup = document.getElementById("stream-group");
  if (parseInt(val, 10) >= 11) streamGroup.classList.remove("hidden");
  else streamGroup.classList.add("hidden");
};
