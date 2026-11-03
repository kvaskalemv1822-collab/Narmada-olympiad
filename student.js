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
});

function fetchPortalConfig() {
  const statusMsg = document.getElementById("portal-status-msg");
  const regView = document.getElementById("registration-view");
  const examView = document.getElementById("exam-login-view");
  const resultView = document.getElementById("result-view");

  if (regView) regView.classList.add("hidden");
  if (examView) examView.classList.add("hidden");
  if (resultView) resultView.classList.add("hidden");

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalConfigData = data.config;
        activeUpiString = portalConfigData.adminUpiId || portalConfigData.upiId || "narmada@upi";

        const isRegOpen = !!portalConfigData.isRegistrationOpen;
        const isExamActive = !!portalConfigData.isExamActive;
        const isResultDeclared = !!portalConfigData.isResultDeclared;

        if (isResultDeclared) {
          if (resultView) resultView.classList.remove("hidden");
          if (statusMsg) { statusMsg.textContent = "🏆 Exam Results Declared! Check your scorecard below."; statusMsg.style.color = "#facc15"; }
        } else if (isExamActive) {
          if (examView) examView.classList.remove("hidden");
          if (statusMsg) { statusMsg.textContent = "✍️ Online Exam Portal is Active. Login to start."; statusMsg.style.color = "#0284c7"; }
        } else if (isRegOpen) {
          if (regView) regView.classList.remove("hidden");
          if (statusMsg) { statusMsg.textContent = "🟢 NVMSO Registration is Live & Active."; statusMsg.style.color = "#10b981"; }
        } else {
          if (statusMsg) { statusMsg.textContent = "🔴 Portal is currently offline / locked by Central Admin."; statusMsg.style.color = "#ef4444"; }
        }
      }
    }).catch(() => { if (statusMsg) statusMsg.textContent = "Offline Mode / Server Pipeline Blocked"; });
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
      if (payMode === "online" && onlineSection) onlineSection.style.display = "block";
      renderDynamicUPIQR();
    } else {
      display.innerText = data.status === "locked" ? `🔒 ${data.message}` : "❌ Invalid Organizer Code!";
      display.style.color = data.status === "locked" ? "#f59e0b" : "#ef4444";
      isOrganizerVerified = false;
      if (onlineSection) onlineSection.style.display = "none";
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
  if (typeof QRCode !== "undefined") {
    new QRCode(qrBox, { text: upiUrl, width: 160, height: 160 });
  }
}

window.openDirectUpiApp = function() {
  if (!isOrganizerVerified) { alert("Please verify School Organizer Code first!"); return; }
  let fee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  window.location.href = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
};

window.validateAndShowPayment = function() {
  if (!isOrganizerVerified) {
    alert("⚠️ Please enter and verify a valid School Organizer Code first!");
    document.getElementById('org-code').focus();
    return;
  }
  
  const fields = ['org-code', 'std-name', 'std-mother', 'std-father', 'std-class', 'std-roll', 'std-contact'];
  for (let id of fields) {
    if (!document.getElementById(id).value.trim()) {
      alert("❌ Please fill out all required student details before proceeding!");
      return;
    }
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
  qrDiv.style.display = (qrDiv.style.display === 'none' || qrDiv.style.display === '') ? 'flex' : 'none';
};

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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("🎉 Registration Saved Successfully!");
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
  }).catch(() => alert("❌ Server connection error."));
};

