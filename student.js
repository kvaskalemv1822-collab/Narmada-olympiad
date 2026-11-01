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
  
  const rollInput = document.getElementById("std-roll");
  if (rollInput) {
    rollInput.addEventListener("input", function() {
      this.value = this.value.replace(/[^0-9]/g, '');
    });
  }

  const loginRollInput = document.getElementById("login-roll");
  if (loginRollInput) {
    loginRollInput.addEventListener("input", function() {
      this.value = this.value.replace(/[^0-9]/g, '');
    });
  }

  const resRollInput = document.getElementById("res-roll");
  if (resRollInput) {
    resRollInput.addEventListener("input", function() {
      this.value = this.value.replace(/[^0-9]/g, '');
    });
  }
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
          if (statusMsg) {
            statusMsg.textContent = "🏆 Exam Results Declared! Check your scorecard below.";
            statusMsg.style.color = "#facc15";
          }
        } else if (isExamActive) {
          if (examView) examView.classList.remove("hidden");
          if (statusMsg) {
            statusMsg.textContent = "✍️ Online Exam Portal is Active. Login to start.";
            statusMsg.style.color = "#0284c7";
          }
        } else if (isRegOpen) {
          if (regView) regView.classList.remove("hidden");
          if (statusMsg) {
            statusMsg.textContent = "🟢 NVMSO Registration is Live & Active.";
            statusMsg.style.color = "#10b981";
          }
        } else {
          if (statusMsg) {
            statusMsg.textContent = "🔴 Portal is currently offline / locked by Central Admin.";
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
};

// ==========================================================================
// ✍️ EXAM LOGIN & STUDENT DETAILS PREVIEW BEFORE STARTING EXAM
// ==========================================================================
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
      
      // Hide login box and show Student Details Preview Card before exam starts
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
        <h3 style="color: #38bdf8; margin-bottom: 15px;">📋 Student Details Verification</h3>
        <p style="text-align: left; margin-bottom: 8px;"><strong>Student Name:</strong> ${studentSessionData.studentName}</p>
        <p style="text-align: left; margin-bottom: 8px;"><strong>Class:</strong> ${studentSessionData.studentClass}</p>
        <p style="text-align: left; margin-bottom: 8px;"><strong>Roll No:</strong> ${studentSessionData.rollNumber}</p>
        <p style="text-align: left; margin-bottom: 8px;"><strong>Father's Name:</strong> ${studentSessionData.fatherName || 'N/A'}</p>
        <p style="text-align: left; margin-bottom: 15px;"><strong>School Name:</strong> <span style="font-weight: bold; color: #facc15;">${studentSessionData.schoolName || studentSessionData.orgCode}</span></p>
        <button onclick="launchActualExam()" class="btn-submit" style="background: #10b981;">🚀 Start Exam Now</button>
      `;
    } else {
      alert("❌ Login Failed: " + (data.message || "Invalid credentials. Password is Mother's first 2 capital letters + Roll No."));
    }
  })
  .catch(() => {
    alert("❌ Server connection error during login.");
  });
};

window.launchActualExam = function() {
  const previewBox = document.getElementById("student-details-preview-box");
  if (previewBox) previewBox.style.display = "none";

  document.getElementById("active-exam-container").classList.remove("hidden");
  document.getElementById("exam-student-info").textContent = `Student: ${studentSessionData.studentName} (Class ${studentSessionData.studentClass})`;
  
  loadExamQuestions(studentSessionData.studentClass, studentSessionData.stream);
  startExamTimer(30 * 60); // 30 Minutes
};

function loadExamQuestions(studentClass, stream) {
  fetch(`${SERVER_URL}/api/student/questions?class=${studentClass}&stream=${stream || ''}`)
    .then(res => res.json())
    .then(data => {
      const qContainer = document.getElementById("exam-questions-list");
      if (!qContainer) return;

      if (data.status === "success" && data.questions && data.questions.length > 0) {
        let classNum = parseInt(studentClass, 10);
        let filteredQuestions = data.questions.filter(q => {
          let range = q.classRange || "";
          if (range === "3-5" && classNum >= 3 && classNum <= 5) return true;
          if (range === "6-8" && classNum >= 6 && classNum <= 8) return true;
          if (range === "9-10" && classNum >= 9 && classNum <= 10) return true;
          if (range.includes("11-12") && classNum >= 11) {
            if (range.includes("Maths") && stream === "Maths") return true;
            if (range.includes("Science") && stream === "Science") return true;
            if (!range.includes("Maths") && !range.includes("Science")) return true;
          }
          return false;
        });

        if (filteredQuestions.length === 0) {
          filteredQuestions = data.questions;
        }

        currentExamQuestions = filteredQuestions;
        qContainer.innerHTML = "";
        
        currentExamQuestions.forEach((q, idx) => {
          let negBadge = q.negativeMarking ? `<span style="color:#f87171; float:right; font-size:11px;">Negative: -${q.negativeMarking}</span>` : "";
          qContainer.innerHTML += `
            <div style="background: #fff; border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 12px; font-size: 13px; color: #333;">
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
        qContainer.innerHTML = `<p style="color: #d9534f; text-align: center;">No questions available for Class ${studentClass} yet. Contact admin.</p>`;
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

// ==========================================================================
// 🏆 RESULT & SCORECARD VIEWER (WITH WORKING PRINT CERTIFICATE LAYOUT)
// ==========================================================================
window.fetchStudentResult = function() {
  const orgCode = document.getElementById("res-org-code").value.trim().toUpperCase();
  const roll = document.getElementById("res-roll").value.trim();
  const scorecardBox = document.getElementById("student-scorecard-box");

  if (!orgCode || !roll) {
    alert("⚠️ Please enter School Code and Roll Number to fetch result.");
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
      scorecardBox.innerHTML = `
        <div id="printable-scorecard" class="score-card" style="text-align: left; padding: 20px;">
          <h4 style="color: #4ade80; margin-bottom: 10px; text-align: center;">✅ Official Olympiad Scorecard & Certificate</h4>
          <p style="margin-bottom: 5px;"><strong>Student Name:</strong> ${resData.studentName}</p>
          <p style="margin-bottom: 5px;"><strong>Class:</strong> ${resData.studentClass} | <strong>Roll No:</strong> ${resData.rollNumber}</p>
          <p style="margin-bottom: 5px;"><strong>School Code:</strong> ${resData.orgCode}</p>
          <hr style="border-color:#334155; margin:12px 0;">
          <p style="font-size: 16px; color: #facc15; text-align: center; margin-bottom: 5px;"><strong>Total Score:</strong> ${resData.score} Marks</p>
          <p style="font-size: 14px; color: #38bdf8; text-align: center; margin-bottom: 15px;"><strong>Percentage:</strong> ${resData.percentage || 0}%</p>
          
          <button onclick="window.print()" class="btn-submit no-print" style="background: #0284c7;">🖨️ Print / Save Full Layout Certificate</button>
        </div>
      `;
    } else {
      scorecardBox.innerHTML = `<p style="color: #d9534f; text-align: center;">❌ ${data.message || "Result not declared yet or invalid roll number."}</p>`;
    }
  });
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
