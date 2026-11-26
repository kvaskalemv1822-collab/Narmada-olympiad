const SERVER_URL = "https://nvmso-backend.onrender.com";
const ADMIN_TOKEN_KEY = "nvmso_admin_token";

let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
let allStudentsCache = [];
let allOrganizersCache = [];
let pendingSettlementsCache = [];
let pendingPayoutsCache = [];
let centralPortalConfig = {};
let autoRefreshTimer = null;

function int(val) {
  return Math.floor(Number(val) || 0);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAdminHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
  return headers;
}

function showAdminPanelView() {
  const authSec = document.getElementById("admin-auth-section");
  const adminView = document.getElementById("admin-view");
  if (authSec) authSec.classList.add("hidden");
  if (adminView) adminView.classList.remove("hidden");
}

function showAdminLoginView() {
  const authSec = document.getElementById("admin-auth-section");
  const adminView = document.getElementById("admin-view");
  if (adminView) adminView.classList.add("hidden");
  if (authSec) authSec.classList.remove("hidden");
}

function getConfiguredTotalQuestions(student) {
  const fromStudent = Number(student?.totalQuestions || student?.totalMarks);
  if (fromStudent > 0) return fromStudent;
  const fromInput = Number(document.getElementById("cfg-total-questions")?.value);
  if (fromInput > 0) return fromInput;
  const fromConfig = Number(centralPortalConfig?.totalQuestions || centralPortalConfig?.questionCount);
  if (fromConfig > 0) return fromConfig;
  return 30;
}

function getSubjectBadge(student) {
  const rawSub = String(
    student?.subject ||
    student?.examSubject ||
    student?.stream ||
    student?.selectedSubject ||
    student?.course ||
    ""
  )
    .trim()
    .toLowerCase();

  if (rawSub === "m" || rawSub.startsWith("math") || rawSub.includes("maths")) {
    return ` <span style="color:#38bdf8; font-weight:800;">(M)</span>`;
  }
  if (rawSub === "s" || rawSub.startsWith("sci")) {
    return ` <span style="color:#4ade80; font-weight:800;">(S)</span>`;
  }
  return "";
}

function getOrganizerPayoutUpi(org) {
  const code = String(org?.code || org?.orgCode || "").trim().toUpperCase();
  const fromObj = String(org?.upiId || org?.payoutUpi || org?.upi || "").trim();
  const fromLocal = code ? String(localStorage.getItem(`nvmso_org_upi_${code}`) || "").trim() : "";
  return fromObj || fromLocal || "";
}

document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("nvmso_admin_logged") === "true" && adminToken) {
    showAdminPanelView();
    initializeCentralPanelData();
  } else {
    showAdminLoginView();
  }
});

window.verifyAdminPassword = async () => {
  const passInputEl = document.getElementById("admin-pass-input");
  const alertBox = document.getElementById("login-security-alert");
  const submitBtn = document.getElementById("btn-admin-auth");
  const passInput = passInputEl ? passInputEl.value.trim() : "";

  if (!passInput) {
    if (alertBox) {
      alertBox.textContent = "⚠️ Please enter Master Admin Password.";
      alertBox.style.display = "block";
    }
    return;
  }

  if (alertBox) alertBox.style.display = "none";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Authenticating...";
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/admin/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passInput })
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 200 && data && data.status === "success" && data.token) {
      adminToken = data.token;
      sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
      sessionStorage.setItem("nvmso_admin_logged", "true");
      showAdminPanelView();
      initializeCentralPanelData();
      return;
    }

    if (res.status === 401 || data?.status === "unauthorized") {
      if (alertBox) {
        alertBox.textContent = "❌ Wrong password!";
        alertBox.style.display = "block";
      }
    } else if (res.status === 429 || data?.status === "rate_limited") {
      if (alertBox) {
        alertBox.textContent = "⏳ Too many wrong attempts. Try again after a few minutes.";
        alertBox.style.display = "block";
      }
    } else {
      if (alertBox) {
        alertBox.textContent = `❌ ${data?.message || "Authentication failed."}`;
        alertBox.style.display = "block";
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = "❌ Server connection error. Please try again.";
      alertBox.style.display = "block";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Authenticate Panel";
    }
  }
};

