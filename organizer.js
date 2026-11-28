const SERVER_URL = "https://nvmso-backend.onrender.com";
const ORG_TOKEN_KEY = "nvmso_org_token";

let orgToken = sessionStorage.getItem(ORG_TOKEN_KEY) || "";
let currentOrg = null;
let portalConfig = {};
let autoRefreshTimer = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getOrgHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (orgToken) headers["Authorization"] = `Bearer ${orgToken}`;
  return headers;
}

function normalizeMode(mode, fallbackMode = "online") {
  const m = String(mode ?? "").trim().toLowerCase();
  if (m === "offline" || m === "online") return m;
  const fb = String(fallbackMode ?? "").trim().toLowerCase();
  return fb === "offline" || fb === "online" ? fb : "online";
}

function getOrgCodeUpper(orgObj = currentOrg) {
  return String(orgObj?.code || orgObj?.orgCode || localStorage.getItem("nvmso_org_code") || "")
    .trim()
    .toUpperCase();
}

function getSavedUpi(codeKey) {
  const k = String(codeKey || getOrgCodeUpper()).trim().toUpperCase();
  const fromPayoutInput = (document.getElementById("payout-upi-input")?.value || "").trim();
  const fromProfileInput = (document.getElementById("org-upi-input")?.value || "").trim();
  const fromObj = String(currentOrg?.upiId || currentOrg?.payoutUpi || "").trim();
  const fromLocal = k ? String(localStorage.getItem(`nvmso_org_upi_${k}`) || "").trim() : "";
  return fromPayoutInput || fromProfileInput || fromObj || fromLocal || "";
}

function persistUpiEverywhere(upiVal, codeKey = getOrgCodeUpper()) {
  const clean = String(upiVal || "").trim();
  const k = String(codeKey || "").trim().toUpperCase();
  if (!clean) return;

  if (k) {
    localStorage.setItem(`nvmso_org_upi_${k}`, clean);
  }
  if (!currentOrg) {
    currentOrg = { code: k, orgCode: k };
  }
  currentOrg.upiId = clean;
  currentOrg.payoutUpi = clean;
}

function syncUpiInputs(upiVal, forceOverwrite = false) {
  const clean = String(upiVal || "").trim();
  const profileInput = document.getElementById("org-upi-input");
  const payoutInput = document.getElementById("payout-upi-input");
  const statusEl = document.getElementById("org-upi-status-text");
  const activeNoteEl = document.getElementById("payout-active-upi-note");

  if (profileInput && (forceOverwrite || document.activeElement !== profileInput)) {
    profileInput.value = clean;
  }
  if (payoutInput && (forceOverwrite || document.activeElement !== payoutInput)) {
    payoutInput.value = clean;
  }
  if (statusEl) {
    statusEl.textContent = clean
      ? `Saved Payout UPI: ${clean}`
      : "No UPI saved yet. Enter & save your UPI ID to request payouts.";
    statusEl.style.color = clean ? "#4ade80" : "#94a3b8";
  }
  if (activeNoteEl) {
    activeNoteEl.textContent = clean ? `Active Saved UPI: ${clean}` : "Active Saved UPI: Not set";
    activeNoteEl.style.color = clean ? "#4ade80" : "#94a3b8";
  }
}

function getConfiguredTotalMarks(student) {
  const fromStudent = Number(student?.totalMarks || student?.totalQuestions);
  if (fromStudent > 0) return fromStudent;
  const fromConfig = Number(portalConfig?.totalQuestions || portalConfig?.questionCount);
  if (fromConfig > 0) return fromConfig;
  return 30;
}

function getSubjectBadge(student) {
  const rawSub = String(
    student?.subject ||
    student?.examSubject ||
    student?.stream ||
    student?.selectedSubject ||
    ""
  )
    .trim()
    .toLowerCase();

  if (rawSub.startsWith("m") || rawSub.includes("math")) {
    return ` <span style="color:#38bdf8; font-weight:800;">(M)</span>`;
  }
  if (rawSub.startsWith("s") || rawSub.includes("sci")) {
    return ` <span style="color:#4ade80; font-weight:800;">(S)</span>`;
  }
  return "";
}

function removeTermsNearLogout() {
  const orgView = document.getElementById("org-view");
  if (!orgView) return;

  const isTermsText = txt => {
    const clean = String(txt || "").replace(/\s+/g, " ").trim().toLowerCase();
    return (
      clean === "terms and conditions" ||
      clean === "terms & conditions" ||
      clean === "terms" ||
      clean.startsWith("terms and conditions") ||
      clean.startsWith("terms & conditions")
    );
  };

  orgView.querySelectorAll("a, button, span, small, p, div").forEach(el => {
    if (el.id === "org-logout-btn" || el.closest("#org-logout-btn")) return;
    if (el.querySelector("button, input, select, textarea, table")) return;
    if (isTermsText(el.textContent)) {
      el.remove();
    }
  });

  const logoutBtn =
    document.getElementById("org-logout-btn") ||
    Array.from(orgView.querySelectorAll("button")).find(btn =>
      /log\s*out/i.test(btn.textContent || "")
    );

  if (logoutBtn && logoutBtn.parentElement) {
    Array.from(logoutBtn.parentElement.children).forEach(child => {
      if (child === logoutBtn) return;
      if (/terms/i.test(child.textContent || "")) {
        child.remove();
      }
    });
  }
}

