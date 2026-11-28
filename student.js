const SERVER_URL = "https://nvmso-backend.onrender.com";
let activeUpiString = "";
let isOrganizerVerified = false;
let verifiedOrgExamMode = "online";
let portalConfigData = {};
let currentExamQuestions = [];
let studentSessionData = null;
let examTimerInterval = null;
let isAutoSubmittingExam = false;
let isSubmittingExam = false;

const SENIOR_MATHS_SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Reasoning"];
const SENIOR_BIO_SUBJECTS = ["Zoology", "Botany", "Chemistry", "General Science"];

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeSubjectLabel(sub) {
  const s = String(sub || "").trim();
  const low = s.toLowerCase();
  if (!s) return "General";
  if (low === "math" || low === "maths") return "Mathematics";
  if (low === "gk" || low === "general knowledge") return "General Knowledge";
  if (low === "chemistry (maths)" || low === "chemistry (bio)") return "Chemistry";
  return s;
}

function buildSafeUpiUri(upiId, payeeName, amount) {
  const cleanUpi = String(upiId || "").trim();
  const amt = Number(amount);
  if (!cleanUpi || !cleanUpi.includes("@") || !Number.isFinite(amt) || amt <= 0) {
    return "";
  }
  const safePayee =
    String(payeeName || "NVMSO").replace(/[^\w\s.-]/g, "").trim() || "NVMSO";
  return `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(safePayee)}&am=${encodeURIComponent(String(amt))}&cu=INR`;
}

document.addEventListener("DOMContentLoaded", () => {
  fetchPortalConfig();
  if (typeof window.handleStreamChange === "function") {
    window.handleStreamChange(document.getElementById("std-stream")?.value || "Maths");
  }

  ["std-roll", "login-roll", "res-roll"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", function () {
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

function extractClassNumber(val) {
  const digits = String(val ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function resolveQuestionBucket(q) {
  const rawGroup = String(
    q.classGroup || q.classRange || q.targetClass || q.classCategory || q.group || ""
  )
    .trim()
    .toLowerCase();
  const rawSub = String(q.subject || "").trim().toLowerCase();
  const rawStream = String(q.stream || "").trim().toLowerCase();

  const clsNum = extractClassNumber(rawGroup || q.studentClass || q.class || "");
  if (clsNum >= 1 && clsNum <= 10) {
    return `class-${clsNum}`;
  }
  if (clsNum >= 11 && clsNum <= 12) {
    if (
      rawStream.includes("bio") ||
      rawStream.includes("zoology") ||
      rawStream.includes("botany") ||
      rawSub.includes("(bio)") ||
      ["zoology", "botany", "general science"].includes(rawSub)
    ) {
      return `class-${clsNum}-biology`;
    }
    if (
      rawStream.includes("math") ||
      rawStream.includes("sci") ||
      rawSub.includes("(maths)") ||
      ["mathematics", "physics", "reasoning"].includes(rawSub)
    ) {
      return `class-${clsNum}-maths`;
    }
    return `class-${clsNum}`;
  }

  if (rawGroup.includes("3") && rawGroup.includes("5")) return "3-5";
  if (rawGroup.includes("6") && rawGroup.includes("8")) return "6-8";
  if (rawGroup.includes("9") && rawGroup.includes("10")) return "9-10";
  if (rawGroup.includes("11") || rawGroup.includes("12")) {
    if (rawStream.includes("bio") || rawSub.includes("zoology") || rawSub.includes("botany")) {
      return "11-12-biology";
    }
    return "11-12-maths";
  }

  return "";
}

function filterQuestionsForStudent(questions, student) {
  const clsNum = extractClassNumber(student?.studentClass || student?.class || "");
  if (!clsNum) return [];

  const streamRaw = String(student?.stream || "").trim().toLowerCase();
  const subRaw = normalizeSubjectLabel(student?.subject || student?.selectedSubject || "").toLowerCase();

  let studentBucket = "";
  if (clsNum >= 1 && clsNum <= 10) {
    studentBucket = `class-${clsNum}`;
  } else if (clsNum >= 11 && clsNum <= 12) {
    if (
      streamRaw.includes("bio") ||
      streamRaw.includes("zoology") ||
      streamRaw.includes("botany") ||
      ["zoology", "botany", "general science"].includes(subRaw)
    ) {
      studentBucket = `class-${clsNum}-biology`;
    } else {
      studentBucket = `class-${clsNum}-maths`;
    }
  }

  const specificSubjectFilter =
    subRaw && !["general", "maths", "mathematics", "biology", "science"].includes(subRaw)
      ? subRaw
      : "";

  return (questions || []).filter(q => {
    const qBucket = resolveQuestionBucket(q);
    const qClsNum = extractClassNumber(
      q.classGroup || q.classRange || q.targetClass || q.studentClass || q.class || ""
    );
    const qSubNorm = normalizeSubjectLabel(q.subject || "").toLowerCase();

    if (clsNum >= 1 && clsNum <= 10) {
      const sameClass = qBucket === `class-${clsNum}` || qClsNum === clsNum;
      if (!sameClass) return false;
      if (specificSubjectFilter && qSubNorm !== specificSubjectFilter) return false;
      return true;
    }

    if (clsNum >= 11 && clsNum <= 12) {
      if (studentBucket.endsWith("-maths")) {
        const validBucket =
          qBucket === `class-${clsNum}-maths` ||
          qBucket === `class-${clsNum}` ||
          qBucket === "11-12-maths";
        const allowedSub =
          !qSubNorm ||
          qSubNorm === "general" ||
          SENIOR_MATHS_SUBJECTS.map(x => x.toLowerCase()).includes(qSubNorm);
        if (!validBucket || !allowedSub) return false;
        if (specificSubjectFilter && qSubNorm !== specificSubjectFilter) return false;
        return true;
      }

      if (studentBucket.endsWith("-biology")) {
        const validBucket =
          qBucket === `class-${clsNum}-biology` ||
          qBucket === `class-${clsNum}` ||
          qBucket === "11-12-biology";
        const allowedSub =
          !qSubNorm ||
          qSubNorm === "general" ||
          SENIOR_BIO_SUBJECTS.map(x => x.toLowerCase()).includes(qSubNorm);
        if (!validBucket || !allowedSub) return false;
        if (specificSubjectFilter && qSubNorm !== specificSubjectFilter) return false;
        return true;
      }
    }

    return false;
  });
}

function fetchPortalConfig() {
  const statusMsg = document.getElementById("portal-status-msg");
  const regView = document.getElementById("registration-view");
  const examView = document.getElementById("exam-login-view");
  const resultView = document.getElementById("result-view");

  [regView, examView, resultView].forEach(v => v?.classList.add("hidden"));

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        portalConfigData = data.config || {};
        activeUpiString = String(portalConfigData.adminUpiId || "narmada@upi").trim();
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
            statusMsg.textContent = "🔴 Portal is currently offline / locked by NVMSO.";
            statusMsg.style.color = "#ef4444";
          }
        }
      }
    })
    .catch(() => {
      if (statusMsg) statusMsg.textContent = "Server Connection Offline";
    });
}

