const SERVER_URL = "https://nvmso-backend.onrender.com";
let activeUpiString = "";
let isOrganizerVerified = false;
let verifiedOrgExamMode = "online";
let portalConfigData = {};
let currentExamQuestions = [];
let studentSessionData = null;
let examTimerInterval = null;
let isAutoSubmittingExam = false;

document.addEventListener("DOMContentLoaded", () => {
  fetchPortalConfig();
  ["std-roll", "login-roll", "res-roll"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", function() {
        this.value = this.value.replace(/[^0-9]/g, "");
      });
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (
      document.hidden &&
      document.getElementById("active-exam-container") &&
      !document.getElementById("active-exam-container").classList.contains("hidden")
    ) {
      alert("⚠️ WARNING: You switched tabs or minimized the browser! Suspicious activity is monitored.");
    }
  });
});

function getExamDurationMinutes() {
  const mins = Number(
    portalConfigData.examDurationMinutes ||
    portalConfigData.paperTimeLimit ||
    portalConfigData.durationMinutes ||
    30
  );
  return mins > 0 ? mins : 30;
}

function getConfiguredQuestionLimit() {
  const count = Number(
    portalConfigData.totalQuestions ||
    portalConfigData.questionCount ||
    portalConfigData.maxQuestions ||
    30
  );
  return count > 0 ? count : 30;
}

function updateExamMetaDisplays(actualQuestionCount) {
  const mins = getExamDurationMinutes();
  const qCount = actualQuestionCount > 0 ? actualQuestionCount : getConfiguredQuestionLimit();

  const instMinsEl = document.getElementById("inst-duration-mins");
  const instQEl = document.getElementById("inst-question-count");
  const examQEl = document.getElementById("exam-question-count");

  if (instMinsEl) instMinsEl.textContent = mins;
  if (instQEl) instQEl.textContent = qCount;
  if (examQEl) examQEl.textContent = `📝 Questions: ${qCount}`;
}

function resolveQuestionBucket(q) {
  const rawGroup = String(
    q.classGroup || q.classCategory || q.targetClass || q.group || ""
  )
    .trim()
    .toLowerCase();
  const rawSub = String(
    q.subject || q.stream || q.examSubject || ""
  )
    .trim()
    .toLowerCase();

  if (
    rawGroup.includes("3") && rawGroup.includes("5") ||
    rawGroup === "3-5" ||
    rawGroup === "3rd to 5th"
  ) {
    return "3-5";
  }
  if (
    rawGroup.includes("6") && rawGroup.includes("8") ||
    rawGroup === "6-8" ||
    rawGroup === "6th to 8th"
  ) {
    return "6-8";
  }
  if (
    rawGroup.includes("9") && rawGroup.includes("10") ||
    rawGroup === "9-10" ||
    rawGroup === "9th to 10th"
  ) {
    return "9-10";
  }
  if (rawGroup.includes("11") || rawGroup.includes("12")) {
    if (rawGroup.includes("math") || rawSub.includes("math") || rawSub === "m") {
      return "11-12-maths";
    }
    if (rawGroup.includes("sci") || rawSub.includes("sci") || rawSub === "s") {
      return "11-12-science";
    }
  }

  const clsNum = parseInt(q.studentClass || q.class || rawGroup, 10);
  if (clsNum >= 3 && clsNum <= 5) return "3-5";
  if (clsNum >= 6 && clsNum <= 8) return "6-8";
  if (clsNum >= 9 && clsNum <= 10) return "9-10";
  if (clsNum >= 11 && clsNum <= 12) {
    if (rawSub.includes("math") || rawSub === "m") return "11-12-maths";
    if (rawSub.includes("sci") || rawSub === "s") return "11-12-science";
  }

  return "";
}

function filterQuestionsForStudent(questions, student) {
  const clsNum = parseInt(student?.studentClass || student?.class || "", 10);
  const streamRaw = String(
    student?.stream ||
    student?.subject ||
    student?.selectedStream ||
    student?.selectedSubject ||
    ""
  )
    .trim()
    .toLowerCase();

  let studentBucket = "";
  if (clsNum >= 3 && clsNum <= 5) {
    studentBucket = "3-5";
  } else if (clsNum >= 6 && clsNum <= 8) {
    studentBucket = "6-8";
  } else if (clsNum >= 9 && clsNum <= 10) {
    studentBucket = "9-10";
  } else if (clsNum >= 11 && clsNum <= 12) {
    if (streamRaw.includes("math") || streamRaw === "m") {
      studentBucket = "11-12-maths";
    } else if (streamRaw.includes("sci") || streamRaw === "s") {
      studentBucket = "11-12-science";
    }
  }

  if (!studentBucket) return [];

  return (questions || []).filter(q => {
    const qBucket = resolveQuestionBucket(q);
    const qSub = String(q.subject || q.stream || "").trim().toLowerCase();

    if (studentBucket === "11-12-maths") {
      return qBucket === "11-12-maths" && (!qSub || qSub.includes("math") || qSub === "m");
    }
    if (studentBucket === "11-12-science") {
      return qBucket === "11-12-science" && (!qSub || qSub.includes("sci") || qSub === "s");
    }
    return qBucket === studentBucket;
  });
}