function getLocalCycleState(codeKey) {
  if (!codeKey) return null;
  try {
    const raw = localStorage.getItem(`nvmso_org_cycle_${codeKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalCycleState(codeKey, stateObj) {
  if (!codeKey) return;
  try {
    localStorage.setItem(`nvmso_org_cycle_${codeKey}`, JSON.stringify(stateObj));
  } catch {}
}

function mergeServerOrgProfile(serverOrg, fallbackCode) {
  const codeKey = String(serverOrg?.code || serverOrg?.orgCode || fallbackCode || getOrgCodeUpper())
    .trim()
    .toUpperCase();
  const localUpi = codeKey ? (localStorage.getItem(`nvmso_org_upi_${codeKey}`) || "").trim() : "";
  const localMode = codeKey ? (localStorage.getItem(`nvmso_org_mode_${codeKey}`) || "").trim() : "";

  const resolvedMode = normalizeMode(
    serverOrg?.examMode,
    currentOrg?.examMode || localMode || "online"
  );

  const serverUpi = String(serverOrg?.upiId || serverOrg?.payoutUpi || "").trim();
  const currentUpi = String(currentOrg?.upiId || currentOrg?.payoutUpi || "").trim();
  const resolvedUpi = serverUpi || currentUpi || localUpi;

  if (codeKey && resolvedUpi) {
    localStorage.setItem(`nvmso_org_upi_${codeKey}`, resolvedUpi);
  }
  if (codeKey && resolvedMode) {
    localStorage.setItem(`nvmso_org_mode_${codeKey}`, resolvedMode);
  }

  return {
    ...(currentOrg || {}),
    ...(serverOrg || {}),
    code: codeKey,
    orgCode: codeKey,
    examMode: resolvedMode,
    upiId: resolvedUpi,
    payoutUpi: resolvedUpi
  };
}

function handleUnauthorizedSession() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  orgToken = "";
  sessionStorage.removeItem(ORG_TOKEN_KEY);
  localStorage.removeItem("nvmso_org_code");
  localStorage.removeItem("nvmso_org_pass");
  alert("🔒 Session expired or invalid. Please login again.");
  location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
  removeTermsNearLogout();
  fetchGlobalConfigAndNotice();

  const savedOrgCode = (localStorage.getItem("nvmso_org_code") || "").trim().toUpperCase();
  const savedOrgPass = (localStorage.getItem("nvmso_org_pass") || "").trim();

  if (savedOrgCode && savedOrgPass) {
    fetch(`${SERVER_URL}/api/organizer/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgCode: savedOrgCode,
        password: savedOrgPass
      })
    })
      .then(res => res.json())
      .then(response => {
        if (response && response.status === "success") {
          const d = response.data || {};
          if (d.orgToken) {
            orgToken = d.orgToken;
            sessionStorage.setItem(ORG_TOKEN_KEY, orgToken);
          }
          currentOrg = mergeServerOrgProfile(d, savedOrgCode);
          loadDashboardView();
          fetchRegisteredStudentsList();
          fetchOrganizerChatMessages();
        }
      })
      .catch(() => {});
  }
});

function applyPortalFeeLabels() {
  const onlineFee = Number(portalConfig.onlineFee) || 100;
  const offlineFee = Number(portalConfig.offlineFee) || 120;

  const optOnline = document.getElementById("opt-online-fee");
  const optOffline = document.getElementById("opt-offline-fee");
  if (optOnline) {
    optOnline.textContent = `Online Mode (Smart Smartphone/PC - ₹${onlineFee} Fee)`;
  }
  if (optOffline) {
    optOffline.textContent = `Offline Desk Mode (OMR / Physical Sheet Paper - ₹${offlineFee} Fee)`;
  }

  const activeMode = normalizeMode(
    currentOrg?.examMode ||
    document.getElementById("org-exam-mode-select")?.value ||
    "online"
  );
  const feeEl = document.getElementById("current-applicable-fee");
  if (feeEl) {
    feeEl.textContent = activeMode === "offline" ? offlineFee : onlineFee;
  }

  const baseNote = document.getElementById("commission-base-note");
  if (baseNote) {
    baseNote.textContent = `(15% Direct & 5% Referral calculated on Online Fee ₹${onlineFee} base)`;
  }
}

function fetchGlobalConfigAndNotice() {
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        portalConfig = data.config || {};
        applyPortalFeeLabels();

        const noticeBanner = document.getElementById("admin-notice-banner");
        const noticeText = document.getElementById("notice-text");
        if (portalConfig.broadcastNotice && noticeBanner && noticeText) {
          noticeText.textContent = portalConfig.broadcastNotice;
          noticeBanner.classList.remove("hidden");
        } else if (noticeBanner) {
          noticeBanner.classList.add("hidden");
        }

        if (portalConfig.isResultDeclared) {
          document.getElementById("org-result-ranking-box")?.classList.remove("hidden");
        } else {
          document.getElementById("org-result-ranking-box")?.classList.add("hidden");
        }
      }
    })
    .catch(() => {});
}

