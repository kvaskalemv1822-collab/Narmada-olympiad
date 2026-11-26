const SERVER_URL = "https://nvmso-backend.onrender.com";
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

function normalizeMode(mode) {
  const m = String(mode || "online").trim().toLowerCase();
  return m === "offline" ? "offline" : "online";
}

function getOrgCodeUpper(orgObj = currentOrg) {
  return String(orgObj?.code || orgObj?.orgCode || localStorage.getItem("nvmso_org_code") || "")
    .trim()
    .toUpperCase();
}

function getSavedUpi(codeKey) {
  const k = String(codeKey || getOrgCodeUpper()).trim().toUpperCase();
  const fromInput = (document.getElementById("org-upi-input")?.value || "").trim();
  const fromObj = (currentOrg?.upiId || currentOrg?.payoutUpi || "").trim();
  const fromLocal = k ? (localStorage.getItem(`nvmso_org_upi_${k}`) || "").trim() : "";
  return fromInput || fromObj || fromLocal || "";
}

function syncUpiInputs(upiVal) {
  const clean = String(upiVal || "").trim();
  const profileInput = document.getElementById("org-upi-input");
  const payoutInput = document.getElementById("payout-upi-input");
  const statusEl = document.getElementById("org-upi-status-text");

  if (profileInput && document.activeElement !== profileInput) {
    profileInput.value = clean;
  }
  if (payoutInput && document.activeElement !== payoutInput) {
    payoutInput.value = clean;
  }
  if (statusEl) {
    statusEl.textContent = clean
      ? `Saved Payout UPI: ${clean}`
      : "No UPI saved yet. Enter & save your UPI ID to request payouts.";
    statusEl.style.color = clean ? "#4ade80" : "#94a3b8";
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

function mergeServerOrgProfile(serverOrg, fallbackCode) {
  const codeKey = String(serverOrg?.code || serverOrg?.orgCode || fallbackCode || getOrgCodeUpper())
    .trim()
    .toUpperCase();
  const localUpi = codeKey ? (localStorage.getItem(`nvmso_org_upi_${codeKey}`) || "").trim() : "";
  const localMode = codeKey ? (localStorage.getItem(`nvmso_org_mode_${codeKey}`) || "").trim() : "";

  const serverMode = serverOrg?.examMode ? normalizeMode(serverOrg.examMode) : "";
  const prevMode = currentOrg?.examMode ? normalizeMode(currentOrg.examMode) : "";
  const resolvedMode = serverMode || prevMode || (localMode ? normalizeMode(localMode) : "online");

  const resolvedUpi =
    String(serverOrg?.upiId || serverOrg?.payoutUpi || "").trim() ||
    String(currentOrg?.upiId || currentOrg?.payoutUpi || "").trim() ||
    localUpi;

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

document.addEventListener("DOMContentLoaded", () => {
  fetchGlobalConfigAndNotice();
  const savedOrgCode = (localStorage.getItem("nvmso_org_code") || "").trim().toUpperCase();
  if (savedOrgCode) {
    fetch(`${SERVER_URL}/api/organizer/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgCode: savedOrgCode,
        password: localStorage.getItem("nvmso_org_pass") || ""
      })
    })
      .then(res => res.json())
      .then(response => {
        if (response && response.status === "success") {
          currentOrg = mergeServerOrgProfile(response.data || {}, savedOrgCode);
          loadDashboardView();
          fetchRegisteredStudentsList();
          fetchOrganizerChatMessages();
          checkResultAndRankingStatus();
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
      }
    })
    .catch(() => {});
}

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
      currentOrg = mergeServerOrgProfile(response.data || {}, code);
      localStorage.setItem("nvmso_org_code", code);
      localStorage.setItem("nvmso_org_pass", password);
      loadDashboardView();
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
      checkResultAndRankingStatus();
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

  const activeUpi = getSavedUpi(orgCodeKey);
  currentOrg.upiId = activeUpi;
  currentOrg.payoutUpi = activeUpi;
  syncUpiInputs(activeUpi);

  applyPortalFeeLabels();

  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      fetchGlobalConfigAndNotice();
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
      checkResultAndRankingStatus();
    }, 6000);
  }
}

window.updateExamMode = function (val) {
  if (!currentOrg) return;
  const orgCodeKey = getOrgCodeUpper();
  const cleanMode = normalizeMode(val);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: cleanMode,
      principalApproved: !!currentOrg.principalApproved,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        currentOrg.examMode = cleanMode;
        if (upiIdVal) {
          currentOrg.upiId = upiIdVal;
          currentOrg.payoutUpi = upiIdVal;
          localStorage.setItem(`nvmso_org_upi_${orgCodeKey}`, upiIdVal);
        }
        applyPortalFeeLabels();
        fetchRegisteredStudentsList();
      } else {
        alert("⚠️ Mode update response: " + (data?.message || "Could not confirm from server"));
      }
    })
    .catch(() => {});
};

window.saveOrganizerUpi = function () {
  if (!currentOrg) return;
  const orgCodeKey = getOrgCodeUpper();
  const upiInput = document.getElementById("org-upi-input");
  const upiIdVal = (upiInput?.value || getSavedUpi(orgCodeKey) || "").trim();

  if (!upiIdVal || !upiIdVal.includes("@")) {
    alert("⚠️ Please enter a valid UPI ID (e.g. coordinator@upi).");
    upiInput?.focus();
    return;
  }

  const cleanMode = normalizeMode(
    document.getElementById("org-exam-mode-select")?.value || currentOrg.examMode
  );

  if (orgCodeKey) {
    localStorage.setItem(`nvmso_org_upi_${orgCodeKey}`, upiIdVal);
    localStorage.setItem(`nvmso_org_mode_${orgCodeKey}`, cleanMode);
  }
  currentOrg.upiId = upiIdVal;
  currentOrg.payoutUpi = upiIdVal;
  currentOrg.examMode = cleanMode;
  syncUpiInputs(upiIdVal);

  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: cleanMode,
      principalApproved: !!currentOrg.principalApproved,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert(`✅ UPI ID (${upiIdVal}) saved! Now you can submit payout requests.`);
      } else {
        alert(`✅ UPI ID (${upiIdVal}) saved locally for payouts.`);
      }
    })
    .catch(() => {
      alert(`✅ UPI ID (${upiIdVal}) saved locally for payouts.`);
    });
};

window.togglePrincipalPermission = function (isChecked) {
  if (!currentOrg) return;
  const orgCodeKey = getOrgCodeUpper();
  const upiIdVal = getSavedUpi(orgCodeKey);
  const cleanMode = normalizeMode(currentOrg.examMode);

  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: cleanMode,
      principalApproved: !!isChecked,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(res => res.json())
    .then(() => {
      currentOrg.principalApproved = !!isChecked;
    })
    .catch(() => {});
};

function updateSettlementCardDisplay(netPayableToNvms, nvmsOwesOrganizer, isSettled) {
  const labelEl = document.getElementById("fin-settlement-label");
  const amountEl = document.getElementById("fin-settlement-amount");
  if (!labelEl || !amountEl) return;

  if (isSettled) {
    labelEl.textContent = "Pay to NVMS / Payout";
    amountEl.textContent = "₹0 (Settled)";
    amountEl.style.color = "#4ade80";
  } else if (netPayableToNvms > 0) {
    labelEl.textContent = "Pay to NVMS";
    amountEl.textContent = `₹${netPayableToNvms}`;
    amountEl.style.color = "#f87171";
  } else if (nvmsOwesOrganizer > 0) {
    labelEl.textContent = "Payout Amount";
    amountEl.textContent = `₹${nvmsOwesOrganizer}`;
    amountEl.style.color = "#4ade80";
  } else {
    labelEl.textContent = "Pay to NVMS / Payout";
    amountEl.textContent = "₹0";
    amountEl.style.color = "#facc15";
  }
}

function fetchRegisteredStudentsList() {
  const container = document.getElementById("student-roster-rows");
  if (!container || !currentOrg) return;
  const orgCodeKey = getOrgCodeUpper();

  fetch(`${SERVER_URL}/api/organizer/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCodeKey })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        if (data.organizer || data.orgProfile) {
          currentOrg = mergeServerOrgProfile(data.organizer || data.orgProfile, orgCodeKey);
          const modeSelect = document.getElementById("org-exam-mode-select");
          if (modeSelect && document.activeElement !== modeSelect) {
            modeSelect.value = normalizeMode(currentOrg.examMode);
          }
          syncUpiInputs(getSavedUpi(orgCodeKey));
          applyPortalFeeLabels();
        }

        const studentsList = Array.isArray(data.students) ? data.students : [];

        if (data.financials) {
          const onlineFeeBase = Number(portalConfig.onlineFee || data.onlineFee || 100);
          const offlineFeeBase = Number(portalConfig.offlineFee || data.offlineFee || 120);

          const verifiedStudents = studentsList.filter(
            s => s.paymentStatus === "Approved" || s.paymentVerified === true
          );

          const totalRegs = verifiedStudents.length || data.financials.approvedRegistrations || 0;
          const cashStudents = verifiedStudents.filter(s => {
            const pm = String(s.paymentMode || "").toLowerCase();
            return pm === "offline" || pm === "cash";
          });
          const onlineStudents = verifiedStudents.filter(
            s => String(s.paymentMode || "online").toLowerCase() === "online"
          );

          const activeMode = normalizeMode(currentOrg.examMode);
          const cashHeld =
            cashStudents.length > 0
              ? cashStudents.length * (activeMode === "offline" ? offlineFeeBase : onlineFeeBase)
              : (data.financials.cashHeld || 0);

          const onlineCollected =
            onlineStudents.length > 0
              ? onlineStudents.length * onlineFeeBase
              : (data.financials.onlineCollected || 0);

          const baseForCommission = totalRegs * onlineFeeBase;
          const directComm = Math.floor(baseForCommission * 0.15);

          const serverRefComm = Number(
            data.financials?.referralCommission ?? data.referralCommission
          );
          let refComm = 0;
          if (!isNaN(serverRefComm) && serverRefComm > 0) {
            refComm = Math.floor(serverRefComm);
          } else if (Array.isArray(data.referredOrganizers)) {
            refComm = data.referredOrganizers.reduce((sum, refOrg) => {
              const refCount = Number(refOrg.approvedRegistrations || refOrg.verifiedCount || 0);
              return sum + Math.floor(refCount * onlineFeeBase * 0.05);
            }, 0);
          } else {
            refComm = 0;
          }

          const isSettled = !!data.isSettled;
          const rawNetPayable = cashHeld - (directComm + refComm);
          const netPayableToNvms = isSettled ? 0 : Math.max(0, rawNetPayable);
          const nvmsOwesOrganizer = isSettled ? 0 : Math.max(0, (directComm + refComm) - cashHeld);
          const adminUpi = data.adminUpiId || portalConfig.adminUpiId || "narmada@upi";

          document.getElementById("fin-total-regs").textContent = totalRegs;
          document.getElementById("fin-cash-held").textContent = `₹${cashHeld}`;
          document.getElementById("fin-online-collected").textContent = `₹${onlineCollected}`;
          document.getElementById("fin-direct-comm").textContent = `₹${directComm}`;
          document.getElementById("fin-ref-comm").textContent = `₹${refComm}`;

          updateSettlementCardDisplay(netPayableToNvms, nvmsOwesOrganizer, isSettled);
          renderDynamicFinancialAction(netPayableToNvms, nvmsOwesOrganizer, isSettled, adminUpi);
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
          const rowMode = normalizeMode(s.examMode || orgMode);
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
      }
    })
    .catch(() => {});
}

function renderDynamicFinancialAction(netPayable, nvmsOwesOrg, isSettled, adminUpi) {
  const actionContainer = document.getElementById("dynamic-financial-action-container");
  if (!actionContainer) return;

  const upiPayLink = `upi://pay?pa=${encodeURIComponent(adminUpi)}&pn=${encodeURIComponent("NVMSO Central Admin")}&am=${netPayable}&cu=INR`;

  if (isSettled) {
    actionContainer.innerHTML = `<p style="text-align: center; color: #4ade80; font-size: 13px; font-weight: bold; margin: 0;">✅ Account Settled & Verified by Central Admin! (Balance: ₹0)</p>`;
  } else if (netPayable > 0) {
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
        <input type="text" id="settlement-utr-input" placeholder="Enter UTR No after paying to NVMS" style="flex: 1; min-width: 180px;">
        <input type="number" id="settlement-amount-input" value="${netPayable}" style="width: 110px;">
        <button type="button" onclick="submitSettlementProof(${netPayable})" class="btn-primary" style="background: #0284c7; width: auto; cursor:pointer;">Submit UTR</button>
      </div>
    `;
  } else if (nvmsOwesOrg > 0) {
    const existingPayoutVal = (document.getElementById("payout-upi-input")?.value || "").trim();
    const resolvedPayoutUpi = existingPayoutVal || getSavedUpi(getOrgCodeUpper());
    actionContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div><p style="font-size: 13px; color: #4ade80; font-weight: bold; margin: 0;">Payout Amount (NVMS Owes You):</p><h2 style="color: #4ade80; margin: 5px 0 0 0;">₹${nvmsOwesOrg}</h2></div>
      </div>
      <div style="border-top: 1px dashed #334155; padding-top: 10px; margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
        <input type="text" id="payout-upi-input" value="${escapeHtml(resolvedPayoutUpi)}" placeholder="Enter your UPI ID (e.g. user@paytm)" style="flex: 1; min-width: 200px;">
        <input type="number" id="payout-amount-input" value="${nvmsOwesOrg}" style="width: 110px;">
        <button type="button" onclick="requestCommissionPayout(${nvmsOwesOrg})" class="btn-primary" style="background: #f59e0b; width: auto; cursor:pointer;">📤 Request Payout</button>
      </div>
    `;
  } else {
    actionContainer.innerHTML = `<p style="text-align: center; color: #4ade80; font-size: 13px; font-weight: bold; margin: 0;">✅ All accounts fully settled! (Balance: ₹0)</p>`;
  }
}

window.approveStudentCashEntry = function (studentId) {
  if (!confirm("Approve cash payment?")) return;
  const orgCodeKey = getOrgCodeUpper();
  fetch(`${SERVER_URL}/api/organizer/approve_cash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, orgCode: orgCodeKey })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        fetchRegisteredStudentsList();
      } else {
        alert("❌ Error: " + (data?.message || "Failed to approve cash entry"));
      }
    })
    .catch(() => alert("❌ Network error while approving cash."));
};

window.submitSettlementProof = function (defaultAmount) {
  const utr = document.getElementById("settlement-utr-input")?.value.trim() || "";
  const amountVal = Number(document.getElementById("settlement-amount-input")?.value) || defaultAmount;
  if (!utr) {
    alert("⚠️ Enter UTR number.");
    return;
  }
  const orgCodeKey = getOrgCodeUpper();
  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCodeKey, utrNumber: utr, amount: amountVal })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert("✅ Settlement proof submitted!");
        fetchRegisteredStudentsList();
      } else {
        alert("❌ Error: " + (data?.message || "Failed to submit settlement"));
      }
    })
    .catch(() => alert("❌ Network error while submitting settlement."));
};

window.requestCommissionPayout = function (maxAmount) {
  const orgCodeKey = getOrgCodeUpper();
  const payoutInput = document.getElementById("payout-upi-input");
  const upiId = (payoutInput?.value || getSavedUpi(orgCodeKey) || "").trim();
  const amountVal = Number(document.getElementById("payout-amount-input")?.value) || maxAmount;

  if (!upiId || !upiId.includes("@")) {
    alert("⚠️ Pehle apna valid UPI ID (e.g. name@upi) daal kar Save UPI karein ya Payout box mein bharein.");
    const profileInput = document.getElementById("org-upi-input");
    if (profileInput) {
      profileInput.value = upiId;
      profileInput.focus();
    } else {
      payoutInput?.focus();
    }
    return;
  }

  localStorage.setItem(`nvmso_org_upi_${orgCodeKey}`, upiId);
  if (currentOrg) {
    currentOrg.upiId = upiId;
    currentOrg.payoutUpi = upiId;
  }
  syncUpiInputs(upiId);

  fetch(`${SERVER_URL}/api/organizer/request_payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCodeKey, upiId: upiId, payoutUpi: upiId, amount: amountVal })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert(`✅ Commission payout request (₹${amountVal}) sent to Central Admin on UPI: ${upiId}`);
      } else {
        alert("❌ Error: " + (data?.message || "Failed to request payout"));
      }
    })
    .catch(() => alert("❌ Network error while requesting payout."));
};