function initializeCentralPanelData() {
  if (!adminToken) return;

  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        const config = data.config || {};
        centralPortalConfig = config;

        if (document.getElementById("cfg-online-fee")) {
          document.getElementById("cfg-online-fee").value = config.onlineFee ?? 100;
        }
        if (document.getElementById("cfg-offline-fee")) {
          document.getElementById("cfg-offline-fee").value = config.offlineFee ?? 120;
        }
        if (document.getElementById("cfg-total-questions")) {
          document.getElementById("cfg-total-questions").value =
            config.totalQuestions || config.questionCount || 30;
        }
        if (document.getElementById("cfg-exam-duration")) {
          document.getElementById("cfg-exam-duration").value =
            config.examDurationMinutes || config.paperTimeLimit || 30;
        }
        if (document.getElementById("cfg-admin-upi") && config.adminUpiId) {
          document.getElementById("cfg-admin-upi").value = config.adminUpiId;
        }
        if (document.getElementById("cfg-reg-open")) {
          document.getElementById("cfg-reg-open").checked = !!config.isRegistrationOpen;
        }
        if (document.getElementById("cfg-exam-active")) {
          document.getElementById("cfg-exam-active").checked = !!config.isExamActive;
        }
        if (document.getElementById("cfg-result-declared")) {
          document.getElementById("cfg-result-declared").checked = !!config.isResultDeclared;
        }
        if (document.getElementById("cfg-broadcast-notice")) {
          document.getElementById("cfg-broadcast-notice").value = config.broadcastNotice || "";
        }

        setupSmartSwitchesExclusiveRule();
        fetchAllCentralData();

        if (!autoRefreshTimer) {
          autoRefreshTimer = setInterval(() => {
            if (adminToken) fetchAllCentralData();
          }, 8000);
        }
      }
    })
    .catch(() => {});
}

function setupSmartSwitchesExclusiveRule() {
  const regChk = document.getElementById("cfg-reg-open");
  const examChk = document.getElementById("cfg-exam-active");
  const resultChk = document.getElementById("cfg-result-declared");

  if (regChk && examChk && resultChk) {
    regChk.addEventListener("change", () => {
      if (regChk.checked) {
        examChk.checked = false;
        resultChk.checked = false;
      }
    });
    examChk.addEventListener("change", () => {
      if (examChk.checked) {
        regChk.checked = false;
        resultChk.checked = false;
      }
    });
    resultChk.addEventListener("change", () => {
      if (resultChk.checked) {
        regChk.checked = false;
        examChk.checked = false;
      }
    });
  }
}

window.savePortalConfig = async () => {
  if (!adminToken) {
    alert("⚠️ Admin session expired. Please login again.");
    return;
  }

  const adminUpiEl = document.getElementById("cfg-admin-upi");
  const totalQuestionsVal = Number(document.getElementById("cfg-total-questions")?.value) || 30;
  const examDurationVal = Number(document.getElementById("cfg-exam-duration")?.value) || 30;

  const payload = {
    onlineFee: Number(document.getElementById("cfg-online-fee")?.value ?? 100),
    offlineFee: Number(document.getElementById("cfg-offline-fee")?.value ?? 120),
    totalQuestions: totalQuestionsVal,
    questionCount: totalQuestionsVal,
    examDurationMinutes: examDurationVal,
    paperTimeLimit: examDurationVal,
    adminUpiId: adminUpiEl ? (adminUpiEl.value.trim() || "narmada@upi") : "narmada@upi",
    isRegistrationOpen: !!document.getElementById("cfg-reg-open")?.checked,
    isExamActive: !!document.getElementById("cfg-exam-active")?.checked,
    isResultDeclared: !!document.getElementById("cfg-result-declared")?.checked,
    broadcastNotice: (document.getElementById("cfg-broadcast-notice")?.value || "").trim()
  };

  fetch(`${SERVER_URL}/api/admin/update_config`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify(payload)
  })
    .then(async res => {
      if (res.status === 401) {
        window.logoutAdminSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;
      if (data && data.status === "success") {
        centralPortalConfig = { ...centralPortalConfig, ...payload };
        alert("✅ Portal settings saved and synced!");
        renderOrganizersMatrix();
        renderStudentsTable();
      } else {
        alert("❌ Error: " + (data?.message || "Failed to update config"));
      }
    })
    .catch(() => alert("❌ Network error while saving config."));
};

