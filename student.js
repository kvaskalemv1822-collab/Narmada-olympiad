const SERVER_URL = "https://nvmso-backend.onrender.com"; 
let activeUpiString = "";
let isOrganizerVerified = false;
let verifiedOrgExamMode = "online";
let portalConfigData = {};
let currentExamQuestions = [];
let studentSessionData = null;
let examTimerInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchPortalConfig();
  ["std-roll", "login-roll", "res-roll"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", function() { this.value = this.value.replace(/[^0-9]/g, ''); });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && document.getElementById("active-exam-container") && !document.getElementById("active-exam-container").classList.contains("hidden")) {
      alert("⚠️ WARNING: You switched tabs or minimized the browser! Suspicious activity is monitored.");
    }
  });
});

function fetchPortalConfig() {
  const statusMsg = document.getElementById("portal-status-msg");
  const regView = document.getElementById("registration-view");
  const examView = document.getElementById("exam-login-view");
  const resultView = document.getElementById("result-view");

  [regView, examView, resultView].forEach(v => v?.classList.add("hidden"));

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalConfigData = data.config;
        activeUpiString = portalConfigData.adminUpiId || "narmada@upi";

        const isRegOpen = !!portalConfigData.isRegistrationOpen;
        const isExamActive = !!portalConfigData.isExamActive;
        const isResultDeclared = !!portalConfigData.isResultDeclared;

        if (isResultDeclared) {
          resultView?.classList.remove("hidden");
          if (statusMsg) { statusMsg.textContent = "🏆 Exam Results Officially Declared!"; statusMsg.style.color = "#facc15"; }
        } else if (isExamActive) {
          examView?.classList.remove("hidden");
          if (statusMsg) { statusMsg.textContent = "✍️ Online Exam Portal is Active. Login to start."; statusMsg.style.color = "#0284c7"; }
        } else if (isRegOpen) {
          regView?.classList.remove("hidden");
          if (statusMsg) { statusMsg.textContent = "🟢 NVMSO Registration is Live & Active."; statusMsg.style.color = "#10b981"; }
        } else {
          if (statusMsg) { statusMsg.textContent = "🔴 Portal is currently offline / locked by Central Admin."; statusMsg.style.color = "#ef4444"; }
        }
      }
    }).catch(() => { if (statusMsg) statusMsg.textContent = "Server Connection Offline"; });
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: val })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      display.innerHTML = `✅ School Authorized: <strong style="color:#10b981;">${data.schoolName}</strong>`;
      modeBadge.innerText = `EXAM CONDUCT MODE: ${data.examMode.toUpperCase()}`;
      isOrganizerVerified = true;
      verifiedOrgExamMode = data.examMode;
      if (document.getElementById("payment-mode").value === "online") onlineSection.style.display = "block";
      renderDynamicUPIQR();
    } else {
      display.innerText = data.status === "locked" ? `🔒 ${data.message}` : "❌ Invalid Organizer Code!";
      isOrganizerVerified = false;
      onlineSection.style.display = "none";
    }
  });
};

function renderDynamicUPIQR() {
  const qrBox = document.getElementById("dynamic-qr-container");
  if (!qrBox) return;
  qrBox.innerHTML = "";
  if (!isOrganizerVerified) return;
  let fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  let upiUrl = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
  if (typeof QRCode !== "undefined") new QRCode(qrBox, { text: upiUrl, width: 160, height: 160 });
}

window.openDirectUpiApp = function() {
  if (!isOrganizerVerified) { alert("Verify School Organizer Code first!"); return; }
  let fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  window.location.href = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
};