window.switchOrgTab = function (tabName) {
  const loginBox = document.getElementById("org-login-box");
  const forgotBox = document.getElementById("org-forgot-box");
  const regBox = document.getElementById("org-reg-box");

  loginBox?.classList.add("hidden");
  forgotBox?.classList.add("hidden");
  regBox?.classList.add("hidden");

  if (tabName === "forgot") {
    forgotBox?.classList.remove("hidden");
  } else if (tabName === "reg") {
    regBox?.classList.remove("hidden");
  } else {
    loginBox?.classList.remove("hidden");
  }
};

window.logoutOrganizerSession = function () {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  orgToken = "";
  currentOrg = null;
  sessionStorage.removeItem(ORG_TOKEN_KEY);
  localStorage.removeItem("nvmso_org_code");
  localStorage.removeItem("nvmso_org_pass");
  location.reload();
};

window.verifyOrgLogin = async () => {
  const code = document.getElementById("org-code-input")?.value.trim().toUpperCase() || "";
  const password = document.getElementById("org-pass-input")?.value.trim() || "";
  if (!code || !password) {
    alert("⚠️ Please enter credentials.");
    return;
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/organizer/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgCode: code, password: password })
    });
    const response = await res.json();

    if (response && response.status === "success") {
      const d = response.data || {};
      orgToken = d.orgToken || "";
      if (orgToken) {
        sessionStorage.setItem(ORG_TOKEN_KEY, orgToken);
      }
      currentOrg = mergeServerOrgProfile(d, code);
      localStorage.setItem("nvmso_org_code", code);
      localStorage.setItem("nvmso_org_pass", password);
      loadDashboardView();
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
    } else {
      alert("❌ Access Denied! Check Organizer Code or Password.");
    }
  } catch (err) {
    alert("❌ Server connection error. Please try again.");
  }
};

window.handleForgotPassword = async () => {
  const orgCode = document.getElementById("forgot-org-code")?.value.trim().toUpperCase() || "";
  const mobile = document.getElementById("forgot-mobile")?.value.trim() || "";
  const pin = document.getElementById("forgot-pin")?.value.trim() || "";
  const newPassword = document.getElementById("forgot-new-pass")?.value.trim() || "";

  if (!orgCode || !mobile || !pin) {
    alert("⚠️ Please enter Organizer Code, Mobile Number, and 6-digit PIN.");
    return;
  }
  if (pin.length !== 6 || isNaN(pin)) {
    alert("❌ Security PIN must be strictly 6 digits!");
    return;
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/organizer/recover_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgCode: orgCode,
        contact: mobile,
        pin: pin,
        newPassword: newPassword || undefined
      })
    });
    const data = await res.json();

    if (data && data.status === "success") {
      if (data.password) {
        alert(`✅ Verified! Your Password is: ${data.password}`);
        document.getElementById("org-code-input").value = orgCode;
        document.getElementById("org-pass-input").value = data.password;
      } else {
        alert("✅ Password updated successfully! You can now log in with your new password.");
        document.getElementById("org-code-input").value = orgCode;
        document.getElementById("org-pass-input").value = newPassword || "";
      }
      switchOrgTab("login");
    } else {
      alert("❌ " + (data?.message || "Invalid Organizer Code, Mobile Number, or PIN!"));
    }
  } catch (err) {
    alert("❌ Could not process recovery request. Please check backend endpoint.");
  }
};

