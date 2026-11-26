Const SERVER_URL = "https://nvmso-backend.onrender.com";
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

function getStudentExamMode(student) {
  const orgCodeUpper = String(student?.orgCode || "").trim().toUpperCase();
  const orgObj =
    allOrganizersCache.find(o => String(o.code || o.orgCode || "").trim().toUpperCase() === orgCodeUpper) || {};
  return String(orgObj.examMode || student?.examMode || "online").trim().toLowerCase();
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

// 🔄 PERSISTENT SESSION CHECK ON PAGE LOAD
document.addEventListener("DOMContentLoaded", () => {
  startLiveClockTracker();

  if (sessionStorage.getItem("nvmso_admin_logged") === "true" && adminToken) {
    const loginScreen = document.getElementById("admin-login-screen");
    const mainContainer = document.getElementById("admin-main-container");
    if (loginScreen) loginScreen.classList.add("hidden");
    if (mainContainer) mainContainer.classList.remove("hidden");
    initializeCentralPanelData();
  } else {
    sessionStorage.removeItem("nvmso_admin_logged");
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    adminToken = "";
  }
});

function startLiveClockTracker() {
  const clockEl = document.getElementById("admin-live-clock");
  if (!clockEl) return;

  const updateClock = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString() + " (" + now.toLocaleDateString() + ")";
  };

  updateClock();
  setInterval(updateClock, 1000);
}

window.verifyAdminPassword = async () => {
  const passInputEl = document.getElementById("admin-pass-input");
  const alertBox = document.getElementById("login-security-alert");
  const submitBtn = document.getElementById("btn-admin-auth");
  const passInput = passInputEl ? passInputEl.value.trim() : "";

  if (!passInput) {
    if (alertBox) {
      alertBox.textContent = "⚠️ Please input master authorization key.";
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
      triggerGrandWelcome();
      initializeCentralPanelData();
    } else if (res.status === 401 || data?.status === "unauthorized") {
      throw new Error("Wrong password");
    } else if (res.status === 429 || data?.status === "rate_limited") {
      throw new Error("Too many wrong attempts. Try again later.");
    } else {
      throw new Error(data?.message || "Master Password Verification Failed");
    }
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = `🚨 Security Alert: ${err?.message || "Master Password Verification Failed!"}`;
      alertBox.style.display = "block";
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Authenticate Panel";
    }
  }
};

function triggerGrandWelcome() {
  const loginScreen = document.getElementById("admin-login-screen");
  if (loginScreen) loginScreen.classList.add("hidden");

  const welcomeScreen = document.getElementById("grand-welcome-screen");
  const mainContainer = document.getElementById("admin-main-container");
  if (welcomeScreen) {
    welcomeScreen.classList.remove("reveal-open");
    welcomeScreen.classList.remove("hidden");
  }

  let countdown = 3;
  let progressWidth = 0;
  const countdownEl = document.getElementById("welcome-countdown");
  const progressEl = document.getElementById("welcome-progress");

  if (countdownEl) countdownEl.textContent = countdown;
  if (progressEl) progressEl.style.width = "0%";

  const progressInterval = setInterval(() => {
    progressWidth += 3.34;
    if (progressEl) {
      progressEl.style.width = `${Math.min(progressWidth, 100)}%`;
    }
  }, 100);

  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdownEl) countdownEl.textContent = Math.max(countdown, 0);
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      clearInterval(progressInterval);
      if (progressEl) progressEl.style.width = "100%";
      if (welcomeScreen) welcomeScreen.classList.add("reveal-open");
      setTimeout(() => {
        if (welcomeScreen) welcomeScreen.classList.add("hidden");
        if (mainContainer) mainContainer.classList.remove("hidden");
      }, 800);
    }
  }, 1000);
}

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
        if (document.getElementById("cfg-reg-active")) {
          document.getElementById("cfg-reg-active").checked = !!config.isRegistrationOpen;
        }
        if (document.getElementById("cfg-exam-active")) {
          document.getElementById("cfg-exam-active").checked = !!config.isExamActive;
        }
        if (document.getElementById("cfg-result-allowed")) {
          document.getElementById("cfg-result-allowed").checked = !!config.isResultDeclared;
        }
        if (document.getElementById("admin-broadcast-input")) {
          document.getElementById("admin-broadcast-input").value = config.broadcastNotice || "";
        }

        setupSmartSwitchesExclusiveRule();
        fetchAllCentralData();

        // 🔄 AUTO-REFRESH LIVE SYNC (8s poll)
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
  const regChk = document.getElementById("cfg-reg-active");
  const examChk = document.getElementById("cfg-exam-active");
  const resultChk = document.getElementById("cfg-result-allowed");

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