window.fetchSchoolName = function (val) {
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
    body: JSON.stringify({ orgCode: val.trim().toUpperCase() })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        if (display) {
          display.innerHTML = `✅ School Authorized: <strong style="color:#10b981;">${escapeHtml(data.schoolName)}</strong>`;
        }
        if (modeBadge) {
          modeBadge.innerText = `EXAM CONDUCT MODE: ${String(data.examMode || "online").toUpperCase()}`;
        }
        isOrganizerVerified = true;
        verifiedOrgExamMode = data.examMode || "online";
        if (document.getElementById("payment-mode")?.value === "online" && onlineSection) {
          onlineSection.style.display = "block";
        }
        renderDynamicUPIQR();
      } else {
        if (display) display.innerText = "❌ Invalid Organizer Code!";
        isOrganizerVerified = false;
        if (onlineSection) onlineSection.style.display = "none";
      }
    })
    .catch(() => {
      if (display) display.innerText = "⚠️ Unable to verify code right now.";
      isOrganizerVerified = false;
    });
};

function renderDynamicUPIQR() {
  const qrBox = document.getElementById("dynamic-qr-container");
  if (!qrBox) return;
  qrBox.innerHTML = "";
  if (!isOrganizerVerified) return;
  const fee =
    verifiedOrgExamMode === "offline"
      ? Number(portalConfigData.offlineFee) || 120
      : Number(portalConfigData.onlineFee) || 100;
  const upiUrl = buildSafeUpiUri(activeUpiString, "NVMSO", fee);
  if (upiUrl && typeof QRCode !== "undefined") {
    new QRCode(qrBox, { text: upiUrl, width: 160, height: 160 });
  }
}