window.handleOrganizerRegister = function () {
  const pin = document.getElementById("new-org-pin")?.value.trim() || "";
  const termsChecked = document.getElementById("org-terms-check")?.checked;
  if (!termsChecked) {
    alert("⚠️ Please accept Terms & Conditions.");
    return;
  }
  if (pin.length !== 6 || isNaN(pin)) {
    alert("❌ PIN must be strictly 6-digits!");
    return;
  }

  const payload = {
    name: document.getElementById("new-org-name")?.value.trim() || "",
    schoolName: document.getElementById("new-org-school")?.value.trim() || "",
    contact: document.getElementById("new-org-contact")?.value.trim() || "",
    password: document.getElementById("new-org-pass")?.value.trim() || "",
    pin: pin,
    refCode: document.getElementById("new-org-ref")?.value.trim().toUpperCase() || ""
  };

  fetch(`${SERVER_URL}/api/organizer/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert(`🎉 Account Created! Code: ${data.orgCode}`);
        switchOrgTab("login");
        document.getElementById("org-code-input").value = data.orgCode;
      } else {
        alert("❌ Error: " + (data?.message || "Registration failed"));
      }
    })
    .catch(() => alert("❌ Network error while creating account."));
};

function loadDashboardView() {
  document.getElementById("org-auth-section")?.classList.add("hidden");
  document.getElementById("org-view")?.classList.remove("hidden");
  removeTermsNearLogout();

  const orgCodeKey = getOrgCodeUpper();
  const schoolNameEl = document.getElementById("display-school-name");
  const orgCodeEl = document.getElementById("display-org-code");
  const permChk = document.getElementById("principal-perm-checkbox");
  const modeSelect = document.getElementById("org-exam-mode-select");
  const activeMode = normalizeMode(currentOrg.examMode);

  if (schoolNameEl) schoolNameEl.textContent = currentOrg.schoolName || "Associated School";
  if (orgCodeEl) orgCodeEl.textContent = orgCodeKey;
  if (permChk) permChk.checked = !!currentOrg.principalApproved;
  if (modeSelect) modeSelect.value = activeMode;

  const activeUpi = String(
    currentOrg?.upiId ||
    currentOrg?.payoutUpi ||
    (orgCodeKey ? localStorage.getItem(`nvmso_org_upi_${orgCodeKey}`) : "") ||
    ""
  ).trim();

  persistUpiEverywhere(activeUpi, orgCodeKey);
  syncUpiInputs(activeUpi, true);
  applyPortalFeeLabels();

  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      fetchGlobalConfigAndNotice();
      fetchRegisteredStudentsList();
    }, 25000);
  }
}

window.updateExamMode = function (val) {
  if (!currentOrg) return;
  if (!orgToken) {
    alert("🔒 Valid coordinator session required! Please login again.");
    return;
  }

  const orgCodeKey = getOrgCodeUpper();
  const previousMode = normalizeMode(currentOrg.examMode);
  const cleanMode = normalizeMode(val, previousMode);
  const upiIdVal = getSavedUpi(orgCodeKey);

  currentOrg.examMode = cleanMode;
  if (orgCodeKey) {
    localStorage.setItem(`nvmso_org_mode_${orgCodeKey}`, cleanMode);
  }
  const modeSelect = document.getElementById("org-exam-mode-select");
  if (modeSelect) modeSelect.value = cleanMode;
  applyPortalFeeLabels();

  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: cleanMode,
      principalApproved: !!currentOrg.principalApproved,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;
      if (data && data.status === "success") {
        const savedMode = normalizeMode(data.data?.examMode, cleanMode);
        currentOrg.examMode = savedMode;
        if (orgCodeKey) {
          localStorage.setItem(`nvmso_org_mode_${orgCodeKey}`, savedMode);
        }
        if (modeSelect) modeSelect.value = savedMode;
        if (upiIdVal) {
          persistUpiEverywhere(upiIdVal, orgCodeKey);
        }
        applyPortalFeeLabels();
        fetchRegisteredStudentsList();
      } else {
        currentOrg.examMode = previousMode;
        if (orgCodeKey) localStorage.setItem(`nvmso_org_mode_${orgCodeKey}`, previousMode);
        if (modeSelect) modeSelect.value = previousMode;
        applyPortalFeeLabels();
        alert("⚠️ Mode update response: " + (data?.message || "Could not confirm from server"));
      }
    })
    .catch(() => {
      currentOrg.examMode = previousMode;
      if (orgCodeKey) localStorage.setItem(`nvmso_org_mode_${orgCodeKey}`, previousMode);
      if (modeSelect) modeSelect.value = previousMode;
      applyPortalFeeLabels();
      alert("❌ Network error while saving exam mode.");
    });
};

window.saveOrganizerUpi = function () {
  if (!currentOrg) return;
  if (!orgToken) {
    alert("🔒 Valid coordinator session required! Please login again.");
    return;
  }

  const orgCodeKey = getOrgCodeUpper();
  const upiInput = document.getElementById("org-upi-input");
  const upiIdVal = (upiInput?.value || "").trim();

  if (!upiIdVal || !upiIdVal.includes("@")) {
    alert("⚠️ Please enter a valid UPI ID (e.g. coordinator@upi).");
    upiInput?.focus();
    return;
  }

  const cleanMode = normalizeMode(
    document.getElementById("org-exam-mode-select")?.value,
    currentOrg.examMode
  );

  persistUpiEverywhere(upiIdVal, orgCodeKey);
  currentOrg.examMode = cleanMode;
  syncUpiInputs(upiIdVal, true);

  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: cleanMode,
      principalApproved: !!currentOrg.principalApproved,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;
      if (data && data.status === "success") {
        const confirmedUpi = String(data.data?.upiId || data.data?.payoutUpi || upiIdVal).trim();
        persistUpiEverywhere(confirmedUpi, orgCodeKey);
        syncUpiInputs(confirmedUpi, true);
        alert(`✅ UPI ID (${confirmedUpi}) saved! Now you can submit payout requests.`);
      } else {
        alert("⚠️ UPI save response: " + (data?.message || "Failed to save UPI"));
      }
    })
    .catch(() => {
      alert("❌ Network error while saving UPI ID.");
    });
};

window.togglePrincipalPermission = function (isChecked) {
  if (!currentOrg || !orgToken) return;
  const orgCodeKey = getOrgCodeUpper();
  const upiIdVal = getSavedUpi(orgCodeKey);
  const cleanMode = normalizeMode(currentOrg.examMode);

  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: cleanMode,
      principalApproved: !!isChecked,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (data && data.status === "success") {
        currentOrg.principalApproved = !!isChecked;
      }
    })
    .catch(() => {});
};

function updateSettlementCardDisplay(netPayableToNvms, refComm, isSettled) {
  const labelEl = document.getElementById("fin-settlement-label");
  const amountEl = document.getElementById("fin-settlement-amount");
  if (!labelEl || !amountEl) return;

  if (netPayableToNvms > 0) {
    labelEl.textContent = "Pay to NVMS";
    amountEl.textContent = `₹${netPayableToNvms}`;
    amountEl.style.color = "#f87171";
  } else if (refComm > 0) {
    labelEl.textContent = "Referral Settlement";
    amountEl.textContent = `₹${refComm}`;
    amountEl.style.color = "#4ade80";
  } else if (isSettled) {
    labelEl.textContent = "Settlement Status";
    amountEl.textContent = "₹0 (Settled)";
    amountEl.style.color = "#4ade80";
  } else {
    labelEl.textContent = "Settlement Status";
    amountEl.textContent = "₹0";
    amountEl.style.color = "#facc15";
  }
}

function normalizeFinancialsForDisplay(rawFin, backendSettled, codeKey) {
  let cashHeld = Math.max(0, Number(rawFin.cashHeld) || 0);
  let onlineCollected = Math.max(0, Number(rawFin.onlineCollected) || 0);
  let directComm = Math.max(0, Number(rawFin.directCommission) || 0);
  let refComm = Math.max(0, Number(rawFin.referralCommission) || 0);

  const localCycle = getLocalCycleState(codeKey);
  const hasServerSettlementBaseline =
    rawFin.settledCashBase !== undefined ||
    rawFin.settledOnlineBase !== undefined ||
    rawFin.settledDirectCommBase !== undefined;

  if (backendSettled && !hasServerSettlementBaseline) {
    if (!localCycle || !localCycle.settled) {
      setLocalCycleState(codeKey, {
        settled: true,
        settledCash: cashHeld,
        settledOnline: onlineCollected,
        settledDirectComm: directComm,
        settledRefComm: 0
      });
      cashHeld = 0;
      onlineCollected = 0;
      directComm = 0;
    } else {
      cashHeld = Math.max(0, cashHeld - (Number(localCycle.settledCash) || 0));
      onlineCollected = Math.max(0, onlineCollected - (Number(localCycle.settledOnline) || 0));
      directComm = Math.max(0, directComm - (Number(localCycle.settledDirectComm) || 0));
    }
  } else if (!backendSettled && localCycle?.settled) {
    const deltaCash = Math.max(0, cashHeld - (Number(localCycle.settledCash) || 0));
    const deltaOnline = Math.max(0, onlineCollected - (Number(localCycle.settledOnline) || 0));
    const deltaDirect = Math.max(0, directComm - (Number(localCycle.settledDirectComm) || 0));

    if (deltaCash === 0 && deltaOnline === 0 && deltaDirect === 0) {
      cashHeld = 0;
      onlineCollected = 0;
      directComm = 0;
    } else {
      setLocalCycleState(codeKey, {
        ...(localCycle || {}),
        settled: false
      });
      cashHeld = deltaCash;
      onlineCollected = deltaOnline;
      directComm = deltaDirect;
    }
  }

  if (rawFin.settledRefCommBase === undefined && localCycle?.settledRefComm > 0) {
    refComm = Math.max(0, refComm - (Number(localCycle.settledRefComm) || 0));
  }

  const netPayableToNvms = Math.max(0, cashHeld - directComm);
  const isSettled =
    (backendSettled || !!localCycle?.settled) &&
    cashHeld === 0 &&
    onlineCollected === 0 &&
    directComm === 0;

  return {
    approvedRegistrations: Number(rawFin.approvedRegistrations) || 0,
    cashHeld,
    onlineCollected,
    directComm,
    refComm,
    netPayableToNvms,
    isSettled
  };
}

function renderRankingTableFromStudents(studentsList) {
  const rankBox = document.getElementById("org-result-ranking-box");
  const rankContainer = document.getElementById("org-ranking-content");
  if (!rankBox || !rankContainer) return;

  if (!portalConfig?.isResultDeclared) {
    rankBox.classList.add("hidden");
    return;
  }

  rankBox.classList.remove("hidden");
  const completed = (studentsList || []).filter(s => s.examCompleted);
  completed.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

  if (!completed.length) {
    rankContainer.innerHTML = `<p style="color:#94a3b8; margin:0;">No completed exam records found yet.</p>`;
    return;
  }

  let rankHtml = `<table style="width:100%; border-collapse: collapse; font-size: 13px; color: #fff;"><thead><tr style="background:#1e293b;"><th style="padding:8px;">Rank</th><th style="padding:8px;">Name</th><th style="padding:8px; text-align:right;">Score</th></tr></thead><tbody>`;
  completed.forEach((s, idx) => {
    const maxMarks = getConfiguredTotalMarks(s);
    rankHtml += `<tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px; color:#facc15;">#${idx + 1}</td><td style="padding:8px;">${escapeHtml(s.studentName)}${getSubjectBadge(s)}</td><td style="padding:8px; text-align:right; color:#4ade80;">${escapeHtml(s.score || 0)}/${maxMarks}</td></tr>`;
  });
  rankContainer.innerHTML = rankHtml + `</tbody></table>`;
}