window.saveGlobalConfig = async () => {
  if (!adminToken) {
    alert("⚠️ Admin session expired. Please authenticate again.");
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
    isRegistrationOpen: !!document.getElementById("cfg-reg-active")?.checked,
    isExamActive: !!document.getElementById("cfg-exam-active")?.checked,
    isResultDeclared: !!document.getElementById("cfg-result-allowed")?.checked,
    broadcastNotice: (document.getElementById("admin-broadcast-input")?.value || "").trim()
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
        alert("✅ Command Dispatched: Portal phases, question count, and paper time limit updated!");
        renderMergedOrganizersTable();
        loadSchoolStudentLedger();
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

      renderMergedOrganizersTable();
      populateSchoolDropdowns();
      loadSchoolRankings();
      loadSchoolStudentLedger();
    })
    .catch(() => {});
}

function renderMergedOrganizersTable() {
  const tbody = document.getElementById("admin-organizers-rows");
  if (!tbody) return;

  if (!allOrganizersCache.length) {
    tbody.innerHTML =
      "<tr><td colspan='8' style='text-align:center; color:#64748b; padding:15px;'>No organizers registered yet.</td></tr>";
    return;
  }

  tbody.innerHTML = "";
  const onlineFeeConfig = Number(document.getElementById("cfg-online-fee")?.value) || 100;
  const offlineFeeConfig = Number(document.getElementById("cfg-offline-fee")?.value) || 120;

  allOrganizersCache.forEach(org => {
    const code = String(org.code || org.orgCode || "").trim().toUpperCase();
    const isSettled = !!org.manualSettled;

    const allSchoolStudents = allStudentsCache.filter(
      s => String(s.orgCode || "").trim().toUpperCase() === code
    );
    const verifiedStudents = allSchoolStudents.filter(
      s => s.paymentStatus === "Approved" || s.paymentVerified === true
    );

    const totalReg = verifiedStudents.length || 0;
    const pendingReviewCount = allSchoolStudents.filter(
      s => s.paymentStatus && String(s.paymentStatus).includes("Pending")
    ).length;

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
    const baseFeeTotal = totalReg * onlineFeeConfig;

    // 15% Direct Commission on this organizer's own verified registrations
    const directComm = int(baseFeeTotal * 0.15);

    // 5% Referral Commission goes to THIS organizer (referrer) from other organizers who used `code` as their refCode
    const referredOrganizers = allOrganizersCache.filter(otherOrg => {
      const otherCode = String(otherOrg.code || otherOrg.orgCode || "").trim().toUpperCase();
      const otherRefCode = String(otherOrg.refCode || "").trim().toUpperCase();
      return (
        code &&
        otherCode &&
        otherCode !== code &&
        otherRefCode.length > 0 &&
        otherRefCode !== "NONE" &&
        otherRefCode === code
      );
    });

    let refComm = 0;
    referredOrganizers.forEach(refOrg => {
      const refOrgCode = String(refOrg.code || refOrg.orgCode || "").trim().toUpperCase();
      const refOrgVerifiedStudents = allStudentsCache.filter(
        s =>
          String(s.orgCode || "").trim().toUpperCase() === refOrgCode &&
          (s.paymentStatus === "Approved" || s.paymentVerified === true)
      );
      const refBaseFeeTotal = refOrgVerifiedStudents.length * onlineFeeConfig;
      refComm += int(refBaseFeeTotal * 0.05);
    });

    const totalComm = directComm + refComm;

    const netBalance = cashGross - totalComm;
    const netCashToPortal = isSettled ? 0 : Math.max(0, netBalance);

    const sett = pendingSettlementsCache.find(
      s => String(s.orgCode || "").trim().toUpperCase() === code
    );

    let settCell = isSettled
      ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled (₹0 Due)</span>"
      : "<span style='color:#f87171;'>Pending Settlement</span>";

    if (!isSettled && sett) {
      settCell = `<code style="color:#facc15;">UTR: ${escapeHtml(sett.utrNumber)}<br>(₹${escapeHtml(sett.amount)})</code>`;
    }

    let actionCell = isSettled
      ? "<span style='color:#38bdf8; font-weight:bold;'>Completed</span>"
      : sett
      ? `<button type="button" onclick="approveOrganizerSettlement('${escapeHtml(code)}', '${escapeHtml(sett.id)}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Verify UTR</button>`
      : "Awaiting";

    const pendingBadge =
      pendingReviewCount > 0
        ? `<br><span style="font-size:9px; color:#f59e0b; font-weight:bold;">(${pendingReviewCount} Pending)</span>`
        : "";

    // Coordinator's own saved UPI ID (never fallback to admin UPI)
    const orgUpi = getOrganizerPayoutUpi(org);
    const orgLabel = org.schoolName || "Organizer";

    let directCommHtml = `₹${directComm}`;
    if (directComm > 0 && !isSettled) {
      if (orgUpi) {
        const directUpiLink = `upi://pay?pa=${encodeURIComponent(orgUpi)}&pn=${encodeURIComponent(orgLabel)}&am=${directComm}&cu=INR`;
        directCommHtml += `<br><a href="${directUpiLink}" style="background:#10b981; color:#fff; padding:2px 7px; font-size:9px; border-radius:3px; text-decoration:none; display:inline-block; margin-top:3px; font-weight:bold;">Pay</a><br><span style="font-size:9px; color:#cbd5e1; word-break:break-all;">${escapeHtml(orgUpi)}</span>`;
      } else {
        directCommHtml += `<br><span style="font-size:9px; color:#f87171; font-weight:bold;">Pay</span><br><span style="font-size:9px; color:#f87171;">No UPI</span>`;
      }
    }

    let refCommHtml = `₹${refComm}`;
    if (refComm > 0 && !isSettled) {
      if (orgUpi) {
        const refUpiLink = `upi://pay?pa=${encodeURIComponent(orgUpi)}&pn=${encodeURIComponent(orgLabel)}&am=${refComm}&cu=INR`;
        refCommHtml += `<br><a href="${refUpiLink}" style="background:#f59e0b; color:#020617; padding:2px 7px; font-size:9px; border-radius:3px; text-decoration:none; display:inline-block; margin-top:3px; font-weight:bold;">Pay</a><br><span style="font-size:9px; color:#cbd5e1; word-break:break-all;">${escapeHtml(orgUpi)}</span>`;
      } else {
        refCommHtml += `<br><span style="font-size:9px; color:#f87171; font-weight:bold;">Pay</span><br><span style="font-size:9px; color:#f87171;">No UPI</span>`;
      }
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;">
          <code style="color:#38bdf8; font-weight:bold; font-size:13px;">${escapeHtml(code)}</code><br>
          <span style="font-size:12px; color:#cbd5e1; font-weight:600;">${escapeHtml(org.schoolName || "School")}</span><br>
          <span style="background:#1e293b; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:bold; color:${examMode === "offline" ? "#fbbf24" : "#38bdf8"}">${escapeHtml(examMode.toUpperCase())}</span>
        </td>
        <td style="padding:10px;">
          <strong>${escapeHtml(org.name || org.coordinatorName || "N/A")}</strong><br>
          <span style="font-size:11px; color:#94a3b8;">${escapeHtml(org.contact || "")}</span><br>
          <span style="font-size:10px; color:${orgUpi ? "#4ade80" : "#f87171"};">UPI: ${escapeHtml(orgUpi || "Not Set")}</span>
        </td>
        <td style="padding:10px; color:#4ade80; font-weight:bold; text-align:center;">
          ${totalReg} ${pendingBadge}<br><span style="font-size:10px; color:#94a3b8;">(${onlineRegs} On / ${cashRegs} Cash)</span>
        </td>
        <td style="padding:10px; color:#facc15; font-weight:bold;">${directCommHtml}</td>
        <td style="padding:10px; color:#c084fc; font-weight:bold;">${refCommHtml}</td>
        <td style="padding:10px;">
          <strong style="color:${netCashToPortal > 0 ? "#f87171" : "#4ade80"}; font-size:14px;">₹${netCashToPortal}</strong><br>
          <span style="font-size:10px; color:#94a3b8;">Cash Held: ₹${cashGross}</span>
        </td>
        <td style="padding:10px;">${settCell}</td>
        <td style="padding:10px;">${actionCell}</td>
      </tr>
    `;
  });
}

function populateSchoolDropdowns() {
  const rankSelect = document.getElementById("ranking-school-select");
  const ledgerSelect = document.getElementById("ledger-school-select");

  const prevRankVal = rankSelect ? rankSelect.value : "ALL";
  const prevLedgerVal = ledgerSelect ? ledgerSelect.value : "ALL";

  let optionsHtml = '<option value="ALL">-- All Schools Combined --</option>';
  allOrganizersCache.forEach(org => {
    const code = org.code || org.orgCode;
    if (!code) return;
    optionsHtml += `<option value="${escapeHtml(code)}">${escapeHtml(code)} - ${escapeHtml(org.schoolName || "School")}</option>`;
  });

  if (rankSelect) {
    rankSelect.innerHTML = optionsHtml;
    if ([...rankSelect.options].some(o => o.value === prevRankVal)) {
      rankSelect.value = prevRankVal;
    }
  }
  if (ledgerSelect) {
    ledgerSelect.innerHTML = optionsHtml;
    if ([...ledgerSelect.options].some(o => o.value === prevLedgerVal)) {
      ledgerSelect.value = prevLedgerVal;
    }
  }
}

window.loadSchoolRankings = function () {
  const selectedOrg = document.getElementById("ranking-school-select")?.value || "ALL";
  const gridContainer = document.getElementById("school-rankings-grid");
  if (!gridContainer) return;

  let studentsToRank = allStudentsCache;
  if (selectedOrg !== "ALL") {
    studentsToRank = allStudentsCache.filter(
      s => String(s.orgCode || "").trim().toUpperCase() === selectedOrg.toUpperCase()
    );
  }

  const schoolMap = {};
  studentsToRank.forEach(s => {
    const code = String(s.orgCode || "UNKNOWN").trim().toUpperCase();
    if (!schoolMap[code]) schoolMap[code] = [];
    schoolMap[code].push(s);
  });

  gridContainer.innerHTML = Object.keys(schoolMap).length
    ? ""
    : "<div style='grid-column: 1 / -1; text-align: center; color: #64748b; padding: 20px;'>No ranked students found for this selection.</div>";

  Object.keys(schoolMap).forEach(code => {
    const students = schoolMap[code];
    const orgInfo =
      allOrganizersCache.find(o => String(o.code || o.orgCode || "").trim().toUpperCase() === code) || {};
    const schoolName = orgInfo.schoolName || `School Code: ${code}`;

    students.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

    const classes = students.map(s => parseInt(s.studentClass, 10)).filter(c => !isNaN(c));
    const minClass = classes.length > 0 ? Math.min(...classes) : 3;
    const maxClass = classes.length > 0 ? Math.max(...classes) : 12;
    const midClass = Math.floor((minClass + maxClass) / 2);

    const group1 = students.filter(s => {
      const c = parseInt(s.studentClass, 10);
      return c >= minClass && c <= midClass;
    });
    const group2 = students.filter(s => {
      const c = parseInt(s.studentClass, 10);
      return c > midClass && c <= maxClass;
    });

    const getRewardBadge = index => {
      const rank = index + 1;
      if (rank === 1) return `<br><span style="color:#facc15; font-size:9px; font-weight:bold;">🥇 Gold Medal + Physical Cert</span>`;
      if (rank === 2) return `<br><span style="color:#e2e8f0; font-size:9px; font-weight:bold;">🥈 Silver Medal + Physical Cert</span>`;
      if (rank === 3) return `<br><span style="color:#cd7f32; font-size:9px; font-weight:bold;">🥉 Bronze Medal + Physical Cert</span>`;
      if (rank >= 4 && rank <= 6) return `<br><span style="color:#38bdf8; font-size:9px; font-weight:bold;">📜 Physical Certificate</span>`;
      return `<br><span style="color:#94a3b8; font-size:9px; font-weight:bold;">📱 Digital Certificate</span>`;
    };

    const card = document.createElement("div");
    card.style.cssText =
      "background: rgba(2, 6, 23, 0.9); border: 1px solid #334155; border-radius: 10px; padding: 15px;";

    card.innerHTML = `
      <div style="border-bottom: 1px solid #334155; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <h4 style="margin: 0; color: #38bdf8; font-size: 15px;">🏫 ${escapeHtml(schoolName)}</h4>
        <span style="background: #1e293b; color: #facc15; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${students.length} Total</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <div style="color: #10b981; font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            Classes ${minClass} to ${midClass}
          </div>
          <table style="width: 100%; font-size: 11px; text-align: left; border-collapse: collapse;">
            <tbody>
              ${group1.length === 0
                ? `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:8px;">No records</td></tr>`
                : group1
                    .map(
                      (s, idx) => `
                  <tr style="border-bottom: 1px solid #0f172a;">
                    <td style="padding:4px 3px; color:#facc15; font-weight:bold; vertical-align:top;">#${idx + 1}</td>
                    <td style="padding:4px 3px; color:#fff; vertical-align:top;">${escapeHtml(s.studentName)}${getSubjectBadge(s)} <span style="color:#94a3b8;">(${escapeHtml(s.studentClass)})</span>${getRewardBadge(idx)}</td>
                    <td style="padding:4px 3px; text-align:right; color:#38bdf8; font-weight:bold; vertical-align:top;">${escapeHtml(s.score || 0)}</td>
                  </tr>
                `
                    )
                    .join("")}
            </tbody>
          </table>
        </div>
        <div style="background: #0b0f19; padding: 8px; border-radius: 6px; border: 1px solid #1e293b;">
          <div style="color: #38bdf8; font-size: 12px; font-weight: bold; text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #334155; padding-bottom: 4px;">
            Classes ${midClass + 1} to ${maxClass}
          </div>
          <table style="width: 100%; font-size: 11px; text-align: left; border-collapse: collapse;">
            <tbody>
              ${group2.length === 0
                ? `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:8px;">No records</td></tr>`
                : group2
                    .map(
                      (s, idx) => `
                  <tr style="border-bottom: 1px solid #0f172a;">
                    <td style="padding:4px 3px; color:#facc15; font-weight:bold; vertical-align:top;">#${idx + 1}</td>
                    <td style="padding:4px 3px; color:#fff; vertical-align:top;">${escapeHtml(s.studentName)}${getSubjectBadge(s)} <span style="color:#94a3b8;">(${escapeHtml(s.studentClass)})</span>${getRewardBadge(idx)}</td>
                    <td style="padding:4px 3px; text-align:right; color:#38bdf8; font-weight:bold; vertical-align:top;">${escapeHtml(s.score || 0)}</td>
                  </tr>
                `
                    )
                    .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
    gridContainer.appendChild(card);
  });
};

window.loadSchoolStudentLedger = function () {
  const selectedOrg = document.getElementById("ledger-school-select")?.value || "ALL";
  const tbody = document.getElementById("ledger-student-rows");
  if (!tbody) return;

  let students = allStudentsCache;
  if (selectedOrg !== "ALL") {
    students = allStudentsCache.filter(
      s => String(s.orgCode || "").trim().toUpperCase() === selectedOrg.toUpperCase()
    );
  }

  if (!students.length) {
    tbody.innerHTML =
      "<tr><td colspan='5' style='text-align:center; color:#64748b;'>No students registered under this selection.</td></tr>";
    return;
  }

  tbody.innerHTML = "";

  students.forEach(s => {
    const orgExamMode = getStudentExamMode(s);
    const isOfflineExam = orgExamMode === "offline";

    const isApproved =
      s.paymentStatus === "Approved" ||
      s.paymentStatus === "Cash Handover" ||
      s.paymentVerified === true;
    const isRejected = s.paymentStatus === "Rejected";
    const payMode = String(s.paymentMode || "online").toUpperCase();

    const maxQ = getConfiguredTotalQuestions(s);
    const scoreVal = parseFloat(s.score) || 0;
    const pctVal =
      s.percentage !== undefined && s.percentage !== null && s.percentage !== ""
        ? s.percentage
        : maxQ > 0
        ? ((scoreVal / maxQ) * 100).toFixed(1)
        : 0;

    let utrInfo = s.utrNumber
      ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${escapeHtml(s.utrNumber)}</code>`
      : "<br><span style='color:#f87171; font-size:10px;'>No UTR Provided</span>";
    if (isRejected && s.rejectionReason) {
      utrInfo += `<br><span style="color:#f87171; font-size:11px; font-weight:bold;">Reason: ${escapeHtml(s.rejectionReason)}</span>`;
    }

    let statusColor = "#f59e0b";
    if (isApproved) statusColor = "#4ade80";
    if (isRejected) statusColor = "#f87171";

    const paymentBadge = `<span style="color:${statusColor}; font-weight:bold;">${escapeHtml(s.paymentStatus || "Pending Verification")} (${escapeHtml(payMode)})</span>${utrInfo}`;

    let actionButtons = "";
    if (isOfflineExam) {
      actionButtons += `<button type="button" onclick="openManualScoreModal('${escapeHtml(s.id)}', '${escapeHtml(s.studentName)}', '${escapeHtml(s.studentClass)}', ${maxQ})" style="background:#f59e0b; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">✍️ Manual Score</button>`;
    } else {
      actionButtons += `<span style="color:#38bdf8; font-size:10px; font-weight:bold; margin-right:6px;">⚡ Auto Score</span>`;
    }
    actionButtons += `<button type="button" onclick="triggerReExam('${escapeHtml(s.id)}')" style="background:#7c3aed; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">🔄 Re-Exam</button>`;

    if (String(s.paymentMode || "").toLowerCase() === "online" && !isApproved && !isRejected) {
      actionButtons += `<button type="button" onclick="approveOnlinePayment('${escapeHtml(s.id)}')" style="background:#10b981; color:#fff; border:none; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:4px;">✔️ Approve</button>`;
      actionButtons += `<button type="button" onclick="rejectOnlinePayment('${escapeHtml(s.id)}')" style="background:#dc2626; color:#fff; border:none; padding:4px 6px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">❌ Reject</button>`;
    }

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><strong>${escapeHtml(s.studentName)}${getSubjectBadge(s)}</strong><br><span style="font-size:11px; color:#94a3b8;">Roll: ${escapeHtml(s.rollNumber)}</span></td>
        <td style="padding:10px;">Class ${escapeHtml(s.studentClass)}</td>
        <td style="padding:10px;">${paymentBadge}</td>
        <td style="padding:10px;"><strong style="color:#4ade80;">${scoreVal}/${maxQ}</strong> <span style="color:#38bdf8; font-size:11px;">(${escapeHtml(pctVal)}%)</span></td>
        <td style="padding:10px;">${actionButtons}</td>
      </tr>
    `;
  });
};

// 🛑 MANUAL SCORE ENTRY MODAL FUNCTIONS (OFFLINE EXAM MODE ONLY)
window.openManualScoreModal = function (studentId, name, studentClass, maxMarks) {
  const st = allStudentsCache.find(item => String(item.id) === String(studentId));
  if (st && getStudentExamMode(st) !== "offline") {
    alert("🔒 Manual score entry is allowed ONLY for OFFLINE exam mode students. Online scores are auto-fetched.");
    return;
  }

  const idEl = document.getElementById("modal-student-id");
  const infoEl = document.getElementById("modal-student-info");
  const scoreEl = document.getElementById("modal-score");
  const totalInput = document.getElementById("modal-total");
  const modalEl = document.getElementById("manual-score-modal");

  if (idEl) idEl.value = studentId;
  if (infoEl) infoEl.textContent = `Student: ${name} (Class ${studentClass})`;
  if (scoreEl) scoreEl.value = "";
  if (totalInput) totalInput.value = maxMarks || getConfiguredTotalQuestions();
  if (modalEl) modalEl.classList.remove("hidden");
};

window.closeManualScoreModal = () => {
  const modalEl = document.getElementById("manual-score-modal");
  if (modalEl) modalEl.classList.add("hidden");
};

window.saveManualScore = function () {
  if (!adminToken) {
    alert("⚠️ Admin session expired. Please authenticate again.");
    return;
  }

  const studentId = document.getElementById("modal-student-id")?.value;
  const st = allStudentsCache.find(item => String(item.id) === String(studentId));
  if (st && getStudentExamMode(st) !== "offline") {
    alert("🔒 Manual score entry is blocked for ONLINE exam mode students.");
    return;
  }

  const score = parseFloat(document.getElementById("modal-score")?.value);
  const total = parseFloat(document.getElementById("modal-total")?.value) || getConfiguredTotalQuestions();

  if (isNaN(score) || score < 0 || score > total) {
    alert(`⚠️ Please enter a valid score between 0 and ${total}.`);
    return;
  }

  fetch(`${SERVER_URL}/api/admin/manual_score_entry`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({
      studentId: studentId,
      score: score,
      totalMarks: total,
      totalQuestions: total
    })
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
        alert("✅ Offline student score saved successfully via Central Panel!");
        closeManualScoreModal();
        fetchAllCentralData();
      } else {
        alert("❌ Error: " + (data?.message || "Failed to save score"));
      }
    })
    .catch(() => alert("❌ Network error while saving score."));
};