window.openDirectUpiApp = function () {
  if (!isOrganizerVerified) {
    alert("Verify School Organizer Code first!");
    return;
  }
  const fee =
    verifiedOrgExamMode === "offline"
      ? Number(portalConfigData.offlineFee) || 120
      : Number(portalConfigData.onlineFee) || 100;
  const upiUrl = buildSafeUpiUri(activeUpiString, "NVMSO", fee);
  if (!upiUrl) {
    alert("⚠️ UPI payment configuration is unavailable right now.");
    return;
  }
  window.location.href = upiUrl;
};

window.showReviewDetailsModal = function () {
  if (!isOrganizerVerified) {
    alert("⚠️ Enter valid School Organizer Code first!");
    return;
  }
  const fields = ["org-code", "std-name", "std-mother", "std-father", "std-class", "std-roll", "std-contact"];
  for (const id of fields) {
    if (!document.getElementById(id)?.value.trim()) {
      alert("❌ Please fill out all required fields!");
      return;
    }
  }

  const schoolNameDisplayElem = document.getElementById("school-name-display");
  const schoolFullName = schoolNameDisplayElem
    ? schoolNameDisplayElem.textContent.replace("✅ School Authorized: ", "")
    : document.getElementById("org-code").value.toUpperCase();
  const selectedClassVal = document.getElementById("std-class").value;
  const isSenior = extractClassNumber(selectedClassVal) >= 11;
  const streamVal = isSenior ? document.getElementById("std-stream")?.value || "" : "";
  const subjectVal = isSenior ? document.getElementById("std-subject")?.value || "" : "";

  const streamRow = isSenior
    ? `<div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
        <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Stream / Subject :-</span>
        <strong style="color: #c084fc;">${escapeHtml(streamVal)}${subjectVal ? ` (${escapeHtml(subjectVal)})` : ""}</strong>
      </div>`
    : "";

  const reviewHtml = `
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">School Name :-</span> 
      <strong style="color: #4ade80;">${escapeHtml(schoolFullName)}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Coordinator Code :-</span> 
      <strong style="color: #38bdf8;">${escapeHtml(document.getElementById("org-code").value.toUpperCase())}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Student Name :-</span> 
      <strong style="color: #fff;">${escapeHtml(document.getElementById("std-name").value)}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Mother's Name :-</span> 
      <strong style="color: #fff;">${escapeHtml(document.getElementById("std-mother").value)}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Father's Name :-</span> 
      <strong style="color: #fff;">${escapeHtml(document.getElementById("std-father").value)}</strong>
    </div>
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Class :-</span> 
      <strong style="color: #facc15;">Class ${escapeHtml(selectedClassVal)}</strong>
    </div>
    ${streamRow}
    <div style="display: flex; gap: 12px; margin-bottom: 10px; border-bottom: 1px dashed #334155; padding-bottom: 8px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Roll Number :-</span> 
      <strong style="color: #38bdf8;">${escapeHtml(document.getElementById("std-roll").value)}</strong>
    </div>
    <div style="display: flex; gap: 12px; text-align: left;">
      <span style="color: #94a3b8; width: 140px; flex-shrink: 0;">Contact Number :-</span> 
      <strong style="color: #fff;">${escapeHtml(document.getElementById("std-contact").value)}</strong>
    </div>
  `;
  document.getElementById("review-content").innerHTML = reviewHtml;
  document.getElementById("details-section").style.display = "none";
  document.getElementById("review-section").style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.backToEditDetails = function () {
  document.getElementById("review-section").style.display = "none";
  document.getElementById("details-section").style.display = "block";
};

window.proceedToPaymentFromReview = function () {
  document.getElementById("review-section").style.display = "none";
  document.getElementById("payment-section").style.display = "block";
  renderDynamicUPIQR();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.backToDetails = function () {
  document.getElementById("payment-section").style.display = "none";
  document.getElementById("details-section").style.display = "block";
};

window.toggleQrDisplay = function () {
  const qrDiv = document.getElementById("dynamic-qr-container");
  if (!qrDiv) return;
  qrDiv.style.display =
    qrDiv.style.display === "none" || qrDiv.style.display === "" ? "flex" : "none";
};

window.submitStudentRegistration = function () {
  const payMode = document.getElementById("payment-mode")?.value || "online";
  const utrInput = document.getElementById("std-utr") ? document.getElementById("std-utr").value.trim() : "";

  if (payMode === "online" && (!utrInput || utrInput.length < 6)) {
    alert("❌ Error: Online payment selected! Please enter a valid UTR / Transaction Reference Number.");
    return;
  }

  const classVal = document.getElementById("std-class")?.value || "";
  const isSenior = extractClassNumber(classVal) >= 11;
  const streamVal = isSenior ? document.getElementById("std-stream")?.value || "" : "";
  const subjectVal = isSenior ? document.getElementById("std-subject")?.value || streamVal : "";

  const payload = {
    orgCode: (document.getElementById("org-code")?.value || "").trim().toUpperCase(),
    studentName: (document.getElementById("std-name")?.value || "").trim(),
    motherName: (document.getElementById("std-mother")?.value || "").trim(),
    fatherName: (document.getElementById("std-father")?.value || "").trim(),
    studentClass: classVal,
    rollNumber: (document.getElementById("std-roll")?.value || "").trim(),
    stream: streamVal,
    subject: subjectVal,
    contactNumber: (document.getElementById("std-contact")?.value || "").trim(),
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
      if (data && data.status === "success") {
        alert("🎉 Registration Submitted Successfully!");
        location.reload();
      } else {
        alert("❌ Error: " + (data?.message || "Registration failed"));
      }
    })
    .catch(() => alert("❌ Network error while submitting registration."));
};

window.verifyStudentLoginAndStartExam = function () {
  const orgCode = (document.getElementById("login-org-code")?.value || "").trim().toUpperCase();
  const roll = (document.getElementById("login-roll")?.value || "").trim();
  const password = (document.getElementById("login-password")?.value || "").trim();
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
      if (data && data.status === "success") {
        studentSessionData = data.student;

        if (studentSessionData?.examMode && String(studentSessionData.examMode).toLowerCase() === "offline") {
          alert("❌ Access Denied: Your school has selected OFFLINE mode for examinations.");
          return;
        }

        updateExamMetaDisplays();
        document.getElementById("student-auth-box")?.classList.add("hidden");
        document.getElementById("exam-instructions-modal")?.classList.remove("hidden");
      } else {
        alert("❌ Login Failed: " + (data?.message || "Invalid credentials"));
      }
    })
    .catch(() => alert("❌ Network error while logging in."));
};