function fetchRegisteredStudentsList() {
  const container = document.getElementById("student-roster-rows");
  if (!container || !currentOrg || !orgToken) return;
  const orgCodeKey = getOrgCodeUpper();

  fetch(`${SERVER_URL}/api/organizer/students`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({ orgCode: orgCodeKey })
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data || data.status !== "success") return;

      if (data.organizer || data.orgProfile) {
        currentOrg = mergeServerOrgProfile(data.organizer || data.orgProfile, orgCodeKey);
        const modeSelect = document.getElementById("org-exam-mode-select");
        if (modeSelect && document.activeElement !== modeSelect) {
          modeSelect.value = normalizeMode(currentOrg.examMode);
        }
        syncUpiInputs(getSavedUpi(orgCodeKey), false);
        applyPortalFeeLabels();
      }

      const studentsList = Array.isArray(data.students) ? data.students : [];
      renderRankingTableFromStudents(studentsList);

      if (data.financials) {
        const adminUpi = data.adminUpiId || portalConfig.adminUpiId || "narmada@upi";
        const fin = normalizeFinancialsForDisplay(data.financials, !!data.isSettled, orgCodeKey);

        const totalRegsEl = document.getElementById("fin-total-regs");
        if (totalRegsEl) totalRegsEl.textContent = fin.approvedRegistrations;
        document.getElementById("fin-cash-held").textContent = `₹${fin.cashHeld}`;
        document.getElementById("fin-online-collected").textContent = `₹${fin.onlineCollected}`;
        document.getElementById("fin-direct-comm").textContent = `₹${fin.directComm}`;
        document.getElementById("fin-ref-comm").textContent = `₹${fin.refComm}`;

        updateSettlementCardDisplay(fin.netPayableToNvms, fin.refComm, fin.isSettled);
        renderDynamicFinancialAction(fin.netPayableToNvms, fin.refComm, fin.isSettled, adminUpi);
      }

      if (!studentsList.length) {
        container.innerHTML =
          `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:15px;">No students registered.</td></tr>`;
        return;
      }

      container.innerHTML = "";
      const orgMode = normalizeMode(currentOrg?.examMode);

      studentsList.forEach(s => {
        const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
        const utrInfo = s.utrNumber
          ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${escapeHtml(s.utrNumber)}</code>`
          : "";

        let marksDisplay = `<span style="color:#94a3b8; font-size:11px;">Exam Pending</span>`;
        if (s.examCompleted || (s.score !== undefined && s.score !== null && s.score !== "")) {
          const scoreVal = parseFloat(s.score) || 0;
          const totalVal = getConfiguredTotalMarks(s);
          const pctVal =
            s.percentage !== undefined && s.percentage !== null && s.percentage !== ""
              ? s.percentage
              : totalVal > 0
              ? ((scoreVal / totalVal) * 100).toFixed(2)
              : 0;
          marksDisplay = `<strong style="color:#4ade80;">${scoreVal}/${totalVal}</strong> <br><span style="color:#38bdf8; font-size:11px;">${escapeHtml(pctVal)}%</span>`;
        }

        const stId = escapeHtml(s.studentId || s.id || "");
        const rowMode = normalizeMode(s.examMode, orgMode);
        let actionCell = `<span style="color:#4ade80; font-weight:bold;">Approved</span>`;
        if (!isApproved && String(s.paymentMode || "").toLowerCase() === "offline") {
          actionCell = `<button type="button" onclick="approveStudentCashEntry('${stId}')" style="background:#10b981; color:#fff; padding:5px 10px; font-size:11px; border-radius:4px; border:none; cursor:pointer;">💸 Approve Cash</button>`;
        } else if (!isApproved) {
          actionCell = `<span style='color:#f59e0b; font-size:11px;'>Awaiting UTR</span>`;
        }

        container.innerHTML += `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding:10px;"><strong>${escapeHtml(s.studentName)}${getSubjectBadge(s)}</strong></td>
            <td style="padding:10px;"><code style="color:#38bdf8;">${escapeHtml(s.rollNumber)}</code></td>
            <td style="padding:10px;">Class ${escapeHtml(s.studentClass)}</td>
            <td style="padding:10px;"><span style="color:${rowMode === "offline" ? "#fbbf24" : "#38bdf8"}; font-weight:700;">${escapeHtml(rowMode.toUpperCase())}</span></td>
            <td style="padding:10px;">${marksDisplay}</td>
            <td style="padding:10px;"><span style="color:${isApproved ? "#4ade80" : "#f59e0b"}; font-weight:bold;">${escapeHtml(s.paymentStatus || "Pending")}</span>${utrInfo}</td>
            <td style="padding:10px;">${actionCell}</td>
          </tr>
        `;
      });
    })
    .catch(() => {});
}

function renderDynamicFinancialAction(netPayable, refComm, isSettled, adminUpi) {
  const actionContainer = document.getElementById("dynamic-financial-action-container");
  if (!actionContainer) return;

  const activePayoutInput = document.getElementById("payout-upi-input");
  const activeAmountInput = document.getElementById("payout-amount-input");
  const userIsTypingPayoutUpi =
    activePayoutInput && document.activeElement === activePayoutInput;
  const userIsTypingPayoutAmt =
    activeAmountInput && document.activeElement === activeAmountInput;

  const preservedPayoutUpi = activePayoutInput
    ? activePayoutInput.value.trim()
    : String(currentOrg?.upiId || currentOrg?.payoutUpi || "").trim();

  const preservedPayoutAmt = activeAmountInput
    ? activeAmountInput.value
    : String(refComm || "");

  const upiPayLink = `upi://pay?pa=${encodeURIComponent(adminUpi)}&pn=${encodeURIComponent("NVMSO Central Admin")}&am=${netPayable}&cu=INR`;

  if (netPayable > 0) {
    const existingUtrVal = (document.getElementById("settlement-utr-input")?.value || "").trim();
    const existingAmtVal = Number(document.getElementById("settlement-amount-input")?.value) || netPayable;
    actionContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <p style="font-size: 13px; color: #f87171; font-weight: bold; margin: 0;">Pay to NVMS (Net Payable Settlement):</p>
          <h2 style="color: #f87171; margin: 5px 0 0 0;">₹${netPayable}</h2>
        </div>
        <div>
          <a href="${upiPayLink}" class="btn-primary" style="background: #10b981; padding: 8px 14px; font-size: 12px; text-decoration: none; display: inline-block; border-radius: 6px; font-weight: bold;">📲 Pay ₹${netPayable} to NVMS</a>
        </div>
      </div>
      <div style="margin-top: 12px; border-top: 1px dashed #334155; padding-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
        <input type="text" id="settlement-utr-input" value="${escapeHtml(existingUtrVal)}" placeholder="Enter UTR No after paying to NVMS" style="flex: 1; min-width: 180px;">
        <input type="number" id="settlement-amount-input" value="${existingAmtVal}" style="width: 110px;">
        <button type="button" onclick="submitSettlementProof(${netPayable})" class="btn-primary" style="background: #0284c7; width: auto; cursor:pointer;">Submit UTR</button>
      </div>
    `;
    return;
  }

  const savedUpi = String(
    currentOrg?.upiId ||
    currentOrg?.payoutUpi ||
    (getOrgCodeUpper() ? localStorage.getItem(`nvmso_org_upi_${getOrgCodeUpper()}`) : "") ||
    ""
  ).trim();

  const displayUpiValue = userIsTypingPayoutUpi
    ? preservedPayoutUpi
    : preservedPayoutUpi || savedUpi;

  const displayAmtValue = userIsTypingPayoutAmt
    ? preservedPayoutAmt
    : preservedPayoutAmt || String(refComm || "");

  actionContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div>
        <p style="font-size: 13px; color: #4ade80; font-weight: bold; margin: 0;">Referral Commission Settlement:</p>
        <h2 style="color: #4ade80; margin: 5px 0 0 0;">₹${refComm}</h2>
      </div>
      <span style="font-size: 12px; color: ${isSettled ? "#4ade80" : "#cbd5e1"};">
        ${isSettled ? "Settlement Completed" : "Enter a new or saved UPI ID below to request payout"}
      </span>
    </div>
    <div style="border-top: 1px dashed #334155; padding-top: 12px; margin-top: 12px; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px;">
      <div style="flex: 1; min-width: 240px;">
        <label for="payout-upi-input" style="display:block; font-size:12px; color:#c084fc; margin-bottom:4px;">Referral Payout UPI ID (New UPI allowed):</label>
        <input type="text" id="payout-upi-input" value="${escapeHtml(displayUpiValue)}" placeholder="Enter new UPI ID (e.g. coordinator@okaxis)">
      </div>
      <div style="width: 160px;">
        <label for="payout-amount-input" style="display:block; font-size:12px; color:#facc15; margin-bottom:4px;">Amount (₹):</label>
        <input type="number" id="payout-amount-input" min="1" step="1" value="${escapeHtml(displayAmtValue)}" placeholder="Amount">
      </div>
      <button type="button" id="btn-request-ref-payout" onclick="submitOrganizerPayoutRequest()" class="btn-primary" style="background: #c084fc; color: #020617; width: auto; padding: 10px 16px; cursor: pointer;">💸 Request Referral Payout</button>
    </div>
    <small id="payout-active-upi-note" style="display:block; margin-top:6px; font-size:11px; color:${savedUpi ? "#4ade80" : "#94a3b8"};">
      ${savedUpi ? `Active Saved UPI: ${escapeHtml(savedUpi)}` : "Active Saved UPI: Not set"}
    </small>
  `;
}

window.submitOrganizerPayoutRequest = function () {
  if (!currentOrg) return;
  if (!orgToken) {
    alert("🔒 Valid coordinator session required! Please login again.");
    return;
  }

  const orgCodeKey = getOrgCodeUpper();
  const payoutInput = document.getElementById("payout-upi-input");
  const amtInput = document.getElementById("payout-amount-input");
  const fallbackRef = Number(
    (document.getElementById("fin-ref-comm")?.textContent || "0").replace(/[^\d.]/g, "")
  ) || 0;

  const enteredUpi = (payoutInput ? payoutInput.value : "").trim();
  const amount = amtInput && amtInput.value !== "" ? Number(amtInput.value) : fallbackRef;

  if (!enteredUpi || !enteredUpi.includes("@")) {
    alert("⚠️ Please enter a valid UPI ID containing '@' (e.g. name@okaxis or name@ybl).");
    payoutInput?.focus();
    return;
  }
  if (!amount || amount <= 0) {
    alert("⚠️ Referral payout amount must be greater than ₹0.");
    amtInput?.focus();
    return;
  }

  fetch(`${SERVER_URL}/api/organizer/request_payout`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      orgCode: orgCodeKey,
      upiId: enteredUpi,
      payoutUpi: enteredUpi,
      amount: amount
    })
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;
      if (data.status === "success") {
        const finalUpi = String(
          data.data?.upiId || data.data?.payoutUpi || data.upiId || enteredUpi
        ).trim();
        persistUpiEverywhere(finalUpi, orgCodeKey);
        syncUpiInputs(finalUpi, true);
        alert(`✅ Referral payout request (₹${amount}) sent with UPI ID: ${finalUpi}`);
        fetchRegisteredStudentsList();
      } else {
        alert("❌ " + (data.message || "Could not submit referral payout request."));
      }
    })
    .catch(() => {
      alert("❌ Network error while submitting referral payout request.");
    });
};