function checkResultAndRankingStatus() {
  if (!currentOrg) return;
  const orgCodeKey = getOrgCodeUpper();
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success" && data.config?.isResultDeclared) {
        document.getElementById("org-result-ranking-box")?.classList.remove("hidden");
        fetch(`${SERVER_URL}/api/organizer/students`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgCode: orgCodeKey })
        })
          .then(r => r.json())
          .then(stData => {
            if (stData && stData.status === "success" && Array.isArray(stData.students)) {
              const completed = stData.students.filter(s => s.examCompleted);
              completed.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
              let rankHtml = `<table style="width:100%; border-collapse: collapse; font-size: 13px; color: #fff;"><thead><tr style="background:#1e293b;"><th style="padding:8px;">Rank</th><th style="padding:8px;">Name</th><th style="padding:8px; text-align:right;">Score</th></tr></thead><tbody>`;
              completed.forEach((s, idx) => {
                const maxMarks = getConfiguredTotalMarks(s);
                rankHtml += `<tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px; color:#facc15;">#${idx + 1}</td><td style="padding:8px;">${escapeHtml(s.studentName)}${getSubjectBadge(s)}</td><td style="padding:8px; text-align:right; color:#4ade80;">${escapeHtml(s.score || 0)}/${maxMarks}</td></tr>`;
              });
              const rankContainer = document.getElementById("org-ranking-content");
              if (rankContainer) {
                rankContainer.innerHTML = rankHtml + `</tbody></table>`;
              }
            }
          })
          .catch(() => {});
      }
    })
    .catch(() => {});
}

