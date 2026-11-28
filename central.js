const SERVER_URL = "https://nvmso-backend.onrender.com";
const ADMIN_TOKEN_KEY = "nvmso_admin_token";
const REF_SETTLED_STORAGE_KEY = "nvmso_settled_ref_base_map";

let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
let allStudentsCache = [];
let allOrganizersCache = [];
let pendingSettlementsCache = [];
let pendingPayoutsCache = [];
let centralPortalConfig = {};
let supportTicketsCache = [];
let activeTicketId = "";
let targetOrgCodeForChat = "";
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

function escapeJsSingle(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, " ");
}

function getLocalRefSettledMap() {
  try {
    const raw = localStorage.getItem(REF_SETTLED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function setLocalRefSettledBase(orgCode, amount) {
  const code = String(orgCode || "").trim().toUpperCase();
  if (!code) return;
  const map = getLocalRefSettledMap();
  const prev = int(map[code]);
  map[code] = Math.max(prev, int(amount));
  try {
    localStorage.setItem(REF_SETTLED_STORAGE_KEY, JSON.stringify(map));
  } catch (_) {}
}

function getEffectiveSettledRefBase(org, rawRefComm) {
  const code = String(org?.code || org?.orgCode || "").trim().toUpperCase();
  const serverBase = int(org?.settledRefCommBase);
  const localMap = getLocalRefSettledMap();
  const localBase = code ? int(localMap[code]) : 0;

  let effectiveBase = Math.max(serverBase, localBase);

  const statusStr = String(org?.refPayoutStatus || org?.referralStatus || "").toLowerCase();
  if (
    effectiveBase === 0 &&
    int(org?.referralPaidOut) > 0 &&
    (statusStr === "paid" || statusStr === "settled" || org?.referralSettled === true)
  ) {
    effectiveBase = int(rawRefComm);
    if (code) setLocalRefSettledBase(code, effectiveBase);
  }

  return effectiveBase;
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

function computeOrganizerMetrics(org, onlineFeeConfig, offlineFeeConfig) {
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
  const perStudentFee = examMode === "offline" ? offlineFeeConfig : onlineFeeConfig;

  const rawOnlineGross = onlineRegs * onlineFeeConfig;
  const rawCashGross = cashRegs * perStudentFee;
  const rawDirectComm = int(totalReg * onlineFeeConfig * 0.15);

  const settledCashBase = isSettled ? int(org.settledCashBase) : 0;
  const settledDirectBase = isSettled ? int(org.settledDirectCommBase) : 0;

  const cashGross = Math.max(0, rawCashGross - settledCashBase);
  const directComm = Math.max(0, rawDirectComm - settledDirectBase);

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

  let rawRefComm = 0;
  referredOrganizers.forEach(refOrg => {
    const refOrgCode = String(refOrg.code || refOrg.orgCode || "").trim().toUpperCase();
    const refOrgVerifiedStudents = allStudentsCache.filter(
      s =>
        String(s.orgCode || "").trim().toUpperCase() === refOrgCode &&
        (s.paymentStatus === "Approved" || s.paymentVerified === true)
    );
    rawRefComm += int(refOrgVerifiedStudents.length * onlineFeeConfig * 0.05);
  });

  const settledRefBase = getEffectiveSettledRefBase(org, rawRefComm);
  const refComm = Math.max(0, rawRefComm - settledRefBase);
  const refCommPaidTotal = Math.max(0, settledRefBase);

  const netCashToPortal = Math.max(0, cashGross - directComm);
  const netCashSettledToPortal = isSettled ? Math.max(0, rawCashGross - rawDirectComm) : 0;

  const nvmsNetProfit = Math.max(0, rawOnlineGross + netCashSettledToPortal - refCommPaidTotal);

  return {
    code,
    isSettled,
    totalReg,
    pendingReviewCount,
    onlineRegs,
    cashRegs,
    examMode,
    rawOnlineGross,
    rawCashGross,
    cashGross,
    directComm,
    rawRefComm,
    settledRefBase,
    refComm,
    refCommPaidTotal,
    netCashToPortal,
    netCashSettledToPortal,
    nvmsNetProfit
  };
}

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

window.logoutAdminSession = function () {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  adminToken = "";
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  sessionStorage.removeItem("nvmso_admin_logged");
  location.reload();
};

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

    if (res.ok && data && data.status === "success" && data.token) {
      adminToken = data.token;
      sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
      sessionStorage.setItem("nvmso_admin_logged", "true");
      triggerGrandWelcome();
      initializeCentralPanelData();
    } else if (res.status === 401 || data?.status === "unauthorized") {
      throw new Error(data?.message || "Wrong password");
    } else if (res.status === 429 || data?.status === "rate_limited") {
      throw new Error(data?.message || "Too many wrong attempts. Try again later.");
    } else {
      throw new Error(data?.message || `Server responded with HTTP ${res.status}`);
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
        fetchAdminSupportTickets();

        if (!autoRefreshTimer) {
          autoRefreshTimer = setInterval(() => {
            if (adminToken) {
              fetchAllCentralData();
            }
          }, 25000);
        }
      }
    })
    .catch(() => {});
}

function setupSmartSwitchesExclusiveRule() {
  const regChk = document.getElementById("cfg-reg-active");
  const examChk = document.getElementById("cfg-exam-active");
  const resultChk = document.getElementById("cfg-result-allowed");

  if (regChk && examChk && resultChk && regChk.dataset.bound !== "1") {
    regChk.dataset.bound = "1";
    examChk.dataset.bound = "1";
    resultChk.dataset.bound = "1";

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
        renderNvmsCollectionLedger();
        loadSchoolRankings();
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
      renderNvmsCollectionLedger();
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
    const m = computeOrganizerMetrics(org, onlineFeeConfig, offlineFeeConfig);
    const code = m.code;

    const sett = pendingSettlementsCache.find(
      s => String(s.orgCode || "").trim().toUpperCase() === code
    );
    const payoutReq = pendingPayoutsCache.find(
      p => String(p.orgCode || "").trim().toUpperCase() === code
    );

    let settCell =
      m.netCashToPortal === 0 && (m.isSettled || m.cashGross === 0)
        ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Settled (₹0 Due)</span>"
        : "<span style='color:#f87171;'>Pending Settlement</span>";

    if (sett) {
      settCell = `<code style="color:#facc15;">UTR: ${escapeHtml(sett.utrNumber)}<br>(₹${escapeHtml(sett.amount)})</code>`;
    } else if (payoutReq) {
      settCell = `<code style="color:#c084fc;">Payout Req: ₹${escapeHtml(payoutReq.amount)}<br>(${escapeHtml(payoutReq.upiId || "")})</code>`;
    }

    const actionButtons = [];
    if (sett) {
      actionButtons.push(
        `<button type="button" onclick="approveOrganizerSettlement('${escapeJsSingle(code)}', '${escapeJsSingle(sett.id)}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-bottom:3px;">Verify UTR</button>`
      );
    } else if (m.netCashToPortal > 0) {
      actionButtons.push(
        `<button type="button" onclick="approveOrganizerSettlement('${escapeJsSingle(code)}', '')" style="background:#0284c7; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-bottom:3px;">Mark Settled</button>`
      );
    }

    if (m.refComm > 0) {
      actionButtons.push(
        `<button type="button" onclick="completeOrganizerPayout('${escapeJsSingle(payoutReq?.id || "")}', '${escapeJsSingle(code)}', ${m.rawRefComm})" style="background:#f59e0b; color:#020617; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer; margin-bottom:3px;">Pay Referral (₹${m.refComm})</button>`
      );
    }

    actionButtons.push(
      `<button type="button" onclick="openOrganizerChat('${escapeJsSingle(code)}')" style="background:#7e22ce; color:#fff; border:none; padding:4px 8px; font-size:10px; border-radius:4px; font-weight:bold; cursor:pointer;">💬 Chat</button>`
    );

    const actionCell = actionButtons.join("<br>");

    const pendingBadge =
      m.pendingReviewCount > 0
        ? `<br><span style="font-size:9px; color:#f59e0b; font-weight:bold;">(${m.pendingReviewCount} Pending)</span>`
        : "";

    const orgUpi = getOrganizerPayoutUpi(org);
    const orgLabel = org.schoolName || "Organizer";

    let directCommHtml = `₹${m.directComm}`;
    if (m.directComm > 0) {
      if (orgUpi) {
        const directUpiLink = `upi://pay?pa=${encodeURIComponent(orgUpi)}&pn=${encodeURIComponent(orgLabel)}&am=${m.directComm}&cu=INR`;
        directCommHtml += `<br><a href="${directUpiLink}" style="background:#10b981; color:#fff; padding:2px 7px; font-size:9px; border-radius:3px; text-decoration:none; display:inline-block; margin-top:3px; font-weight:bold;">Pay</a><br><span style="font-size:9px; color:#cbd5e1; word-break:break-all;">${escapeHtml(orgUpi)}</span>`;
      } else {
        directCommHtml += `<br><span style="font-size:9px; color:#f87171; font-weight:bold;">Pay</span><br><span style="font-size:9px; color:#f87171;">No UPI</span>`;
      }
    }

    let refCommHtml = `₹${m.refComm}`;
    if (m.refCommPaidTotal > 0) {
      refCommHtml += `<br><span style="font-size:9px; color:#4ade80;">Paid: ₹${m.refCommPaidTotal}</span>`;
    }
    if (m.refComm > 0) {
      if (orgUpi) {
        const refUpiLink = `upi://pay?pa=${encodeURIComponent(orgUpi)}&pn=${encodeURIComponent(orgLabel)}&am=${m.refComm}&cu=INR`;
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
          <span style="background:#1e293b; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:bold; color:${m.examMode === "offline" ? "#fbbf24" : "#38bdf8"}">${escapeHtml(m.examMode.toUpperCase())}</span>
        </td>
        <td style="padding:10px;">
          <strong>${escapeHtml(org.name || org.coordinatorName || "N/A")}</strong><br>
          <span style="font-size:11px; color:#94a3b8;">${escapeHtml(org.contact || "")}</span><br>
          <span style="font-size:10px; color:${orgUpi ? "#4ade80" : "#f87171"};">UPI: ${escapeHtml(orgUpi || "Not Set")}</span>
        </td>
        <td style="padding:10px; color:#4ade80; font-weight:bold; text-align:center;">
          ${m.totalReg} ${pendingBadge}<br><span style="font-size:10px; color:#94a3b8;">(${m.onlineRegs} On / ${m.cashRegs} Cash)</span>
        </td>
        <td style="padding:10px; color:#facc15; font-weight:bold;">${directCommHtml}</td>
        <td style="padding:10px; color:#c084fc; font-weight:bold;">${refCommHtml}</td>
        <td style="padding:10px;">
          <strong style="color:${m.netCashToPortal > 0 ? "#f87171" : "#4ade80"}; font-size:14px;">₹${m.netCashToPortal}</strong><br>
          <span style="font-size:10px; color:#94a3b8;">Cash Held: ₹${m.cashGross}</span>
        </td>
        <td style="padding:10px;">${settCell}</td>
        <td style="padding:10px;">${actionCell}</td>
      </tr>
    `;
  });
}

function renderNvmsCollectionLedger() {
  const summaryEl = document.getElementById("nvms-profit-summary-cards");
  const tbody = document.getElementById("nvms-collection-ledger-rows");
  if (!summaryEl || !tbody) return;

  const onlineFeeConfig = Number(document.getElementById("cfg-online-fee")?.value) || 100;
  const offlineFeeConfig = Number(document.getElementById("cfg-offline-fee")?.value) || 120;

  let totalOnlineReceived = 0;
  let totalNetCashSettled = 0;
  let totalReferralPaid = 0;
  let totalNvmsProfit = 0;

  const rowsHtml = [];

  allOrganizersCache.forEach(org => {
    const m = computeOrganizerMetrics(org, onlineFeeConfig, offlineFeeConfig);
    totalOnlineReceived += m.rawOnlineGross;
    totalNetCashSettled += m.netCashSettledToPortal;
    totalReferralPaid += m.refCommPaidTotal;
    totalNvmsProfit += m.nvmsNetProfit;

    rowsHtml.push(`
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;">
          <code style="color:#38bdf8; font-weight:bold;">${escapeHtml(m.code)}</code>
          <span style="color:#cbd5e1; margin-left:6px;">${escapeHtml(org.schoolName || "School")}</span>
        </td>
        <td style="padding:10px; color:#38bdf8; font-weight:bold;">₹${m.rawOnlineGross}</td>
        <td style="padding:10px; color:#facc15; font-weight:bold;">₹${m.netCashSettledToPortal}</td>
        <td style="padding:10px; color:#f87171; font-weight:bold;">-₹${m.refCommPaidTotal}</td>
        <td style="padding:10px; color:#4ade80; font-weight:900; font-size:14px;">₹${m.nvmsNetProfit}</td>
      </tr>
    `);
  });

  const knownCodes = new Set(
    allOrganizersCache.map(o => String(o.code || o.orgCode || "").trim().toUpperCase())
  );
  const unmappedOnlineStudents = allStudentsCache.filter(
    s =>
      (s.paymentStatus === "Approved" || s.paymentVerified === true) &&
      String(s.paymentMode || "online").toLowerCase() === "online" &&
      !knownCodes.has(String(s.orgCode || "").trim().toUpperCase())
  );

  if (unmappedOnlineStudents.length > 0) {
    const extraOnline = unmappedOnlineStudents.length * onlineFeeConfig;
    totalOnlineReceived += extraOnline;
    totalNvmsProfit += extraOnline;
    rowsHtml.push(`
      <tr style="border-bottom:1px solid #1e293b;">
        <td style="padding:10px;"><span style="color:#94a3b8;">Direct / Unassigned School</span></td>
        <td style="padding:10px; color:#38bdf8; font-weight:bold;">₹${extraOnline}</td>
        <td style="padding:10px; color:#94a3b8;">₹0</td>
        <td style="padding:10px; color:#94a3b8;">₹0</td>
        <td style="padding:10px; color:#4ade80; font-weight:900; font-size:14px;">₹${extraOnline}</td>
      </tr>
    `);
  }

  summaryEl.innerHTML = `
    <div style="background:#020617; border:1px solid #1e293b; border-radius:8px; padding:12px;">
      <div style="font-size:11px; color:#94a3b8;">Verified Online Received</div>
      <div style="font-size:18px; font-weight:800; color:#38bdf8; margin-top:4px;">₹${totalOnlineReceived}</div>
    </div>
    <div style="background:#020617; border:1px solid #1e293b; border-radius:8px; padding:12px;">
      <div style="font-size:11px; color:#94a3b8;">Net Cash Settled to NVMSO</div>
      <div style="font-size:18px; font-weight:800; color:#facc15; margin-top:4px;">₹${totalNetCashSettled}</div>
    </div>
    <div style="background:#020617; border:1px solid #1e293b; border-radius:8px; padding:12px;">
      <div style="font-size:11px; color:#94a3b8;">Referral Commissions Paid</div>
      <div style="font-size:18px; font-weight:800; color:#f87171; margin-top:4px;">-₹${totalReferralPaid}</div>
    </div>
    <div style="background:#020617; border:1px solid #16a34a; border-radius:8px; padding:12px;">
      <div style="font-size:11px; color:#86efac;">NVMSO Net Profit</div>
      <div style="font-size:20px; font-weight:900; color:#4ade80; margin-top:4px;">₹${totalNvmsProfit}</div>
    </div>
  `;

  tbody.innerHTML = rowsHtml.length
    ? rowsHtml.join("")
    : "<tr><td colspan='5' style='text-align:center; color:#64748b; padding:15px;'>No verified collection recorded yet.</td></tr>";
}

window.openOrganizerChat = function (orgCode) {
  const normalizedCode = String(orgCode || "").trim().toUpperCase();
  targetOrgCodeForChat = normalizedCode;

  const selectEl = document.getElementById("admin-chat-ticket-select");
  const bannerEl = document.getElementById("admin-chat-target-banner");
  const msgBox = document.getElementById("admin-chat-messages");
  const inputEl = document.getElementById("admin-chat-reply-input");

  const matchedTicket = supportTicketsCache.find(t => {
    const tOrg = String(t.orgCode || "").trim().toUpperCase();
    const tId = String(t.ticketId || t.id || "").trim().toUpperCase();
    return tOrg === normalizedCode || tId.includes(normalizedCode);
  });

  if (matchedTicket && selectEl) {
    const tid = String(matchedTicket.ticketId || matchedTicket.id || "").trim();
    selectEl.value = tid;
    activeTicketId = tid;
    fetchAdminTicketMessages(tid);
  } else {
    activeTicketId = "";
    if (selectEl) selectEl.value = "";
    if (msgBox) {
      msgBox.innerHTML = `<p style="color:#cbd5e1; font-size:12px; text-align:center;">No existing ticket for <strong>${escapeHtml(normalizedCode)}</strong> yet. Type a message below to reply.</p>`;
    }
  }

  if (bannerEl) {
    bannerEl.innerHTML = `Active Chat Target: <strong>${escapeHtml(normalizedCode)}</strong>`;
  }

  const chatSection = document.getElementById("support-chat-section");
  if (chatSection) {
    chatSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (inputEl) {
    setTimeout(() => inputEl.focus(), 250);
  }
};

window.fetchAdminSupportTickets = function () {
  if (!adminToken) return;
  const selectEl = document.getElementById("admin-chat-ticket-select");
  const msgBox = document.getElementById("admin-chat-messages");
  if (!selectEl || !msgBox) return;

  fetch(`${SERVER_URL}/api/admin/queries`, {
    method: "GET",
    headers: getAdminHeaders(false)
  })
    .then(async res => {
      if (res.status === 401) {
        window.logoutAdminSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data || data.status !== "success") return;
      supportTicketsCache = Array.isArray(data.queries) ? data.queries : [];
      const prevSelected = activeTicketId || selectEl.value;

      let opts = `<option value="">Select School Support Ticket (${supportTicketsCache.length})...</option>`;
      supportTicketsCache.forEach(t => {
        const tid = String(t.ticketId || t.id || "").trim();
        if (!tid) return;
        const orgTag = t.orgCode ? `[${t.orgCode}] ` : "";
        const label = `${orgTag}${t.senderName || tid}${t.lastMessage ? " - " + String(t.lastMessage).slice(0, 28) : ""}`;
        opts += `<option value="${escapeHtml(tid)}">${escapeHtml(label)}</option>`;
      });

      selectEl.innerHTML = opts;
      if (prevSelected && [...selectEl.options].some(o => o.value === prevSelected)) {
        selectEl.value = prevSelected;
        activeTicketId = prevSelected;
        fetchAdminTicketMessages(prevSelected);
      } else if (!targetOrgCodeForChat && supportTicketsCache.length > 0 && !activeTicketId) {
        const firstId = String(supportTicketsCache[0].ticketId || supportTicketsCache[0].id || "").trim();
        if (firstId) {
          selectEl.value = firstId;
          activeTicketId = firstId;
          fetchAdminTicketMessages(firstId);
        }
      }
    })
    .catch(() => {});
};

window.onAdminTicketChange = function () {
  const selectEl = document.getElementById("admin-chat-ticket-select");
  const bannerEl = document.getElementById("admin-chat-target-banner");
  const tid = String(selectEl?.value || "").trim();
  activeTicketId = tid;

  const found = supportTicketsCache.find(
    t => String(t.ticketId || t.id || "").trim() === tid
  );
  if (found && found.orgCode) {
    targetOrgCodeForChat = String(found.orgCode).trim().toUpperCase();
  }
  if (bannerEl) {
    bannerEl.innerHTML = `Active Chat Target: <strong>${escapeHtml(targetOrgCodeForChat || tid || "All Tickets")}</strong>`;
  }

  if (tid) {
    fetchAdminTicketMessages(tid);
  }
};

function fetchAdminTicketMessages(ticketId) {
  const msgBox = document.getElementById("admin-chat-messages");
  if (!msgBox || !ticketId || !adminToken) return;

  fetch(`${SERVER_URL}/api/admin/query_messages?ticketId=${encodeURIComponent(ticketId)}`, {
    method: "GET",
    headers: getAdminHeaders(false)
  })
    .then(async res => {
      if (res.status === 401) {
        window.logoutAdminSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data || data.status !== "success") return;
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      if (!msgs.length) {
        msgBox.innerHTML = `<p style="color:#64748b; font-size:12px; text-align:center;">No messages in this ticket yet.</p>`;
        return;
      }
      msgBox.innerHTML = msgs
        .map(m => {
          const sender = m.isAdmin ? "Admin" : (m.senderName || "Coordinator");
          const text = escapeHtml(m.text || m.message || "");
          const imgHtml = m.imageUrl
            ? `<div style="margin-top:6px;"><img src="${escapeHtml(m.imageUrl)}" alt="Attachment" style="max-width:180px; border-radius:6px;"></div>`
            : "";
          return `<div style="margin-bottom:8px; padding:8px; background:#0f172a; border-radius:6px; border:1px solid #1e293b;"><strong style="color:${m.isAdmin ? "#c084fc" : "#38bdf8"}; font-size:12px;">${escapeHtml(sender)}:</strong> <span style="font-size:13px; color:#e2e8f0;">${text}</span>${imgHtml}</div>`;
        })
        .join("");
      msgBox.scrollTop = msgBox.scrollHeight;
    })
    .catch(() => {});
}