function fetchPortalConfig() {
  const statusMsg = document.getElementById("portal-status-msg");
  const regView = document.getElementById("registration-view");
  const examView = document.getElementById("exam-login-view");
  const resultView = document.getElementById("result-view");

  // Strict mutual exclusivity: hide all first
  [regView, examView, resultView].forEach(v => v?.classList.add("hidden"));

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalConfigData = data.config || {};
        activeUpiString = portalConfigData.adminUpiId || "narmada@upi";
        updateExamMetaDisplays();

        const isRegOpen = !!portalConfigData.isRegistrationOpen;
        const isExamActive = !!portalConfigData.isExamActive;
        const isResultDeclared = !!portalConfigData.isResultDeclared;

        if (isResultDeclared) {
          resultView?.classList.remove("hidden");
          if (statusMsg) {
            statusMsg.textContent = "🏆 Exam Results Officially Declared!";
            statusMsg.style.color = "#facc15";
          }
        } else if (isExamActive) {
          examView?.classList.remove("hidden");
          if (statusMsg) {
            statusMsg.textContent = "✍️ Online Exam Portal is Active. Login to start.";
            statusMsg.style.color = "#0284c7";
          }
        } else if (isRegOpen) {
          regView?.classList.remove("hidden");
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
    })
    .catch(() => {
      if (statusMsg) statusMsg.textContent = "Server Connection Offline";
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
      display.innerHTML = `✅ School Authorized: <strong style="color:#10b981;">${data.schoolName}</strong>`;
      modeBadge.innerText = `EXAM CONDUCT MODE: ${data.examMode.toUpperCase()}`;
      isOrganizerVerified = true;
      verifiedOrgExamMode = data.examMode;
      if (document.getElementById("payment-mode").value === "online") {
        onlineSection.style.display = "block";
      }
      renderDynamicUPIQR();
    } else {
      display.innerText = "❌ Invalid Organizer Code!";
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
  const fee =
    verifiedOrgExamMode === "offline"
      ? portalConfigData.offlineFee || 120
      : portalConfigData.onlineFee || 100;
  const upiUrl = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
  if (typeof QRCode !== "undefined") {
    new QRCode(qrBox, { text: upiUrl, width: 160, height: 160 });
  }
}

window.openDirectUpiApp = function() {
  if (!isOrganizerVerified) {
    alert("Verify School Organizer Code first!");
    return;
  }
  const fee =
    verifiedOrgExamMode === "offline"
      ? portalConfigData.offlineFee || 120
      : portalConfigData.onlineFee || 100;
  window.location.href = `upi://pay?pa=${encodeURIComponent(activeUpiString)}&pn=NVMSO&am=${fee}&cu=INR`;
};

window.showReviewDetailsModal = function() {
  if (!isOrganizerVerified) {
    alert("⚠️ Enter valid School Organizer Code first!");
    return;
  }
  const fields = ["org-code", "std-name", "std-mother", "std-father", "std-class", "std-roll", "std-contact"];
  for (let id of fields) {
    if (!document.getElementById(id).value.trim()) {
      alert("❌ Please fill out all required fields!");
      return;
    }
  }

  const schoolNameDisplayElem = document.getElementById("school-name-display");
  const schoolFullName = schoolNameDisplayElem
    ? schoolNameDisplayElem.textContent.replace("✅ School Authorized: ", "")
    : document.getElementById("org-code").value.toUpperCase();
  const selectedClassVal = document.getElementById("std-class").value;
  const streamRow =
    parseInt(selectedClassVal, 10) >= 11 && document.getElementById("std-stream")
      ? `<div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
          <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Stream / Subject :-</span>
          <strong style="color: #c084fc;">${document.getElementById("std-stream").value}</strong>
        </div>`
      : "";

  const reviewHtml = `
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">School Name :-</span> 
      <strong style="color: #4ade80;">${schoolFullName}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Coordinator Code :-</span> 
      <strong style="color: #38bdf8;">${document.getElementById("org-code").value.toUpperCase()}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Student Name :-</span> 
      <strong style="color: #fff;">${document.getElementById("std-name").value}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Mother's Name :-</span> 
      <strong style="color: #fff;">${document.getElementById("std-mother").value}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Father's Name :-</span> 
      <strong style="color: #fff;">${document.getElementById("std-father").value}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Class :-</span> 
      <strong style="color: #facc15;">${selectedClassVal}</strong>
    </div>
    ${streamRow}
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Roll Number :-</span> 
      <strong style="color: #38bdf8;">${document.getElementById("std-roll").value}</strong>
    </div>
    <div style="display: flex; gap: 12px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Contact Number :-</span> 
      <strong style="color: #fff;">${document.getElementById("std-contact").value}</strong>
    </div>
  `;
  document.getElementById("review-content").innerHTML = reviewHtml;
  document.getElementById("details-section").style.display = "none";
  document.getElementById("review-section").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.backToEditDetails = function() {
  document.getElementById("review-section").style.display = "none";
  document.getElementById("details-section").style.display = "block";
};

window.proceedToPaymentFromReview = function() {
  document.getElementById("review-section").style.display = "none";
  document.getElementById("payment-section").style.display = "block";
  renderDynamicUPIQR();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.backToDetails = function() {
  document.getElementById("payment-section").style.display = "none";
  document.getElementById("details-section").style.display = "block";
};

window.toggleQrDisplay = function() {
  const qrDiv = document.getElementById("dynamic-qr-container");
  qrDiv.style.display =
    qrDiv.style.display === "none" || qrDiv.style.display === "" ? "flex" : "none";
};

window.submitStudentRegistration = function() {
  const payMode = document.getElementById("payment-mode").value;
  const utrInput = document.getElementById("std-utr") ? document.getElementById("std-utr").value.trim() : "";

  if (payMode === "online" && (!utrInput || utrInput.length < 6)) {
    alert("❌ Error: Online payment selected! Please enter a valid UTR / Transaction Reference Number.");
    return;
  }

  const classVal = document.getElementById("std-class").value;
  const streamVal =
    parseInt(classVal, 10) >= 11 && document.getElementById("std-stream")
      ? document.getElementById("std-stream").value
      : "";

  const payload = {
    orgCode: document.getElementById("org-code").value.toUpperCase(),
    studentName: document.getElementById("std-name").value.trim(),
    motherName: document.getElementById("std-mother").value.trim(),
    fatherName: document.getElementById("std-father").value.trim(),
    studentClass: classVal,
    rollNumber: document.getElementById("std-roll").value.trim(),
    stream: streamVal,
    subject: streamVal,
    contactNumber: document.getElementById("std-contact").value.trim(),
    paymentMode: payMode,
    utrNumber: utrInput || "NOT_PROVIDED"
  };

  fetch(`${SERVER_URL}/api/student/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert("🎉 Registration Submitted Successfully!");
      location.reload();
    } else {
      alert("❌ Error: " + data.message);
    }
  });
};

window.verifyStudentLoginAndStartExam = function() {
  const orgCode = document.getElementById("login-org-code").value.trim().toUpperCase();
  const roll = document.getElementById("login-roll").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!orgCode || !roll || !password) {
    alert("⚠️ Enter all credentials.");
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

      if (studentSessionData.examMode && studentSessionData.examMode.toLowerCase() === "offline") {
        alert("❌ Access Denied: Your school has selected OFFLINE mode for examinations.");
        return;
      }

      updateExamMetaDisplays();
      document.getElementById("student-auth-box").classList.add("hidden");
      document.getElementById("exam-instructions-modal").classList.remove("hidden");
    } else {
      alert("❌ Login Failed: " + data.message);
    }
  });
};

window.proceedToActualExamPaper = function() {
  const agreeCheck = document.getElementById("agree-instructions");
  if (!agreeCheck.checked) {
    alert("⚠️ Please check the box to confirm exam rules.");
    return;
  }

  isAutoSubmittingExam = false;
  document.getElementById("exam-instructions-modal").classList.add("hidden");
  document.getElementById("active-exam-container").classList.remove("hidden");
  const streamTag = studentSessionData.stream ? ` - ${studentSessionData.stream}` : "";
  document.getElementById("exam-student-info").textContent =
    `Student: ${studentSessionData.studentName} (Class ${studentSessionData.studentClass}${streamTag})`;

  loadExamQuestionsForClass(studentSessionData.studentClass);
  startExamTimer(getExamDurationMinutes() * 60);
};

function loadExamQuestionsForClass() {
  const limitCount = getConfiguredQuestionLimit();

  fetch(`${SERVER_URL}/api/student/questions`)
    .then(res => res.json())
    .then(data => {
      const qContainer = document.getElementById("exam-questions-list");
      if (!qContainer) return;
      if (data.status === "success" && Array.isArray(data.questions)) {
        const matched = filterQuestionsForStudent(data.questions, studentSessionData);
        currentExamQuestions = matched.slice(0, limitCount);
        updateExamMetaDisplays(currentExamQuestions.length);

        qContainer.innerHTML = "";
        if (!currentExamQuestions.length) {
          qContainer.innerHTML = `<p style="color:#f87171; text-align:center; padding:16px;">No questions available for your class/stream yet.</p>`;
          return;
        }

        currentExamQuestions.forEach((q, idx) => {
          qContainer.innerHTML += `
            <div style="background: #ffffff; border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 12px; color: #333;">
              <p style="color: #1e3c72; font-weight: bold; margin-bottom: 8px;">Q${idx + 1}. ${q.questionText}</p>
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
  if (examTimerInterval) clearInterval(examTimerInterval);
  let timer = durationSeconds;
  const timerDisplay = document.getElementById("exam-timer-display");

  const renderCountdown = sec => {
    const safeSec = Math.max(0, sec);
    const m = Math.floor(safeSec / 60);
    const s = safeSec % 60;
    if (timerDisplay) {
      timerDisplay.textContent = `⏱️ Time Left: ${m}:${s < 10 ? "0" : ""}${s}`;
      timerDisplay.style.color = safeSec <= 120 ? "#f87171" : "#facc15";
    }
  };

  renderCountdown(timer);

  examTimerInterval = setInterval(() => {
    timer--;
    renderCountdown(timer);
    if (timer <= 0) {
      clearInterval(examTimerInterval);
      if (!isAutoSubmittingExam) {
        isAutoSubmittingExam = true;
        alert("⏰ Time limit khatam ho gayi hai! Aapka paper automatically submit kiya ja raha hai.");
        window.submitExamAnswers(true);
      }
    }
  }, 1000);
}

window.submitExamAnswers = function(isAutoSubmit = false) {
  if (!isAutoSubmit && !isAutoSubmittingExam) {
    if (!confirm("Are you sure you want to submit your exam answers?")) return;
  }
  if (examTimerInterval) clearInterval(examTimerInterval);

  const submitBtn = document.getElementById("btn-submit-exam");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = isAutoSubmit ? "⏳ Auto-Submitting..." : "⏳ Submitting...";
  }

  const answers = {};
  currentExamQuestions.forEach(q => {
    const sel = document.querySelector(`input[name="q_${q.id}"]:checked`);
    answers[q.id] = sel ? sel.value : "";
  });

  fetch(`${SERVER_URL}/api/student/submit_exam`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentId: studentSessionData.studentId,
      answers: answers,
      totalQuestions: currentExamQuestions.length || getConfiguredQuestionLimit(),
      autoSubmitted: !!isAutoSubmit
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert(isAutoSubmit ? "⏰ Time over! Exam auto-submitted successfully." : "✅ Exam Submitted Successfully!");
      location.reload();
    } else {
      alert("❌ Error: " + data.message);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "📤 Submit Final Exam Answers";
      }
    }
  })
  .catch(() => {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "📤 Submit Final Exam Answers";
    }
  });
};