function fetchAllCentralData() {
  if (!adminToken) return;

  Promise.all([
    fetch(`${SERVER_URL}/api/admin/all_data`, {
      method: "POST",
      headers: getAdminHeaders(true),
      body: JSON.stringify({})
    }).then(res => {
      if (res.status === 401) {
        window.logoutAdminSession();
        return null;
      }
      return res.json();
    }),
    fetch(`${SERVER_URL}/api/admin/financial_requests`, {
      method: "GET",
      headers: getAdminHeaders(false)
    }).then(res => {
      if (res.status === 401) {
        window.logoutAdminSession();
        return null;
      }
      return res.json();
    })
  ])
    .then(([data1, data2]) => {
      if (!data1 && !data2) return;
      if (data1 && data1.status === "success") {
        allOrganizersCache = Array.isArray(data1.organizers) ? data1.organizers : [];
        allStudentsCache = Array.isArray(data1.students) ? data1.students : [];
      }
      if (data2 && data2.status === "success") {
        pendingSettlementsCache = Array.isArray(data2.settlements) ? data2.settlements : [];
        pendingPayoutsCache = Array.isArray(data2.payouts) ? data2.payouts : [];
      }

      renderKpiCards();
      renderFinancialRequests();
      renderOrganizersMatrix();
      renderStudentsTable();
    })
    .catch(() => {});
}

function renderKpiCards() {
  const totalEl = document.getElementById("kpi-total-students");
  const approvedEl = document.getElementById("kpi-approved-students");
  const pendingEl = document.getElementById("kpi-pending-payments");
  const completedEl = document.getElementById("kpi-exams-completed");

  const approvedCount = allStudentsCache.filter(
    s => s.paymentStatus === "Approved" || s.paymentVerified === true
  ).length;
  const pendingCount = allStudentsCache.filter(
    s => s.paymentStatus && String(s.paymentStatus).includes("Pending")
  ).length;
  const completedCount = allStudentsCache.filter(s => !!s.examCompleted).length;

  if (totalEl) totalEl.textContent = allStudentsCache.length;
  if (approvedEl) approvedEl.textContent = approvedCount;
  if (pendingEl) pendingEl.textContent = pendingCount;
  if (completedEl) completedEl.textContent = completedCount;
}

function renderFinancialRequests() {
  const setBox = document.getElementById("pending-settlements-list");
  const payBox = document.getElementById("pending-payouts-list");

  if (setBox) {
    setBox.innerHTML = pendingSettlementsCache.length
      ? pendingSettlementsCache
          .map(
            s => `
          <div style="padding:6px 0; border-bottom:1px solid #1e293b;">
            <strong>${escapeHtml(s.orgCode)}</strong> — ₹${escapeHtml(s.amount)} (UTR: <code>${escapeHtml(s.utrNumber)}</code>)
            <button type="button" onclick="approveOrganizerSettlement('${escapeHtml(s.orgCode)}', '${escapeHtml(s.id)}')" style="background:#10b981; color:#020617; border:none; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-left:6px;">Approve</button>
          </div>
        `
          )
          .join("")
      : "No pending settlements.";
  }

  if (payBox) {
    payBox.innerHTML = pendingPayoutsCache.length
      ? pendingPayoutsCache
          .map(
            p => `
          <div style="padding:6px 0; border-bottom:1px solid #1e293b;">
            <strong>${escapeHtml(p.orgCode)}</strong> — ₹${escapeHtml(p.amount)} (UPI: <code>${escapeHtml(p.upiId)}</code>)
            <button type="button" onclick="completeOrganizerPayout('${escapeHtml(p.id)}')" style="background:#38bdf8; color:#020617; border:none; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-left:6px;">Complete</button>
          </div>
        `
          )
          .join("")
      : "No pending payouts.";
  }
}

