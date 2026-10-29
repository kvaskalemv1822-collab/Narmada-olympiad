/**
 * Narmada Valley Maths & Science Olympiad (NVMSO)
 * Official Student Portal Connection Script
 * Designed to wire securely with Python Flask Backend
 */

// Replace this address with your live Render app URL once hosted (e.g., https://onrender.com)
const SERVER_URL = "http://127.0.0.1:5000"; 

let activeUpiString = "";
let isOrganizerVerified = false;
let verifiedOrgExamMode = "online";
let portalConfigData = {};

document.addEventListener("DOMContentLoaded", () => {
  fetchPortalConfig();
  setupTabBarNavigation();
});

// ==========================================================================
// 1. ENGINE RUNTIME: CONFIGURATION & NOTICES STATUS LOOKUP
// ==========================================================================
function fetchPortalConfig() {
  const statusMsg = document.getElementById("portal-status-msg");
  const btnReg = document.getElementById("nav-btn-reg");
  const btnLogin = document.getElementById("nav-btn-login");
  const btnResult = document.getElementById("nav-btn-result");

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => {
      if (!res.ok) throw new Error("Network status invalid");
      return res.json();
    })
    .then(data => {
      if (data.status === "success") {
        portalConfigData = data.config;
        activeUpiString = portalConfigData.upiId || "narmada@upi";

        const isRegOpen = !!portalConfigData.isRegistrationOpen;
        const isExamActive = !!portalConfigData.isExamActive;
        const isResultDeclared = !!portalConfigData.isResultDeclared;

        // Toggle explicit navigation button nodes dynamically based on active phase
        if (btnReg) btnReg.style.display = isRegOpen ? "block" : "none";
        if (btnLogin) btnLogin.style.display = isExamActive ? "block" : "none";
        if (btnResult) btnResult.style.display = isResultDeclared ? "block" : "none";

        // Display targeted color badge markers for clarity
        if (statusMsg) {
          if (isRegOpen) {
            statusMsg.textContent = "🟢 NVMSO Registration is Live & Active.";
            statusMsg.style.background = "rgba(16, 185, 129, 0.15)";
            statusMsg.style.color = "#10b981";
          } else if (isExamActive) {
            statusMsg.textContent = "✍️ Online Exam Portal is Active.";
            statusMsg.style.background = "rgba(2, 117, 216, 0.15)";
            statusMsg.style.color = "#0275d8";
          } else if (isResultDeclared) {
            statusMsg.textContent = "🏆 Exam Results & Scorecards Declared.";
            statusMsg.style.background = "rgba(255, 193, 7, 0.15)";
            statusMsg.style.color = "#d97706";
          } else {
            statusMsg.textContent = "🔴 Portal is currently offline / locked by Central Admin.";
            statusMsg.style.background = "rgba(239, 68, 68, 0.15)";
            statusMsg.style.color = "#ef4444";
          }
        }
      }
    })
    .catch(err => {
      console.error("Initialization failure:", err);
      if (statusMsg) {
        statusMsg.textContent = "⚠️ Disconnected from main database server.";
        statusMsg.style.background = "rgba(239, 68, 68, 0.15)";
        statusMsg.style.color = "#ef4444";
      }
    });
}

// ==========================================================================
// 2. GATEWAY GATING: REAL-TIME SCHOOL CODE VALIDATION
// ==========================================================================
window.fetchSchoolName = function(val) {
  const display = document.getElementById("school-name-display");
  const modeBadge = document.getElementById("display-student-exam-mode");
  
  if (!val || val.trim().length < 5) {
    if (display) display.innerText = "";
    if (modeBadge) modeBadge.innerText = "Enter Organizer Code First";
    return;
  }

  if (display) {
    display.innerText = "Verifying authorization parameters...";
    display.style.color = "#64748b";
  }

  fetch(`${SERVER_URL}/api/student/verify-school`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: val })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      if (display) {
        display.innerHTML = `✅ <strong>School Authorized:</strong> ${data.schoolName}`;
        display.style.color = "#10b981";
      }
      if (modeBadge) modeBadge.innerText = data.examMode.toUpperCase();
      isOrganizerVerified = true;
      verifiedOrgExamMode = data.examMode;
      renderDynamicUPIQR(); // Regenerate and show checkout values dynamically
    } else if (data.status === "locked") {
      if (display) {
        display.innerText = `🔒 ${data.message}`;
        display.style.color = "#f59e0b";
      }
      if (modeBadge) modeBadge.innerText = "LOCKED";
      isOrganizerVerified = false;
      renderDynamicUPIQR();
    } else {
      if (display) {
        display.innerText = "❌ Unauthorized or blocked School Organizer Code!";
        display.style.color = "#ef4444";
      }
      if (modeBadge) modeBadge.innerText = "INVALID";
      isOrganizerVerified = false;
      renderDynamicUPIQR();
    }
  })
  .catch(err => {
    if (display) display.innerText = "Communication delay. Check terminal logs.";
  });
};