window.submitSettlementProof = function (netPayable) {
  if (!currentOrg || !orgToken) return;
  const orgCodeKey = getOrgCodeUpper();
  const utrInput = document.getElementById("settlement-utr-input");
  const amtInput = document.getElementById("settlement-amount-input");
  const utrNo = (utrInput?.value || "").trim();
  const amount = Number(amtInput?.value || netPayable || 0);

  if (!utrNo) {
    alert("⚠️ Please enter UTR number.");
    utrInput?.focus();
    return;
  }
  if (!amount || amount <= 0) {
    alert("⚠️ Please enter a valid settlement amount.");
    amtInput?.focus();
    return;
  }

  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      orgCode: orgCodeKey,
      utrNumber: utrNo,
      amount: amount
    })
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;
      if (data.status === "success") {
        alert("✅ Settlement proof submitted!");
        fetchRegisteredStudentsList();
      } else {
        alert("❌ " + (data.message || "Failed to submit settlement proof."));
      }
    })
    .catch(() => alert("❌ Network error while submitting settlement proof."));
};

window.approveStudentCashEntry = function (studentId) {
  if (!studentId || !orgToken) return;
  const orgCodeKey = getOrgCodeUpper();

  fetch(`${SERVER_URL}/api/organizer/approve_cash`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      orgCode: orgCodeKey,
      studentId: studentId
    })
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;
      if (data.status === "success") {
        fetchRegisteredStudentsList();
      } else {
        alert("❌ " + (data.message || "Could not approve cash entry."));
      }
    })
    .catch(() => alert("❌ Network error while approving cash entry."));
};