window.proceedToActualExamPaper = function () {
  const agreeCheck = document.getElementById("agree-instructions");
  if (!agreeCheck?.checked) {
    alert("⚠️ Please check the box to confirm exam rules.");
    return;
  }

  isAutoSubmittingExam = false;
  isSubmittingExam = false;
  document.getElementById("exam-instructions-modal")?.classList.add("hidden");
  document.getElementById("active-exam-container")?.classList.remove("hidden");

  const clsText = studentSessionData?.studentClass ? `Class ${studentSessionData.studentClass}` : "";
  const streamText = studentSessionData?.stream ? ` (${studentSessionData.stream})` : "";
  const infoEl = document.getElementById("exam-student-info");
  if (infoEl) {
    infoEl.textContent = `Student: ${studentSessionData?.studentName || ""} | ${clsText}${streamText}`;
  }

  loadExamQuestionsForClass();
  startExamTimer(getExamDurationMinutes() * 60);
};

function loadExamQuestionsForClass() {
  const limitCount = getConfiguredQuestionLimit();
  const params = new URLSearchParams();
  if (studentSessionData?.studentClass) params.set("studentClass", studentSessionData.studentClass);
  if (studentSessionData?.stream) params.set("stream", studentSessionData.stream);
  if (studentSessionData?.subject) params.set("subject", studentSessionData.subject);

  const sessionToken = studentSessionData?.sessionToken || "";
  const url = `${SERVER_URL}/api/student/questions${params.toString() ? `?${params.toString()}` : ""}`;

  fetch(url, {
    headers: sessionToken ? { "X-Student-Token": sessionToken } : {}
  })
    .then(res => res.json())
    .then(data => {
      const qContainer = document.getElementById("exam-questions-list");
      if (!qContainer) return;
      if (data && data.status === "success" && Array.isArray(data.questions)) {
        const matched = filterQuestionsForStudent(data.questions, studentSessionData);
        currentExamQuestions = matched.slice(0, limitCount);
        updateExamMetaDisplays(currentExamQuestions.length);

        qContainer.innerHTML = "";
        if (!currentExamQuestions.length) {
          qContainer.innerHTML = `<p style="color:#f87171; text-align:center; padding:16px;">No questions available for your class/stream yet.</p>`;
          return;
        }

        currentExamQuestions.forEach((q, idx) => {
          const qId = escapeHtml(q.id);
          const subBadge = q.subject ? ` <span style="font-size:11px; color:#0284c7;">[${escapeHtml(q.subject)}]</span>` : "";
          qContainer.innerHTML += `
            <div style="background: #ffffff; border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 12px; color: #333;">
              <p style="color: #1e3c72; font-weight: bold; margin-bottom: 8px;">Q${idx + 1}.${subBadge} ${escapeHtml(q.questionText || q.question || "")}</p>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label><input type="radio" name="q_${qId}" value="A"> A) ${escapeHtml(q.optionA)}</label>
                <label><input type="radio" name="q_${qId}" value="B"> B) ${escapeHtml(q.optionB)}</label>
                <label><input type="radio" name="q_${qId}" value="C"> C) ${escapeHtml(q.optionC)}</label>
                <label><input type="radio" name="q_${qId}" value="D"> D) ${escapeHtml(q.optionD)}</label>
              </div>
            </div>
          `;
        });
      }
    })
    .catch(() => {});
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
      if (!isAutoSubmittingExam && !isSubmittingExam) {
        isAutoSubmittingExam = true;
        alert("⏰ Time limit khatam ho gayi hai! Aapka paper automatically submit kiya ja raha hai.");
        window.submitExamAnswers(true);
      }
    }
  }, 1000);
}