// ==========================================================================
// 3. CHECKOUT MECHANISMS: FINANCIAL QR GENERATOR & DEEP INTENTS
// ==========================================================================
function renderDynamicUPIQR() {
  const qrBox = document.getElementById("dynamic-qr-container");
  if (!qrBox) return;

  qrBox.innerHTML = ""; // Clear frame cache

  if (!isOrganizerVerified) {
    qrBox.innerHTML = "<p style='color: #94a3b8; font-size: 13px;'>🔒 Enter a validated School Organizer Code above to open instant checkouts.</p>";
    return;
  }

  // Calculate pricing rules safely using global map configurations
  let fee = 100;
  if (portalConfigData) {
    fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  }

  const name = "NVMSO Exam Fee";
  const note = "NVMSO Registration Fee";
  const upiUrl = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=${encodeURIComponent(name)}&tn=${encodeURIComponent(note)}&am=${fee}&cu=INR`;

  if (typeof QRCode !== "undefined") {
    new QRCode(qrBox, {
      text: upiUrl,
      width: 180,
      height: 180
    });
  } else {
    qrBox.innerHTML = "<p style='color:#ef4444;'>QR generation vector library missing.</p>";
  }
}

window.openDirectUpiApp = function() {
  if (!isOrganizerVerified) {
    alert("⛔ Verification Gating: Enter a valid School Organizer Code to initiate UPI deep intents.");
    document.getElementById("org-code")?.focus();
    return;
  }

  let fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  const name = "NVMSO Exam Fee";
  const note = "NVMSO Registration Fee";
  
  const targetIntent = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=${encodeURIComponent(name)}&tn=${encodeURIComponent(note)}&am=${fee}&cu=INR`;
  window.location.href = targetIntent;
};

// ==========================================================================
// 4. PERSISTENT INTAKE: SUBMISSION TO PYTHON FLASK SERVICE
// ==========================================================================
document.getElementById('reg-form').addEventListener('submit', function(e) {
  e.preventDefault();

  if (!isOrganizerVerified) {
    alert("❌ Action Terminated: Please specify a verified School Organizer Code before final sync.");
    return;
  }

  const submitBtn = this.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerText = "Syncing profile payload with main frame...";

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
  .then(res => {
    if (!res.ok) return res.json().then(err => { throw new Error(err.message); });
    return res.json();
  })
  .then(data => {
    if (data.status === "success") {
      // Auto password generator formula template visualization trace
      const motherFirstTwo = payload.motherName.substring(0, 2).toUpperCase();
      const generatedPass = `${motherFirstTwo}${payload.rollNumber}`;
      
      alert(`🎉 REGISTRATION SUCCESSFUL!\n\nCandidate Profile: ${payload.studentName}\nGenerated Password: ${generatedPass}\n\nKeep this credential safe for the online evaluation phase.`);
      this.reset();
      isOrganizerVerified = false;
      renderDynamicUPIQR();
    }
  })
  .catch(err => {
    alert(`❌ Pipeline Sync Failure: ${err.message}`);
  })
  .finally(() => {
    submitBtn.disabled = false;
    submitBtn.innerText = "Complete Registration";
  });
});

// ==========================================================================
// 5. UX ENHANCEMENTS: TABS SWITCHING & INPUT FIELDS HANDLERS
// ==========================================================================
function setupTabBarNavigation() {
  window.switchTab = (tabName) => {