window.toggleOrganizerChatBox = function () {
  const area = document.getElementById("organizer-chat-collapsible-area");
  const icon = document.getElementById("chat-toggle-icon");
  if (!area) return;
  const isHidden = area.classList.contains("hidden");
  area.classList.toggle("hidden", !isHidden);
  if (icon) icon.textContent = isHidden ? "▲ Close Chat" : "▼ Open Chat";
  if (isHidden) fetchOrganizerChatMessages();
};

window.openOrganizerChatFromHeader = function () {
  const area = document.getElementById("organizer-chat-collapsible-area");
  const icon = document.getElementById("chat-toggle-icon");
  area?.classList.remove("hidden");
  if (icon) icon.textContent = "▲ Close Chat";
  document.getElementById("organizer-support-chat-section")?.scrollIntoView({ behavior: "smooth" });
  fetchOrganizerChatMessages();
};

function fetchOrganizerChatMessages() {
  const box = document.getElementById("organizer-chat-box");
  if (!box || !currentOrg || !orgToken) return;
  const orgCodeKey = getOrgCodeUpper();

  fetch(`${SERVER_URL}/api/organizer/chat/messages?orgCode=${encodeURIComponent(orgCodeKey)}`, {
    method: "GET",
    headers: getOrgHeaders(false)
  })
    .then(async res => {
      if (res.status === 401) {
        handleUnauthorizedSession();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data || data.status !== "success") return;
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      if (!msgs.length) {
        box.innerHTML = `<p style="color:#64748b; font-size:11px; text-align:center;">No messages yet.</p>`;
        return;
      }
      box.innerHTML = msgs
        .map(m => {
          const sender = escapeHtml(m.sender || "Admin");
          const text = escapeHtml(m.message || m.text || "");
          const imgHtml = m.imageUrl
            ? `<div style="margin-top:6px;"><img src="${escapeHtml(m.imageUrl)}" alt="Attachment" style="max-width:180px; border-radius:6px;"></div>`
            : "";
          return `<div style="margin-bottom:8px; padding:8px; background:#020617; border-radius:6px; border:1px solid #1e293b;"><strong style="color:#38bdf8; font-size:12px;">${sender}:</strong> <span style="font-size:13px; color:#e2e8f0;">${text}</span>${imgHtml}</div>`;
        })
        .join("");
      box.scrollTop = box.scrollHeight;
    })
    .catch(() => {});
}