window.fetchStudentResult = function() {
  const orgCode = document.getElementById("res-org-code").value.trim().toUpperCase();
  const roll = document.getElementById("res-roll").value.trim();
  const scorecardBox = document.getElementById("student-scorecard-box");
  if (!orgCode || !roll) {
    alert("Enter School Code and Roll No.");
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
      const maxMarks = resData.totalMarks || resData.totalQuestions || getConfiguredQuestionLimit();
      scorecardBox.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.9); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <h4 style="color: #facc15; margin-bottom: 8px;">📊 Scorecard Summary</h4>
          <p><strong>Name:</strong> ${resData.studentName}</p>
          <p><strong>Class:</strong> ${resData.studentClass}</p>
          <p><strong>Score:</strong> <span style="color: #10b981; font-weight: bold;">${resData.score} / ${maxMarks} (${resData.percentage}%)</span></p>
        </div>
      `;
    } else {
      scorecardBox.innerHTML = `<p style="color: #d9534f; text-align: center; padding: 20px;">❌ ${data.message}</p>`;
    }
  });
};

window.handlePaymentModeChange = mode => {
  document.getElementById("online-payment-section").style.display =
    mode === "online" && isOrganizerVerified ? "block" : "none";
};

window.handleClassChange = val => {
  document.getElementById("stream-group").classList.toggle("hidden", parseInt(val, 10) < 11);
};
