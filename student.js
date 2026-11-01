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
    if (modeBadge) modeBadge.innerText = "Exam Conduct Mode: ENTER ORGANIZER CODE FIRST";
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
      display.innerHTML = `✅ School Authorized: <strong style="color:#10b981; font-size:13px;">${data.schoolName}</strong>`;
      display.style.color = "#10b981";
      modeBadge.innerText = `EXAM CONDUCT MODE: ${data.examMode.toUpperCase()}`;
      isOrganizerVerified = true;
      verifiedOrgExamMode = data.examMode;

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

// 📌 Confirm Details & Proceed Button Click Handler
window.validateAndShowPayment = function() {
  if (!isOrganizerVerified) {
    alert("⚠️ Please enter and verify a valid School Organizer Code first!");
    document.getElementById('org-code').focus();
    return;
  }
  
  const orgCode = document.getElementById('org-code').value.trim();
  const name = document.getElementById('std-name').value.trim();
  const mother = document.getElementById('std-mother').value.trim();
  const father = document.getElementById('std-father').value.trim();
  const stdClass = document.getElementById('std-class').value;
  const roll = document.getElementById('std-roll').value.trim();
  const contact = document.getElementById('std-contact').value.trim();

  if (!orgCode || !name || !mother || !father || !stdClass || !roll || !contact) {
    alert("❌ Please fill out all required student details before proceeding to payment!");
    return;
  }

  document.getElementById('details-section').style.display = 'none';
  document.getElementById('payment-section').style.display = 'block';
  renderDynamicUPIQR();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.backToDetails = function() {
  document.getElementById('payment-section').style.display = 'none';
  document.getElementById('details-section').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.toggleQrDisplay = function() {
  const qrDiv = document.getElementById('dynamic-qr-container');
  if (qrDiv.style.display === 'none' || qrDiv.style.display === '') {
    qrDiv.style.display = 'flex';
  } else {
    qrDiv.style.display = 'none';
  }
};

// 📌 Checkbox Toggle Handler (Enables/Disables Final Complete Registration Button)
window.toggleSubmitButton = function() {
  const termsCheckbox = document.getElementById('terms-checkbox');
  const submitBtn = document.getElementById('btn-final-submit');
  if (!termsCheckbox || !submitBtn) return;

  if (termsCheckbox.checked) {
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
    submitBtn.style.cursor = "pointer";
  } else {
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.5";
    submitBtn.style.cursor = "not-allowed";
  }
};

// 📌 Final Registration Form Submission
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
    studentName: document.getElementById('std-name').value.trim(),
    motherName: document.getElementById('std-mother').value.trim(),
    fatherName: document.getElementById('std-father').value.trim(),
    studentClass: document.getElementById('std-class').value,
    rollNumber: document.getElementById('std-roll').value.trim(),
    stream: document.getElementById('std-stream') ? document.getElementById('std-stream').value : '',
    contactNumber: document.getElementById('std-contact').value.trim(),
    paymentMode: document.getElementById('payment-mode').value,
    utrNumber: document.getElementById('std-utr') ? document.getElementById('std-utr').value.trim() : ''
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
      document.getElementById('payment-section').style.display = 'none';
      document.getElementById('details-section').style.display = 'block';
      isOrganizerVerified = false;
      document.getElementById("school-name-display").innerText = "";
      document.getElementById("display-student-exam-mode").innerText = "Exam Conduct Mode: ENTER ORGANIZER CODE FIRST";
      toggleSubmitButton();
    } else {
      alert("❌ Error: " + data.message);
    }
  })
  .catch(() => {
    alert("❌ Server connection error. Please try again.");
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