function renderOrganizersMatrix() {
  const tbody = document.getElementById("organizers-matrix-body");
  if (!tbody) return;

  if (!allOrganizersCache.length) {
    tbody.innerHTML =
      "<tr><td colspan='9' style='text-align:center; color:#64748b; padding:14px;'>No school coordinators found.</td></tr>";
    return;
  }

  const onlineFeeConfig = Number(document.getElementById("cfg-online-fee")?.value) || 100;
  const offlineFeeConfig = Number(document.getElementById("cfg-offline-fee")?.value) || 120;

  tbody.innerHTML = allOrganizersCache
    .map(org => {
      const code = String(org.code || org.orgCode || "").trim().toUpperCase();
      const verifiedStudents = allStudentsCache.filter(
        s =>
          String(s.orgCode || "").trim().toUpperCase() === code &&
          (s.paymentStatus === "Approved" || s.paymentVerified === true)
      );
      const onlineRegs = verifiedStudents.filter(
        s => String(s.paymentMode || "online").toLowerCase() === "online"
      ).length;
      const cashRegs = verifiedStudents.filter(
        s =>
          String(s.paymentMode || "").toLowerCase() === "offline" ||
          String(s.paymentMode || "").toLowerCase() === "cash"
      ).length;

      const examMode = String(org.examMode || "online").toLowerCase();
      const cashGross = cashRegs * (examMode === "offline" ? offlineFeeConfig : onlineFeeConfig);
      const directComm = int(verifiedStudents.length * onlineFeeConfig * 0.15);

      let refComm = 0;
      allOrganizersCache.forEach(otherOrg => {
        const otherCode = String(otherOrg.code || otherOrg.orgCode || "").trim().toUpperCase();
        const otherRef = String(otherOrg.refCode || "").trim().toUpperCase();
        if (code && otherCode && otherCode !== code && otherRef === code) {
          const refApproved = allStudentsCache.filter(
            s =>
              String(s.orgCode || "").trim().toUpperCase() === otherCode &&
              (s.paymentStatus === "Approved" || s.paymentVerified === true)
          ).length;
          refComm += int(refApproved * onlineFeeConfig * 0.05);
        }
      });

      const isSettled = !!org.manualSettled;
      const netDue = isSettled ? 0 : Math.max(0, cashGross - (directComm + refComm));
      const orgUpi = getOrganizerPayoutUpi(org);

      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:8px;"><code>${escapeHtml(code)}</code></td>
          <td style="padding:8px;">${escapeHtml(org.schoolName || "")}</td>
          <td style="padding:8px;">${escapeHtml(org.name || "")}<br><span style="color:#94a3b8; font-size:11px;">${escapeHtml(org.contact || "")}</span></td>
          <td style="padding:8px;">${escapeHtml(examMode.toUpperCase())}<br><span style="color:#94a3b8; font-size:11px;">${escapeHtml(orgUpi || "No UPI")}</span></td>
          <td style="padding:8px; color:#4ade80; font-weight:700;">${verifiedStudents.length}</td>
          <td style="padding:8px;">${cashRegs} Cash / ${onlineRegs} On</td>
          <td style="padding:8px; color:#facc15; font-weight:700;">₹${directComm}</td>
          <td style="padding:8px; color:#c084fc; font-weight:700;">₹${refComm}</td>
          <td style="padding:8px; font-weight:700; color:${isSettled ? "#4ade80" : "#f87171"};">${isSettled ? "Settled" : `Due: ₹${netDue}`}</td>
        </tr>
      `;
    })
    .join("");
}

window.renderStudentsTable = function () {
  const tbody = document.getElementById("students-master-body");
  if (!tbody) return;

  const q = (document.getElementById("student-search-input")?.value || "").trim().toLowerCase();
  const filtered = q
    ? allStudentsCache.filter(s => {
        const hay = `${s.studentName || ""} ${s.rollNumber || ""} ${s.orgCode || ""} ${s.utrNumber || ""}`.toLowerCase();
        return hay.includes(q);
      })
    : allStudentsCache;

  if (!filtered.length) {
    tbody.innerHTML =
      "<tr><td colspan='7' style='text-align:center; color:#64748b; padding:14px;'>No matching students found.</td></tr>";
    return;
  }

  tbody.innerHTML = filtered
    .map(s => {
      const sid = escapeHtml(s.id || s.studentId || "");
      const maxQ = getConfiguredTotalQuestions(s);
      const scoreVal = parseFloat(s.score) || 0;
      const pctVal = s.percentage ?? (maxQ > 0 ? ((scoreVal / maxQ) * 100).toFixed(1) : 0);
      const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
      const isRejected = s.paymentStatus === "Rejected";

      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:8px;"><strong>${escapeHtml(s.studentName || "")}</strong>${getSubjectBadge(s)}</td>
          <td style="padding:8px;">${escapeHtml(s.orgCode || "")} / ${escapeHtml(s.rollNumber || "")}</td>
          <td style="padding:8px;">Class ${escapeHtml(s.studentClass || "")}</td>
          <td style="padding:8px;">${escapeHtml(s.paymentStatus || "Pending")}<br><code style="color:#facc15; font-size:10px;">${escapeHtml(s.utrNumber || "")}</code></td>
          <td style="padding:8px; color:#4ade80; font-weight:700;">${scoreVal}/${maxQ} (${escapeHtml(pctVal)}%)</td>
          <td style="padding:8px;">
            <input type="number" id="manual-score-${sid}" value="${scoreVal}" step="0.25" style="width:70px;">
            <button type="button" onclick="saveInlineManualScore('${sid}', ${maxQ})" style="background:#f59e0b; color:#020617; border:none; padding:4px 7px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;">Save</button>
          </td>
          <td style="padding:8px;">
            ${
              !isApproved && !isRejected
                ? `<button type="button" onclick="approveOnlinePayment('${sid}')" style="background:#10b981; color:#fff; border:none; padding:4px 7px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-right:4px;">Approve</button>
                   <button type="button" onclick="rejectOnlinePayment('${sid}')" style="background:#dc2626; color:#fff; border:none; padding:4px 7px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; margin-right:4px;">Reject</button>`
                : ""
            }
            <button type="button" onclick="triggerReExam('${sid}')" style="background:#7c3aed; color:#fff; border:none; padding:4px 7px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer;">Re-Exam</button>
          </td>
        </tr>
      `;
    })
    .join("");
};