window.submitExamAnswers = function (isAutoSubmit = false) {
  if (isSubmittingExam) return;
  if (!isAutoSubmit && !isAutoSubmittingExam) {
    if (!confirm("Are you sure you want to submit your exam answers?")) return;
  }
  if (examTimerInterval) {
    clearInterval(examTimerInterval);
    examTimerInterval = null;
  }

  isSubmittingExam = true;
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

  const sessionToken = studentSessionData?.sessionToken || "";

  fetch(`${SERVER_URL}/api/student/submit_exam`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { "X-Student-Token": sessionToken } : {})
    },
    body: JSON.stringify({
      studentId: studentSessionData?.studentId,
      sessionToken: sessionToken,
      answers: answers,
      totalQuestions: currentExamQuestions.length || getConfiguredQuestionLimit(),
      autoSubmitted: !!isAutoSubmit
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert(isAutoSubmit ? "⏰ Time over! Exam auto-submitted successfully." : "✅ Exam Submitted Successfully!");
        location.reload();
      } else {
        isSubmittingExam = false;
        isAutoSubmittingExam = false;
        alert("❌ Error: " + (data?.message || "Failed to submit exam"));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "📤 Submit Final Exam Answers";
        }
      }
    })
    .catch(() => {
      isSubmittingExam = false;
      isAutoSubmittingExam = false;
      alert("❌ Network error while submitting exam.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "📤 Submit Final Exam Answers";
      }
    });
};