// COMPACT & PROFESSIONAL REVIEW DETAILS FORMATTING (Fixed spacing & layout)
window.showReviewDetailsModal = function() {
  if (!isOrganizerVerified) { alert("⚠️ Enter valid School Organizer Code first!"); return; }
  const fields = ['org-code', 'std-name', 'std-mother', 'std-father', 'std-class', 'std-roll', 'std-contact'];
  for (let id of fields) {
    if (!document.getElementById(id).value.trim()) { alert("❌ Please fill out all required fields!"); return; }
  }

  const schoolNameDisplayElem = document.getElementById("school-name-display");
  const schoolFullName = schoolNameDisplayElem ? schoolNameDisplayElem.textContent.replace("✅ School Authorized: ", "") : document.getElementById('org-code').value.toUpperCase();
  const selectedClassVal = document.getElementById('std-class').value;

  const reviewHtml = `
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">School Name :-</span> 
      <strong style="color: #4ade80;">${schoolFullName}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Coordinator Code :-</span> 
      <strong style="color: #38bdf8;">${document.getElementById('org-code').value.toUpperCase()}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Student Name :-</span> 
      <strong style="color: #fff;">${document.getElementById('std-name').value}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Mother's Name :-</span> 
      <strong style="color: #fff;">${document.getElementById('std-mother').value}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Father's Name :-</span> 
      <strong style="color: #fff;">${document.getElementById('std-father').value}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Class :-</span> 
      <strong style="color: #facc15;">${selectedClassVal}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Roll Number :-</span> 
      <strong style="color: #38bdf8;">${document.getElementById('std-roll').value}</strong>
    </div>
    <div style="display: flex; gap: 12px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Contact Number :-</span> 
      <strong style="color: #fff;">${document.getElementById('std-contact').value}</strong>
    </div>
  `;
  document.getElementById('review-content').innerHTML = reviewHtml;
  document.getElementById('details-section').style.display = 'none';
  document.getElementById('review-section').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.backToEditDetails = function() {
  document.getElementById('review-section').style.display = 'none';
  document.getElementById('details-section').style.display = 'block';
};

window.proceedToPaymentFromReview = function() {
  document.getElementById('review-section').style.display = 'none';
  document.getElementById('payment-section').style.display = 'block';
  renderDynamicUPIQR();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.backToDetails = function() {
  document.getElementById('payment-section').style.display = 'none';
  document.getElementById('details-section').style.display = 'block';
};

window.toggleQrDisplay = function() {
  const qrDiv = document.getElementById('dynamic-qr-container');
  qrDiv.style.display = (qrDiv.style.display === 'none' || qrDiv.style.display === '') ? 'flex' : 'none';
};

window.submitStudentRegistration = function() {
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
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("🎉 Registration Saved Successfully! Awaiting Organizer Fee Approval.");
      document.getElementById('reg-form').reset();
      document.getElementById('payment-section').style.display = 'none';
      document.getElementById('details-section').style.display = 'block';
      isOrganizerVerified = false;
      document.getElementById("school-name-display").innerText = "";
    } else { alert("❌ Error: " + data.message); }
  });
};