window.approveOnlinePayment = function (studentId) {
  if (!adminToken) return;
  if (!confirm("Are you sure you want to approve this online payment UTR?")) return;

  fetch(`${SERVER_URL}/api/admin/approve_payment`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId: studentId })
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
        alert("✅ Online payment approved successfully!");
        fetchAllCentralData();
      } else {
        alert("❌ Error: " + (data?.message || "Failed to approve payment"));
      }
    })
    .catch(() => alert("❌ Network error while approving payment."));
};

window.rejectOnlinePayment = function (studentId) {
  if (!adminToken) return;
  const reason = prompt(
    "Enter reason for rejecting this UTR (e.g., Fake UTR / Payment not received):",
    "Fake or Invalid UTR Number"
  );
  if (!reason) return;

  fetch(`${SERVER_URL}/api/admin/reject_payment`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId: studentId, reason: reason })
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
        alert("❌ UTR rejected successfully!");
        fetchAllCentralData();
      } else {
        alert("❌ Error: " + (data?.message || "Failed to reject payment"));
      }
    })
    .catch(() => alert("❌ Network error while rejecting payment."));
};

window.triggerReExam = function (studentId) {
  if (!adminToken) return;
  if (!confirm("Reset this student's exam status to allow Re-Exam?")) return;
  fetch(`${SERVER_URL}/api/admin/reexam`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId: studentId })
  })
    .then(async res => {
      if (res.status === 401) {
        window.logoutAdminSession();
        return null;
      }
      return res.json();
    })
    .then(d => {
      if (!d) return;
      if (d && d.status === "success") {
        alert("✅ Re-Exam triggered successfully!");
        fetchAllCentralData();
      } else {
        alert("❌ Error: " + (d?.message || "Failed to trigger Re-Exam"));
      }
    })
    .catch(() => alert("❌ Network error while triggering Re-Exam."));
};

window.approveOrganizerSettlement = function (orgCode, reqId) {
  if (!adminToken) return;
  if (!confirm(`Confirm settlement approval for ${orgCode}? This will reset their Net Payable balance to ₹0.`)) return;
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ orgCode: orgCode, requestId: reqId })
  })
    .then(async res => {
      if (res.status === 401) {
        window.logoutAdminSession();
        return null;
      }
      return res.json();
    })
    .then(d => {
      if (!d) return;
      if (d && d.status === "success") {
        alert("✅ Settlement Verified & Account Reset to ₹0 Payable!");
        fetchAllCentralData();
      } else {
        alert("❌ Error: " + (d?.message || "Failed to verify settlement"));
      }
    })
    .catch(() => alert("❌ Network error while verifying settlement."));
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