window.sendAdminChatReply = function () {
  if (!adminToken) return;
  const inputEl = document.getElementById("admin-chat-reply-input");
  const selectEl = document.getElementById("admin-chat-ticket-select");
  const msg = (inputEl?.value || "").trim();
  const tid = activeTicketId || String(selectEl?.value || "").trim() || (targetOrgCodeForChat ? `TICKET_${targetOrgCodeForChat}` : "");

  if (!msg) {
    alert("⚠️ Please enter a reply message.");
    return;
  }
  if (!tid) {
    alert("⚠️ Please select a ticket or organizer first.");
    return;
  }

  fetch(`${SERVER_URL}/api/admin/reply_query`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({
      ticketId: tid,
      orgCode: targetOrgCodeForChat || undefined,
      message: msg
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
      if (data.status === "success") {
        if (inputEl) inputEl.value = "";
        activeTicketId = data.ticketId || tid;
        fetchAdminSupportTickets();
        fetchAdminTicketMessages(activeTicketId);
      } else {
        alert("❌ " + (data.message || "Failed to send reply."));
      }
    })
    .catch(() => alert("❌ Network error while sending reply."));
};

window.approveOrganizerSettlement = function (orgCode, requestId) {
  if (!adminToken) return;
  fetch(`${SERVER_URL}/api/admin/approve_settlement`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({
      orgCode: orgCode,
      requestId: requestId || ""
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
      if (data.status === "success") {
        alert("✅ Settlement approved!");
        fetchAllCentralData();
      } else {
        alert("❌ " + (data.message || "Failed to approve settlement."));
      }
    })
    .catch(() => alert("❌ Network error while approving settlement."));
};

window.completeOrganizerPayout = function (payoutId, orgCode, rawRefComm) {
  if (!adminToken) return;
  const code = String(orgCode || "").trim().toUpperCase();
  if (code && rawRefComm !== undefined) {
    setLocalRefSettledBase(code, rawRefComm);
  }

  fetch(`${SERVER_URL}/api/admin/complete_payout`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({
      payoutId: payoutId || "",
      orgCode: code,
      settledRefCommBase: int(rawRefComm)
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
      if (data.status === "success") {
        alert("✅ Referral payout marked as completed!");
        fetchAllCentralData();
      } else {
        alert("❌ " + (data.message || "Failed to complete payout."));
      }
    })
    .catch(() => alert("❌ Network error while completing payout."));
};

function populateSchoolDropdowns() {
  const rankSel = document.getElementById("ranking-school-select");
  const ledgerSel = document.getElementById("ledger-school-select");

  const prevRankVal = rankSel ? rankSel.value : "ALL";
  const prevLedgerVal = ledgerSel ? ledgerSel.value : "ALL";

  const schoolOptions = allOrganizersCache.map(org => {
    const code = String(org.code || org.orgCode || "").trim().toUpperCase();
    const label = `${code} — ${org.schoolName || "School"}`;
    return { code, label };
  });

  if (rankSel) {
    let html = `<option value="ALL">🏫 All Schools Combined</option>`;
    schoolOptions.forEach(o => {
      html += `<option value="${escapeHtml(o.code)}">${escapeHtml(o.label)}</option>`;
    });
    rankSel.innerHTML = html;
    if ([...rankSel.options].some(opt => opt.value === prevRankVal)) {
      rankSel.value = prevRankVal;
    }
  }

  if (ledgerSel) {
    let html = `<option value="ALL">📋 All Schools Ledger</option>`;
    schoolOptions.forEach(o => {
      html += `<option value="${escapeHtml(o.code)}">${escapeHtml(o.label)}</option>`;
    });
    ledgerSel.innerHTML = html;
    if ([...ledgerSel.options].some(opt => opt.value === prevLedgerVal)) {
      ledgerSel.value = prevLedgerVal;
    }
  }
}

function getStudentClassNum(student) {
  const raw = String(
    student?.studentClass ??
    student?.class ??
    student?.className ??
    student?.grade ??
    ""
  ).trim();
  const digits = raw.replace(/\D+/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function getStudentScoreNum(student) {
  const val = parseFloat(student?.score);
  return Number.isFinite(val) ? val : 0;
}

function renderRankingSplitColumn(title, rows, accentColor) {
  if (!rows.length) {
    return `
      <div style="background:#020617; border:1px solid #334155; border-radius:8px; padding:14px;">
        <h4 style="color:${accentColor}; margin:0 0 10px 0; font-size:14px;">${title}</h4>
        <p style="color:#94a3b8; font-size:12px; margin:0;">No completed exam records in this class range.</p>
      </div>
    `;
  }

  const bodyRows = rows
    .map((s, idx) => {
      const clsNum = getStudentClassNum(s);
      const maxMarks = getConfiguredTotalQuestions(s);
      const scoreVal = getStudentScoreNum(s);
      const orgTag = String(s.orgCode || s.schoolCode || "").trim().toUpperCase();

      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:8px; color:#facc15; font-weight:700;">#${idx + 1}</td>
          <td style="padding:8px;">
            <strong>${escapeHtml(s.studentName || "Student")}${getSubjectBadge(s)}</strong>
            ${orgTag ? `<br><span style="font-size:11px; color:#94a3b8;">${escapeHtml(orgTag)}</span>` : ""}
          </td>
          <td style="padding:8px; color:#38bdf8;">Class ${clsNum || escapeHtml(s.studentClass || "-")}</td>
          <td style="padding:8px; text-align:right; color:#4ade80; font-weight:700;">${scoreVal}/${maxMarks}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="background:#020617; border:1px solid #334155; border-radius:8px; padding:14px;">
      <h4 style="color:${accentColor}; margin:0 0 10px 0; font-size:14px;">${title}</h4>
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; color:#f8fafc;">
          <thead>
            <tr style="background:#1e293b; color:#cbd5e1;">
              <th style="padding:8px; text-align:left;">Rank</th>
              <th style="padding:8px; text-align:left;">Student</th>
              <th style="padding:8px; text-align:left;">Class</th>
              <th style="padding:8px; text-align:right;">Score</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

window.loadSchoolRankings = function () {
  const gridEl = document.getElementById("school-rankings-grid");
  const selectEl = document.getElementById("ranking-school-select");
  if (!gridEl) return;

  const selectedCode = String(selectEl?.value || "ALL").trim().toUpperCase();
  const filteredBySchool =
    selectedCode === "ALL"
      ? allStudentsCache
      : allStudentsCache.filter(
          s => String(s.orgCode || s.schoolCode || "").trim().toUpperCase() === selectedCode
        );

  const completed = filteredBySchool.filter(
    s => s && (s.examCompleted === true || (s.score !== undefined && s.score !== null && s.score !== ""))
  );

  const class1to6 = completed
    .filter(s => {
      const c = getStudentClassNum(s);
      return c >= 1 && c <= 6;
    })
    .sort((a, b) => getStudentScoreNum(b) - getStudentScoreNum(a));

  const class7to12 = completed
    .filter(s => {
      const c = getStudentClassNum(s);
      return c >= 7 && c <= 12;
    })
    .sort((a, b) => getStudentScoreNum(b) - getStudentScoreNum(a));

  const scopeTitle =
    selectedCode === "ALL"
      ? "All Schools Combined (Class 1 to 12)"
      : `School ${selectedCode} (Class 1 to 12)`;

  gridEl.innerHTML = `
    <div style="grid-column: 1 / -1; font-size: 13px; font-weight: 700; color: #facc15;">${escapeHtml(scopeTitle)}</div>
    ${renderRankingSplitColumn("Class 1 to 6 Rankings", class1to6, "#38bdf8")}
    ${renderRankingSplitColumn("Class 7 to 12 Rankings", class7to12, "#4ade80")}
  `;
};

window.loadSchoolStudentLedger = function () {
  const tbody = document.getElementById("ledger-student-rows");
  const selectEl = document.getElementById("ledger-school-select");
  if (!tbody) return;

  const selectedCode = String(selectEl?.value || "ALL").trim().toUpperCase();
  const list =
    selectedCode === "ALL"
      ? allStudentsCache
      : allStudentsCache.filter(
          s => String(s.orgCode || s.schoolCode || "").trim().toUpperCase() === selectedCode
        );

  if (!list.length) {
    tbody.innerHTML =
      "<tr><td colspan='5' style='text-align:center; color:#64748b; padding:15px;'>No students found for this selection.</td></tr>";
    return;
  }

  tbody.innerHTML = list
    .map(s => {
      const stId = String(s.studentId || s.id || "").trim();
      const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
      const utrHtml = s.utrNumber
        ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${escapeHtml(s.utrNumber)}</code>`
        : "";

      let marksHtml = `<span style="color:#94a3b8; font-size:11px;">Pending</span>`;
      if (s.examCompleted || (s.score !== undefined && s.score !== null && s.score !== "")) {
        const sc = parseFloat(s.score) || 0;
        const tot = getConfiguredTotalQuestions(s);
        const pct =
          s.percentage !== undefined && s.percentage !== null && s.percentage !== ""
            ? s.percentage
            : tot > 0
            ? ((sc / tot) * 100).toFixed(2)
            : 0;
        marksHtml = `<strong style="color:#4ade80;">${sc}/${tot}</strong> <span style="color:#38bdf8; font-size:11px;">(${escapeHtml(pct)}%)</span>`;
      }

      const approveBtn = !isApproved
        ? `<button type="button" onclick="approveStudentPayment('${escapeJsSingle(stId)}')" style="background:#10b981; color:#fff; border:none; padding:4px 8px; font-size:11px; border-radius:4px; cursor:pointer; margin-right:4px;">Approve</button>`
        : "";

      const scoreBtn = `<button type="button" onclick="openManualScoreModal('${escapeJsSingle(stId)}', '${escapeJsSingle(s.studentName || "")}', '${escapeJsSingle(s.studentClass || "")}')" style="background:#0284c7; color:#fff; border:none; padding:4px 8px; font-size:11px; border-radius:4px; cursor:pointer;">Score</button>`;

      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:10px;">
            <strong>${escapeHtml(s.studentName || "Student")}${getSubjectBadge(s)}</strong><br>
            <span style="font-size:11px; color:#94a3b8;">${escapeHtml(s.orgCode || "")} • Roll: ${escapeHtml(s.rollNumber || "")}</span>
          </td>
          <td style="padding:10px;">Class ${escapeHtml(s.studentClass || "-")}</td>
          <td style="padding:10px;">
            <span style="color:${isApproved ? "#4ade80" : "#f59e0b"}; font-weight:bold;">${escapeHtml(s.paymentStatus || "Pending")}</span>${utrHtml}
          </td>
          <td style="padding:10px;">${marksHtml}</td>
          <td style="padding:10px;">${approveBtn}${scoreBtn}</td>
        </tr>
      `;
    })
    .join("");
};

window.approveStudentPayment = function (studentId) {
  if (!adminToken || !studentId) return;
  fetch(`${SERVER_URL}/api/admin/approve_payment`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId })
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
      if (data.status === "success") {
        fetchAllCentralData();
      } else {
        alert("❌ " + (data.message || "Failed to approve payment."));
      }
    })
    .catch(() => alert("❌ Network error while approving payment."));
};

window.openManualScoreModal = function (studentId, studentName, studentClass) {
  const modal = document.getElementById("manual-score-modal");
  const infoEl = document.getElementById("modal-student-info");
  const idInput = document.getElementById("modal-student-id");
  const totalInput = document.getElementById("modal-total");
  const scoreInput = document.getElementById("modal-score");

  if (idInput) idInput.value = studentId;
  if (infoEl) infoEl.textContent = `${studentName} — Class ${studentClass}`;
  if (totalInput) totalInput.value = Number(document.getElementById("cfg-total-questions")?.value) || 30;
  if (scoreInput) scoreInput.value = "";
  if (modal) modal.classList.remove("hidden");
};

window.closeManualScoreModal = function () {
  document.getElementById("manual-score-modal")?.classList.add("hidden");
};

window.saveManualScore = function () {
  if (!adminToken) return;
  const studentId = String(document.getElementById("modal-student-id")?.value || "").trim();
  const score = parseFloat(document.getElementById("modal-score")?.value);
  const totalMarks = parseFloat(document.getElementById("modal-total")?.value) || 30;

  if (!studentId || Number.isNaN(score) || score < 0 || score > totalMarks) {
    alert("⚠️ Please enter a valid score within total marks.");
    return;
  }

  fetch(`${SERVER_URL}/api/admin/manual_score_entry`, {
    method: "POST",
    headers: getAdminHeaders(true),
    body: JSON.stringify({ studentId, score, totalMarks })
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
      if (data.status === "success") {
        closeManualScoreModal();
        alert("✅ Manual score saved!");
        fetchAllCentralData();
      } else {
        alert("❌ " + (data.message || "Failed to save manual score."));
      }
    })
    .catch(() => alert("❌ Network error while saving manual score."));
};