function renderSubjectWiseScorecard(resData) {
  const detailsEl = document.getElementById("scorecard-candidate-details");
  const tbodyEl = document.getElementById("scorecard-subject-tbody");
  const tfootEl = document.getElementById("scorecard-subject-tfoot");
  const summaryEl = document.getElementById("scorecard-final-summary");

  const maxMarks = Number(resData.totalMarks || resData.totalQuestions || getConfiguredQuestionLimit() || 30);
  const scoreVal = Number(resData.score ?? 0);
  const pctVal =
    resData.percentage !== undefined && resData.percentage !== null
      ? Number(resData.percentage)
      : maxMarks > 0
      ? Number(((scoreVal / maxMarks) * 100).toFixed(2))
      : 0;

  const streamLabel = resData.stream ? ` (${escapeHtml(resData.stream)})` : "";

  if (detailsEl) {
    detailsEl.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <tr>
          <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:700; width:22%;">Candidate Name</td>
          <td style="padding:5px 8px; border:1px solid #cbd5e1; width:28%;">${escapeHtml(resData.studentName || "-")}</td>
          <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:700; width:22%;">Roll Number</td>
          <td style="padding:5px 8px; border:1px solid #cbd5e1; width:28%;">${escapeHtml(resData.rollNumber || "-")}</td>
        </tr>
        <tr>
          <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:700;">Class &amp; Stream</td>
          <td style="padding:5px 8px; border:1px solid #cbd5e1;">Class ${escapeHtml(resData.studentClass || "-")}${streamLabel}</td>
          <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:700;">School Code</td>
          <td style="padding:5px 8px; border:1px solid #cbd5e1;">${escapeHtml(resData.orgCode || "-")}</td>
        </tr>
        <tr>
          <td style="padding:5px 8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:700;">School Name</td>
          <td colspan="3" style="padding:5px 8px; border:1px solid #cbd5e1;">${escapeHtml(resData.schoolName || resData.orgCode || "-")}</td>
        </tr>
      </table>
    `;
  }

  const breakdown = Array.isArray(resData.subjectBreakdown)
    ? resData.subjectBreakdown
    : resData.subjectBreakdown && typeof resData.subjectBreakdown === "object"
    ? Object.entries(resData.subjectBreakdown).map(([subject, stats]) => ({ subject, ...(stats || {}) }))
    : [];

  let sumQs = 0;
  let sumRight = 0;
  let sumWrong = 0;
  let sumObtained = 0;
  let sumMax = 0;

  if (tbodyEl) {
    if (breakdown.length) {
      tbodyEl.innerHTML = breakdown
        .map(row => {
          const subName = normalizeSubjectLabel(row.subject || row.name || "Subject");
          const qCount = Number(row.totalQuestions ?? row.questions ?? 0);
          const rightCount = Number(row.right ?? row.correct ?? 0);
          const wrongCount = Number(row.wrong ?? row.incorrect ?? 0);
          const obtained = Number(row.obtainedMarks ?? row.score ?? row.marks ?? 0);
          const rowMax = Number(row.maxMarks ?? row.totalMarks ?? qCount ?? 0);

          sumQs += qCount;
          sumRight += rightCount;
          sumWrong += wrongCount;
          sumObtained += obtained;
          sumMax += rowMax;

          return `
            <tr>
              <td style="border:1px solid #cbd5e1; padding:7px 8px; text-align:left; font-weight:700;">${escapeHtml(subName)}</td>
              <td style="border:1px solid #cbd5e1; padding:7px 8px;">${escapeHtml(qCount)}</td>
              <td style="border:1px solid #cbd5e1; padding:7px 8px; color:#15803d; font-weight:700;">${escapeHtml(rightCount)}</td>
              <td style="border:1px solid #cbd5e1; padding:7px 8px; color:#b91c1c; font-weight:700;">${escapeHtml(wrongCount)}</td>
              <td style="border:1px solid #cbd5e1; padding:7px 8px; font-weight:700;">${escapeHtml(obtained)}</td>
              <td style="border:1px solid #cbd5e1; padding:7px 8px;">${escapeHtml(rowMax)}</td>
            </tr>
          `;
        })
        .join("");
    } else {
      const subName = resData.subject ? normalizeSubjectLabel(resData.subject) : "Overall Examination";
      sumQs = Number(resData.totalQuestions || maxMarks);
      sumRight = Number(resData.correctCount ?? "-");
      sumWrong = Number(resData.wrongCount ?? "-");
      sumObtained = scoreVal;
      sumMax = maxMarks;

      tbodyEl.innerHTML = `
        <tr>
          <td style="border:1px solid #cbd5e1; padding:7px 8px; text-align:left; font-weight:700;">${escapeHtml(subName)}</td>
          <td style="border:1px solid #cbd5e1; padding:7px 8px;">${escapeHtml(sumQs)}</td>
          <td style="border:1px solid #cbd5e1; padding:7px 8px; color:#15803d; font-weight:700;">${escapeHtml(sumRight)}</td>
          <td style="border:1px solid #cbd5e1; padding:7px 8px; color:#b91c1c; font-weight:700;">${escapeHtml(sumWrong)}</td>
          <td style="border:1px solid #cbd5e1; padding:7px 8px; font-weight:700;">${escapeHtml(sumObtained)}</td>
          <td style="border:1px solid #cbd5e1; padding:7px 8px;">${escapeHtml(sumMax)}</td>
        </tr>
      `;
    }
  }

  if (tfootEl) {
    const footObtained = breakdown.length ? sumObtained : scoreVal;
    const footMax = breakdown.length && sumMax > 0 ? sumMax : maxMarks;
    tfootEl.innerHTML = `
      <tr style="background:#e2e8f0; font-weight:800; color:#0f172a;">
        <td style="border:1px solid #0f172a; padding:8px; text-align:left;">GRAND TOTAL</td>
        <td style="border:1px solid #0f172a; padding:8px;">${escapeHtml(sumQs || footMax)}</td>
        <td style="border:1px solid #0f172a; padding:8px; color:#15803d;">${escapeHtml(breakdown.length ? sumRight : "-")}</td>
        <td style="border:1px solid #0f172a; padding:8px; color:#b91c1c;">${escapeHtml(breakdown.length ? sumWrong : "-")}</td>
        <td style="border:1px solid #0f172a; padding:8px;">${escapeHtml(footObtained)}</td>
        <td style="border:1px solid #0f172a; padding:8px;">${escapeHtml(footMax)}</td>
      </tr>
    `;
  }

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="font-size:13px;">
        <strong>Total Marks Obtained:</strong>
        <span style="font-size:15px; font-weight:800; color:#0f172a;">${escapeHtml(scoreVal)} / ${escapeHtml(maxMarks)}</span>
      </div>
      <div style="font-size:14px; background:#0f172a; color:#facc15; padding:6px 14px; border-radius:4px; font-weight:800;">
        PERCENTAGE: ${escapeHtml(pctVal)}%
      </div>
    `;
  }
}