window.saveInlineManualScore = function (studentId, maxMarks) {
  if (!adminToken) return;
  const inputEl = document.getElementById(`manual-score-${studentId}`);
  const score = parseFloat(inputEl?.value);
  if (isNaN(score) || score < 0 || score > maxMarks) {
    alert(`⚠️ Enter valid score between 0 and ${maxMarks}.`);
    return;
  }

  fetch(`${SERVER_URL}/api/admin/manual_score_entry`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId, score, totalMarks: maxMarks, totalQuestions: maxMarks })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert("✅ Score saved!");
        fetchAllCentralData();
      } else {
        alert("❌ " + (data?.message || "Failed to save score"));
      }
    });
};

window.approveOnlinePayment = function (studentId) {
  if (!adminToken || !confirm("Approve this online payment?")) return;
  fetch(`${SERVER_URL}/api/admin/approve_payment`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") fetchAllCentralData();
    });
};

window.rejectOnlinePayment = function (studentId) {
  if (!adminToken) return;
  const reason = prompt("Rejection reason:", "Invalid UTR");
  if (!reason) return;
  fetch(`${SERVER_URL}/api/admin/reject_payment`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId, reason })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") fetchAllCentralData();
    });
};

window.triggerReExam = function (studentId) {
  if (!adminToken || !confirm("Allow Re-Exam for this student?")) return;
  fetch(`${SERVER_URL}/api/admin/reexam`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") fetchAllCentralData();
    });
};

window.approveOrganizerSettlement = function (orgCode, requestId) {
  if (!adminToken || !confirm(`Approve settlement for ${orgCode}?`)) return;
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ orgCode, requestId })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") fetchAllCentralData();
    });
};

window.completeOrganizerPayout = function (payoutId) {
  if (!adminToken || !confirm("Mark payout as completed?")) return;
  fetch(`${SERVER_URL}/api/admin/complete_payout`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ payoutId })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") fetchAllCentralData();
    });
};

window.logoutAdminSession = () => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  adminToken = "";
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem("nvmso_admin_logged");
  location.reload();
};