window.verifyStudentLoginAndStartExam = function() {
  const orgCode = document.getElementById("login-org-code").value.trim().toUpperCase();
  const roll = document.getElementById("login-roll").value.trim();
  const password = document.getElementById("login-password").value.trim();

  if (!orgCode || !roll || !password) {
    alert("⚠️ Please enter School Code, Roll Number, and Password.");
    return;
  }

  fetch(`${SERVER_URL}/api/student/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, rollNumber: roll, password: password })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      studentSessionData = data.student;
      document.getElementById("student-auth-box").classList.add("hidden");
      
      let previewBox = document.getElementById("student-details-preview-box");
      if (!previewBox) {
        previewBox = document.createElement("div");
        previewBox.id = "student-details-preview-box";
        previewBox.className = "score-card";
        document.getElementById("exam-login-view").appendChild(previewBox);
      }
      
      previewBox.style.display = "block";
      previewBox.innerHTML = `
        <h3 style="color: #1e3c72; margin-bottom: 15px;">📋 Student Details Verification</h3>
        <p style="text-align: left; margin-bottom: 5px;"><strong>Student Name:</strong> ${studentSessionData.studentName}</p>
        <p style="text-align: left; margin-bottom: 5px;"><strong>Class:</strong> ${studentSessionData.studentClass}</p>
        <p style="text-align: left; margin-bottom: 5px;"><strong>Roll No:</strong> ${studentSessionData.rollNumber}</p>
        <p style="text-align: left; margin-bottom: 5px;"><strong>Father's Name:</strong> ${studentSessionData.fatherName || 'N/A'}</p>
        <p style="text-align: left; margin-bottom: 15px;"><strong>School Name:</strong> <span style="font-weight: bold; font-size: 14px;">${studentSessionData.schoolName || studentSessionData.orgCode}</span></p>
        <button onclick="launchActualExam()" class="btn-submit" style="background: #1e3c72;">🚀 Start Exam Now</button>
      `;
    } else {
      alert("❌ Login Failed: " + (data.message || "Invalid credentials."));
    }
  }).catch(() => alert("❌ Server connection error during login."));
};

window.launchActualExam = function() {
  const previewBox = document.getElementById("student-details-preview-box");
  if (previewBox) previewBox.style.display = "none";

  document.getElementById("active-exam-container").classList.remove("hidden");
  document.getElementById("exam-student-info").textContent = `Student: ${studentSessionData.studentName} (Class ${studentSessionData.studentClass})`;
  
  loadExamQuestions(studentSessionData.studentClass, studentSessionData.stream);
  startExamTimer(30 * 60);
};

function loadExamQuestions(studentClass, stream) {
  fetch(`${SERVER_URL}/api/student/questions`)
    .then(res => res.json())
    .then(data => {
      const qContainer = document.getElementById("exam-questions-list");
      if (!qContainer) return;

      if (data.status === "success" && data.questions && data.questions.length > 0) {
        currentExamQuestions = data.questions;
        qContainer.innerHTML = "";
        
        currentExamQuestions.forEach((q, idx) => {
          let negBadge = q.negativeMarking ? `<span style="color:#d9534f; float:right; font-size:11px;">Negative: -${q.negativeMarking}</span>` : "";
          qContainer.innerHTML += `
            <div style="background: #ffffff; border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; color: #333;">
              <p style="color: #1e3c72; font-weight: bold; margin-bottom: 8px;">Q${idx+1}. ${q.questionText} ${negBadge}</p>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="cursor: pointer; color: #444;"><input type="radio" name="q_${q.id}" value="A" style="margin-right:8px;"> A) ${q.optionA}</label>
                <label style="cursor: pointer; color: #444;"><input type="radio" name="q_${q.id}" value="B" style="margin-right:8px;"> B) ${q.optionB}</label>
                <label style="cursor: pointer; color: #444;"><input type="radio" name="q_${q.id}" value="C" style="margin-right:8px;"> C) ${q.optionC}</label>
                <label style="cursor: pointer; color: #444;"><input type="radio" name="q_${q.id}" value="D" style="margin-right:8px;"> D) ${q.optionD}</label>
              </div>
            </div>
          `;
        });
      } else {
        qContainer.innerHTML = `<p style="color: #d9534f; text-align: center;">No questions available yet.</p>`;
      }
    });
}

function startExamTimer(durationSeconds) {
  let timer = durationSeconds;
  const timerDisplay = document.getElementById("exam-timer-display");
  
  examTimerInterval = setInterval(() => {
    let minutes = Math.floor(timer / 60);
    let seconds = timer % 60;
    timerDisplay.textContent = `⏱️ Time Left: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    if (--timer < 0) {
      clearInterval(examTimerInterval);
      alert("⏰ Time is up! Submitting your exam automatically.");
      submitExamAnswers();
    }
  }, 1000);
}

window.submitExamAnswers = function() {
  if (!confirm("Are you sure you want to submit your exam answers?")) return;
  if (examTimerInterval) clearInterval(examTimerInterval);

  let answers = {};
  currentExamQuestions.forEach(q => {
    const selectedOpt = document.querySelector(`input[name="q_${q.id}"]:checked`);
    answers[q.id] = selectedOpt ? selectedOpt.value : "";
  });

  fetch(`${SERVER_URL}/api/student/submit_exam`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: studentSessionData.studentId || `${studentSessionData.orgCode}_${studentSessionData.rollNumber}`,
      answers: answers
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert(`🎉 Exam Submitted Successfully! Your Score: ${data.score} / ${data.total}`);
      window.location.reload();
    } else {
      alert("❌ Error submitting exam: " + data.message);
    }
  });
};

window.fetchStudentResult = function() {
  const orgCode = document.getElementById("res-org-code").value.trim().toUpperCase();
  const roll = document.getElementById("res-roll").value.trim();
  const scorecardBox = document.getElementById("student-scorecard-box");

  if (!orgCode || !roll) {
    alert("⚠️ Please enter School Code and Roll Number.");
    return;
  }

  fetch(`${SERVER_URL}/api/student/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, rollNumber: roll })
  })
  .then(res => res.json())
  .then(data => {
    scorecardBox.style.display = "block";
    if (data.status === "success") {
      const resData = data.result;
      
      // Zero margin clean certificate layout: Name -> Class -> School Name + Download Button
      scorecardBox.innerHTML = `
        <div class="certificate-content-wrapper">
          <div class="cert-student-name">${resData.studentName}</div>
          <div class="cert-student-class">Class: ${resData.studentClass} ${resData.stream ? '(' + resData.stream + ')' : ''}</div>
          <div class="cert-school-name">${resData.schoolName || resData.orgCode}</div>
          
          <button onclick="window.print()" class="cert-download-btn no-print">📥 Download / Print Certificate</button>
        </div>
      `;
    } else {
      scorecardBox.innerHTML = `<p style="color: #d9534f; text-align: center; padding: 40px; background:#fff;">❌ ${data.message || "Result not available."}</p>`;
    }
  });
};

window.handlePaymentModeChange = (mode) => {
  const onlineSection = document.getElementById("online-payment-section");
  if (mode === "online" && isOrganizerVerified) onlineSection.style.display = "block";
  else onlineSection.style.display = "none";
};

window.handleClassChange = (val) => {
  const streamGroup = document.getElementById("stream-group");
  if (parseInt(val, 10) >= 11) streamGroup.classList.remove("hidden");
  else streamGroup.classList.add("hidden");
};