window.printStudentScorecard = function () {
  const sheet = document.getElementById("official-scorecard-sheet");
  if (!sheet) return;
  const win = window.open("", "_blank", "width=820,height=700");
  if (!win) {
    window.print();
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>NVMSO 2026 Result Scorecard</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body>${escapeHtml(sheet.innerHTML) ? sheet.outerHTML : ""}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 200);
};

window.fetchStudentResult = function () {
  const orgCode = (document.getElementById("res-org-code")?.value || "").trim().toUpperCase();
  const roll = (document.getElementById("res-roll")?.value || "").trim();
  const scorecardBox = document.getElementById("student-scorecard-box");
  const officialSheet = document.getElementById("official-scorecard-sheet");
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
      if (!scorecardBox) return;
      scorecardBox.style.display = "block";
      if (data && data.status === "success" && data.result) {
        if (officialSheet) officialSheet.classList.remove("hidden");
        renderSubjectWiseScorecard(data.result);
      } else {
        if (officialSheet) officialSheet.classList.add("hidden");
        scorecardBox.innerHTML = `<p style="color: #d9534f; text-align: center; padding: 20px;">❌ ${escapeHtml(data?.message || "Result not found")}</p>`;
      }
    })
    .catch(() => {
      if (scorecardBox) {
        if (officialSheet) officialSheet.classList.add("hidden");
        scorecardBox.style.display = "block";
        scorecardBox.innerHTML = `<p style="color: #d9534f; text-align: center; padding: 20px;">❌ Network error while fetching result.</p>`;
      }
    });
};

window.handlePaymentModeChange = mode => {
  const onlineSec = document.getElementById("online-payment-section");
  if (onlineSec) {
    onlineSec.style.display = mode === "online" && isOrganizerVerified ? "block" : "none";
  }
};

window.handleStreamChange = streamVal => {
  const subjectSelect = document.getElementById("std-subject");
  if (!subjectSelect) return;
  const isBio = String(streamVal || "").toLowerCase().includes("bio");
  const list = isBio ? SENIOR_BIO_SUBJECTS : SENIOR_MATHS_SUBJECTS;
  subjectSelect.innerHTML = list
    .map(sub => `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`)
    .join("");
};

window.handleClassChange = val => {
  const isSenior = extractClassNumber(val) >= 11;
  document.getElementById("senior-stream-container")?.classList.toggle("hidden", !isSenior);
  document.getElementById("stream-group")?.classList.toggle("hidden", !isSenior);
  document.getElementById("subject-group")?.classList.toggle("hidden", !isSenior);
  if (isSenior && typeof window.handleStreamChange === "function") {
    window.handleStreamChange(document.getElementById("std-stream")?.value || "Maths");
  }
};