window.toggleOrganizerChatBox = function () {
  const chatArea = document.getElementById("organizer-chat-collapsible-area");
  if (!chatArea) return;
  chatArea.classList.toggle("hidden");
  if (!chatArea.classList.contains("hidden")) fetchOrganizerChatMessages();
};

function fetchOrganizerChatMessages() {
  if (!currentOrg) return;
  const orgCodeKey = getOrgCodeUpper();
  fetch(`${SERVER_URL}/api/organizer/query_messages?orgCode=${encodeURIComponent(orgCodeKey)}`)
    .then(res => res.json())
    .then(data => {
      const chatBox = document.getElementById("organizer-chat-box");
      if (chatBox && Array.isArray(data.messages)) {
        chatBox.innerHTML = data.messages
          .map(
            m =>
              `<div style="text-align:${m.isAdmin ? "left" : "right"}; margin-bottom:5px;"><span style="background:${m.isAdmin ? "#0369a1" : "#1e293b"}; padding:5px 8px; border-radius:5px; color:#fff; font-size:11px; display:inline-block;">${escapeHtml(m.text)}</span></div>`
          )
          .join("");
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    })
    .catch(() => {});
}

window.sendOrganizerQuery = function () {
  const input = document.getElementById("organizer-chat-input");
  if (!input || !input.value.trim()) return;
  const orgCodeKey = getOrgCodeUpper();
  fetch(`${SERVER_URL}/api/organizer/send_query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      senderName: `School (${orgCodeKey})`,
      message: input.value.trim()
    })
  })
    .then(() => {
      input.value = "";
      fetchOrganizerChatMessages();
    })
    .catch(() => {});
};

window.switchOrgTab = tab => {
  document.getElementById("org-login-box")?.classList.toggle("hidden", tab !== "login");
  document.getElementById("org-reg-box")?.classList.toggle("hidden", tab !== "reg");
  document.getElementById("org-forgot-box")?.classList.toggle("hidden", tab !== "forgot");
};

window.logoutOrganizerSession = () => {
  localStorage.removeItem("nvmso_org_code");
  localStorage.removeItem("nvmso_org_pass");
  location.reload();
};