window.sendOrganizerQuery = function () {
  if (!currentOrg || !orgToken) return;
  const orgCodeKey = getOrgCodeUpper();
  const inputEl = document.getElementById("organizer-chat-input");
  const fileEl = document.getElementById("organizer-chat-file");
  const messageText = (inputEl?.value || "").trim();
  const fileObj = fileEl?.files?.[0] || null;

  if (!messageText && !fileObj) {
    alert("⚠️ Please type a message or choose an image.");
    return;
  }

  const sendPayload = imageBase64 => {
    fetch(`${SERVER_URL}/api/organizer/chat/send`, {
      method: "POST",
      headers: getOrgHeaders(true),
      body: JSON.stringify({
        orgCode: orgCodeKey,
        message: messageText,
        imageBase64: imageBase64 || undefined
      })
    })
      .then(async res => {
        if (res.status === 401) {
          handleUnauthorizedSession();
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        if (data.status === "success") {
          if (inputEl) inputEl.value = "";
          if (fileEl) fileEl.value = "";
          fetchOrganizerChatMessages();
        } else {
          alert("❌ " + (data.message || "Failed to send message."));
        }
      })
      .catch(() => alert("❌ Network error while sending message."));
  };

  if (fileObj) {
    const reader = new FileReader();
    reader.onload = () => sendPayload(reader.result);
    reader.readAsDataURL(fileObj);
  } else {
    sendPayload("");
  }
};