window.verifyStudentLoginAndStartExam = function() {
  const orgCode = document.getElementById("login-org-code").value.trim().toUpperCase();
  const roll = document.getElementById("login-roll").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!orgCode || !roll || !password) { alert("⚠️ Enter all credentials."); return; }

  fetch(`${SERVER_URL}/api/student/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, rollNumber: roll, password: password })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      studentSessionData = data.student;

      if (studentSessionData.examMode && studentSessionData.examMode.toLowerCase() === 'offline') {
        alert("❌ Access Denied: Your school has selected OFFLINE mode for examinations. You cannot take the exam online!");
        return;
      }

      document.getElementById("student-auth-box").classList.add("hidden");
      document.getElementById("exam-instructions-modal").classList.remove("hidden");

    } else { alert("❌ Login Failed: " + data.message); }
  });
};

window.proceedToActualExamPaper = function() {
  const agreeCheck = document.getElementById("agree-instructions");
  if (!agreeCheck.checked) {
    alert("⚠️ Please check the box to confirm you have read all exam rules and instructions.");
    return;
  }

  document.getElementById("exam-instructions-modal").classList.add("hidden");
  document.getElementById("active-exam-container").classList.remove("hidden");
  document.getElementById("exam-student-info").textContent = `Student: ${studentSessionData.studentName} (Class ${studentSessionData.studentClass})`;
  
  loadExamQuestionsForClass(studentSessionData.studentClass);
  startExamTimer(30 * 60);
};

function loadExamQuestionsForClass(studentClass) {
  fetch(`${SERVER_URL}/api/student/questions`)
    .then(res => res.json())
    .then(data => {
      const qContainer = document.getElementById("exam-questions-list");
      if (!qContainer) return;
      if (data.status === "success" && data.questions) {
        let allQuestions = data.questions;
        
        let filteredQuestions = allQuestions.filter(q => {
          let range = (q.classRange || "").toString();
          if (range.includes("-")) {
            let parts = range.split("-");
            let min = parseInt(parts[0], 10);
            let max = parseInt(parts[1], 10);
            let c = parseInt(studentClass, 10);
            return c >= min && c <= max;
          }
          return range === studentClass.toString();
        });

        if (filteredQuestions.length === 0) {
          filteredQuestions = allQuestions;
        }

        currentExamQuestions = filteredQuestions;
        qContainer.innerHTML = `
          <div style="background: #0f172a; color: #38bdf8; padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 13px; text-align: center;">
            📊 Total Question Bank: ${allQuestions.length} | Showing <strong>${filteredQuestions.length}</strong> Questions for Class ${studentClass}
          </div>
        `;

        currentExamQuestions.forEach((q, idx) => {
          qContainer.innerHTML += `
            <div style="background: #ffffff; border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 12px; color: #333;">
              <p style="color: #1e3c72; font-weight: bold; margin-bottom: 8px;">Q${idx+1}. ${q.questionText}</p>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label><input type="radio" name="q_${q.id}" value="A"> A) ${q.optionA}</label>
                <label><input type="radio" name="q_${q.id}" value="B"> B) ${q.optionB}</label>
                <label><input type="radio" name="q_${q.id}" value="C"> C) ${q.optionC}</label>
                <label><input type="radio" name="q_${q.id}" value="D"> D) ${q.optionD}</label>
              </div>
            </div>
          `;
        });
      }
    });
}

function startExamTimer(durationSeconds) {
  let timer = durationSeconds;
  const timerDisplay = document.getElementById("exam-timer-display");
  examTimerInterval = setInterval(() => {
    let m = Math.floor(timer / 60), s = timer % 60;
    timerDisplay.textContent = `⏱️ Time Left: ${m}:${s < 10 ? '0' : ''}${s}`;
    if (--timer < 0) { clearInterval(examTimerInterval); alert("⏰ Time up!"); submitExamAnswers(); }
  }, 1000);
}

window.submitExamAnswers = function() {
  if (!confirm("Are you sure you want to submit your exam answers?")) return;
  if (examTimerInterval) clearInterval(examTimerInterval);
  let answers = {};
  currentExamQuestions.forEach(q => {
    const sel = document.querySelector(`input[name="q_${q.id}"]:checked`);
    answers[q.id] = sel ? sel.value : "";
  });
  fetch(`${SERVER_URL}/api/student/submit_exam`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentSessionData.studentId, answers: answers })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") { 
      alert("✅ Exam Submitted Successfully! Your answers have been securely recorded. Results will be displayed once officially declared."); 
      location.reload(); 
    } else { alert("❌ Error: " + data.message); }
  });
};

window.fetchStudentResult = function() {
  const orgCode = document.getElementById("res-org-code").value.trim().toUpperCase();
  const roll = document.getElementById("res-roll").value.trim();
  const scorecardBox = document.getElementById("student-scorecard-box");
  if (!orgCode || !roll) { alert("Enter School Code and Roll No."); return; }

  fetch(`${SERVER_URL}/api/student/result`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, rollNumber: roll })
  })
  .then(res => res.json())
  .then(data => {
    scorecardBox.style.display = "block";
    if (data.status === "success") {
      const resData = data.result;
      scorecardBox.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.9); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <h4 style="color: #facc15; margin-bottom: 8px;">📊 Scorecard Summary</h4>
          <p><strong>Name:</strong> ${resData.studentName}</p>
          <p><strong>Class:</strong> ${resData.studentClass}</p>
          <p><strong>Score:</strong> <span style="color: #10b981; font-weight: bold;">${resData.score} / ${resData.totalMarks || 100} (${resData.percentage}%)</span></p>
        </div>
        <div class="certificate-wrapper" id="printable-certificate-area">
          <img src="certificate-template.png" alt="Certificate" class="cert-img">
          <div class="cert-text-overlay">
            <h2 class="cert-student-name">${resData.studentName}</h2>
            <div class="cert-student-class">Class: ${resData.studentClass}</div>
            <div class="cert-school-name">${resData.schoolName}</div>
          </div>
        </div>
        <button onclick="window.print()" class="cert-download-btn no-print" style="margin-top: 20px;">🖨️ Print Certificate (Landscape A4)</button>
      `;
    } else { scorecardBox.innerHTML = `<p style="color: #d9534f; text-align: center; padding: 20px;">❌ ${data.message}</p>`; }
  });
};

window.handlePaymentModeChange = (mode) => {
  document.getElementById("online-payment-section").style.display = (mode === "online" && isOrganizerVerified) ? "block" : "none";
};
window.handleClassChange = (val) => {
  document.getElementById("stream-group").classList.toggle("hidden", parseInt(val, 10) < 11);
};
