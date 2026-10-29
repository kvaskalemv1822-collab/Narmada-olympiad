const SERVER_URL = "https://onrender.com"; // Render par live hone ke baad is link ko badal sakte hain
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
  const btnResult = document.getElementById("nav-btn-result");

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalConfigData = data.config;
        activeUpiString = portalConfigData.upiId || "narmada@upi";

        const isRegOpen = !!portalConfigData.isRegistrationOpen;
        const isExamActive = !!portalConfigData.isExamActive;
        const isResultAllowed = !!portalConfigData.isResultDeclared;

        if (btnReg) btnReg.style.display = isRegOpen ? "block" : "none";
        if (btnLogin) btnLogin.style.display = isExamActive ? "block" : "none";
        if (btnResult) btnResult.style.display = isResultAllowed ? "block" : "none";

        if (isRegOpen) {
          if (statusMsg) statusMsg.textContent = "🟢 NVMSO Registration is Live & Active.";
        } else if (isExamActive) {
          if (statusMsg) statusMsg.textContent = "✍️ Online Exam Portal is Active.";
        } else if (isResultAllowed) {
          if (statusMsg) statusMsg.textContent = "🏆 Exam Results & Scorecards Declared.";
        } else {
          if (statusMsg) statusMsg.textContent = "🔴 Portal is currently offline.";
        }
      }
    }).catch(err => {
      if (statusMsg) statusMsg.textContent = "Offline Mode / Connection Lost";
    });
}

window.fetchSchoolName = function(val) {
  const display = document.getElementById("school-name-display");
  const modeBadge = document.getElementById("display-student-exam-mode");
  
  if (val.trim().length < 5) {
    display.innerText = "";
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
      display.innerHTML = `✅ <strong>School:</strong> ${data.schoolName}`;
      display.style.color = "#10b981";
      modeBadge.innerText = data.examMode.toUpperCase();
      isOrganizerVerified = true;
      verifiedOrgExamMode = data.examMode;
      renderDynamicUPIQR();
    } else if (data.status === "locked") {
      display.innerText = `🔒 ${data.message}`;
      display.style.color = "#f59e0b";
      isOrganizerVerified = false;
    } else {
      display.innerText = "❌ Invalid Organizer Code!";
      display.style.color = "#ef4444";
      isOrganizerVerified = false;
    }
  });
};

function renderDynamicUPIQR() {
  const qrBox = document.getElementById("dynamic-qr-container");
  if (!qrBox) return;
  qrBox.innerHTML = "";
  if (!isOrganizerVerified) {
    qrBox.innerHTML = "<p style='color:#94a3b8; font-size:13px;'>🔒 Enter valid Organizer Code to unlock QR.</p>";
    return;
  }
  let fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  let upiUrl = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
  if (typeof QRCode !== "undefined") {
    new QRCode(qrBox, { text: upiUrl, width: 180, height: 180 });
  }
}

document.getElementById('reg-form').addEventListener('submit', function(e) {
  e.preventDefault();
  if (!isOrganizerVerified) { alert("Please verify School Organizer Code first!"); return; }

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
      alert("🎉 Registration Complete Successfully!");
      document.getElementById('reg-form').reset();
    } else {
      alert("❌ Error: " + data.message);
    }
  });
});
