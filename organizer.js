const SERVER_URL = "https://nvmso-backend.onrender.com";
const ORG_TOKEN_KEY = "nvmso_org_token";

let currentOrg = null;
let orgToken = sessionStorage.getItem(ORG_TOKEN_KEY) || "";
let portalConfig = {};
let autoRefreshTimer = null;
let selectedChatImageBase64 = "";

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

function bindChatFileInput() {
  const fileInput = document.getElementById("organizer-chat-file");
  if (!fileInput || fileInput.dataset.bound === "true") return;
  fileInput.dataset.bound = "true";

  fileInput.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) {
      selectedChatImageBase64 = "";
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      alert("⚠️ Please select an image smaller than 1.5 MB.");
      fileInput.value = "";
      selectedChatImageBase64 = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      selectedChatImageBase64 = typeof reader.result === "string" ? reader.result : "";
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindChatFileInput();
  fetchGlobalConfigAndNotice();

  const savedOrgCode = (localStorage.getItem("nvmso_org_code") || "").trim().toUpperCase();
  const savedOrgPass = localStorage.getItem("nvmso_org_pass") || "";

  if (savedOrgCode && savedOrgPass) {
    fetch(`${SERVER_URL}/api/organizer/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: savedOrgCode,
        orgCode: savedOrgCode,
        password: savedOrgPass
      })
    })
      .then(res => res.json())
      .then(response => {
        if (response && response.status === "success") {
          if (response.token) {
            orgToken = response.token;
            sessionStorage.setItem(ORG_TOKEN_KEY, orgToken);
          }
          currentOrg = response.data || response.organizer || {};
          const codeKey = String(currentOrg.code || currentOrg.orgCode || savedOrgCode).trim().toUpperCase();
          const savedUpi = localStorage.getItem(`nvmso_org_upi_${codeKey}`);
          if (!currentOrg.upiId && savedUpi) {
            currentOrg.upiId = savedUpi;
          }
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

  const activeMode =
    currentOrg?.examMode ||
    document.getElementById("org-exam-mode-select")?.value ||
    "online";
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
      body: JSON.stringify({ code: code, orgCode: code, password: password })
    });
    const response = await res.json();

    if (res.ok && response && response.status === "success") {
      if (response.token) {
        orgToken = response.token;
        sessionStorage.setItem(ORG_TOKEN_KEY, orgToken);
      }
      currentOrg = response.data || response.organizer || {};
      const savedUpi = localStorage.getItem(`nvmso_org_upi_${code}`);
      if (!currentOrg.upiId && savedUpi) {
        currentOrg.upiId = savedUpi;
      }
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
        code: orgCode,
        orgCode: orgCode,
        contact: mobile,
        mobile: mobile,
        pin: pin,
        newPassword: newPassword || undefined
      })
    });
    const data = await res.json();

    if (res.ok && data && data.status === "success") {
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
    refCode: document.getElementById("new-org-ref")?.value.trim().toUpperCase() || "",
    termsAccepted: true
  };

  fetch(`${SERVER_URL}/api/organizer/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        const assignedCode = data.orgCode || data.code || data.organizer?.code || "";
        alert(`🎉 Account Created! Code: ${assignedCode}`);
        switchOrgTab("login");
        const codeInput = document.getElementById("org-code-input");
        if (codeInput && assignedCode) codeInput.value = assignedCode;
      } else {
        alert("❌ Error: " + (data?.message || "Registration failed"));
      }
    })
    .catch(() => alert("❌ Network error while creating account."));
};

function loadDashboardView() {
  document.getElementById("org-auth-section")?.classList.add("hidden");
  document.getElementById("org-view")?.classList.remove("hidden");

  const orgCodeKey = String(currentOrg.code || currentOrg.orgCode || "").trim().toUpperCase();
  const schoolNameEl = document.getElementById("display-school-name");
  const orgCodeEl = document.getElementById("display-org-code");
  const permChk = document.getElementById("principal-perm-checkbox");
  const modeSelect = document.getElementById("org-exam-mode-select");

  if (schoolNameEl) schoolNameEl.textContent = currentOrg.schoolName || "Associated School";
  if (orgCodeEl) orgCodeEl.textContent = orgCodeKey;
  if (permChk) {
    permChk.checked = !!(currentOrg.principalApproved ?? currentOrg.principalPermissionVerified);
  }
  if (modeSelect && document.activeElement !== modeSelect) {
    modeSelect.value = currentOrg.examMode || "online";
  }

  const upiField = document.getElementById("org-upi-input");
  const localUpi = localStorage.getItem(`nvmso_org_upi_${orgCodeKey}`) || "";
  const activeUpi = currentOrg.upiId || currentOrg.payoutUpi || localUpi || "";
  currentOrg.upiId = activeUpi;
  if (upiField && document.activeElement !== upiField) {
    upiField.value = activeUpi;
  }

  applyPortalFeeLabels();

  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      fetchGlobalConfigAndNotice();
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
      checkResultAndRankingStatus();
    }, 4000);
  }
}

window.updateExamMode = function (val) {
  if (!currentOrg) return;
  const orgCodeKey = String(currentOrg.code || currentOrg.orgCode || "").trim().toUpperCase();
  const upiIdVal = document.getElementById("org-upi-input")?.value.trim() || currentOrg.upiId || "";
  if (upiIdVal) {
    localStorage.setItem(`nvmso_org_upi_${orgCodeKey}`, upiIdVal);
  }
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      code: orgCodeKey,
      orgCode: orgCodeKey,
      examMode: val,
      principalApproved: !!currentOrg.principalApproved,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        currentOrg.examMode = val;
        currentOrg.upiId = upiIdVal;
        applyPortalFeeLabels();
        fetchRegisteredStudentsList();
      }
    })
    .catch(() => {});
};

window.saveOrganizerUpi = function () {
  if (!currentOrg) return;
  const orgCodeKey = String(currentOrg.code || currentOrg.orgCode || "").trim().toUpperCase();
  const upiIdVal = document.getElementById("org-upi-input")?.value.trim() || "";

  if (!upiIdVal || !upiIdVal.includes("@")) {
    alert("⚠️ Please enter a valid UPI ID (e.g. coordinator@upi).");
    return;
  }

  localStorage.setItem(`nvmso_org_upi_${orgCodeKey}`, upiIdVal);
  currentOrg.upiId = upiIdVal;
  currentOrg.payoutUpi = upiIdVal;

  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      code: orgCodeKey,
      orgCode: orgCodeKey,
      examMode: currentOrg.examMode || "online",
      principalApproved: !!currentOrg.principalApproved,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert("✅ UPI ID saved! Central Admin can now view and pay to this UPI.");
      } else {
        alert("✅ UPI ID saved locally and sent to server.");
      }
    })
    .catch(() => {
      alert("✅ UPI ID saved for payouts.");
    });
};

window.togglePrincipalPermission = function (isChecked) {
  if (!currentOrg) return;
  const orgCodeKey = String(currentOrg.code || currentOrg.orgCode || "").trim().toUpperCase();
  const upiIdVal = document.getElementById("org-upi-input")?.value.trim() || currentOrg.upiId || "";
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      code: orgCodeKey,
      orgCode: orgCodeKey,
      examMode: currentOrg.examMode || "online",
      principalApproved: isChecked,
      principalPermissionVerified: isChecked,
      upiId: upiIdVal,
      payoutUpi: upiIdVal
    })
  })
    .then(res => res.json())
    .then(() => {
      currentOrg.principalApproved = isChecked;
      currentOrg.principalPermissionVerified = isChecked;
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
  const orgCodeKey = String(currentOrg.code || currentOrg.orgCode || "").trim().toUpperCase();

  fetch(`${SERVER_URL}/api/organizer/students`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({ code: orgCodeKey, orgCode: orgCodeKey })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
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

          const activeMode = String(currentOrg.examMode || "online").toLowerCase();
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

          const isSettled = !!(data.isSettled ?? currentOrg.manualSettled);
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
              <td style="padding:10px;">${escapeHtml(String(s.paymentMode || "online").toUpperCase())}</td>
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
    const existingUtr = document.getElementById("settlement-utr-input");
    const existingAmt = document.getElementById("settlement-amount-input");
    if (existingUtr && existingAmt && document.activeElement !== existingUtr && document.activeElement !== existingAmt) {
      existingAmt.value = netPayable;
      return;
    }
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
    const existingUpi = document.getElementById("payout-upi-input");
    const existingAmt = document.getElementById("payout-amount-input");
    if (existingUpi && existingAmt && document.activeElement !== existingUpi && document.activeElement !== existingAmt) {
      existingAmt.value = nvmsOwesOrg;
      return;
    }
    actionContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div><p style="font-size: 13px; color: #4ade80; font-weight: bold; margin: 0;">Payout Amount (NVMS Owes You):</p><h2 style="color: #4ade80; margin: 5px 0 0 0;">₹${nvmsOwesOrg}</h2></div>
      </div>
      <div style="border-top: 1px dashed #334155; padding-top: 10px; margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
        <input type="text" id="payout-upi-input" value="${escapeHtml(currentOrg.upiId || "")}" placeholder="Enter your UPI ID (e.g. user@paytm)" style="flex: 1; min-width: 200px;">
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
  const orgCodeKey = currentOrg ? (currentOrg.code || currentOrg.orgCode || "") : "";
  fetch(`${SERVER_URL}/api/organizer/approve_cash`, {
    method: "POST",
    headers: getOrgHeaders(true),
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
  const orgCodeKey = currentOrg ? (currentOrg.code || currentOrg.orgCode || "") : "";
  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST",
    headers: getOrgHeaders(true),
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
  const upiId = document.getElementById("payout-upi-input")?.value.trim() || "";
  const amountVal = Number(document.getElementById("payout-amount-input")?.value) || maxAmount;
  if (!upiId || !upiId.includes("@")) {
    alert("⚠️ Enter a valid UPI ID.");
    return;
  }
  const orgCodeKey = currentOrg ? (currentOrg.code || currentOrg.orgCode || "") : "";
  fetch(`${SERVER_URL}/api/organizer/request_payout`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({ orgCode: orgCodeKey, upiId: upiId, amount: amountVal })
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success") {
        alert("✅ Commission payout request sent to Central Admin!");
      } else {
        alert("❌ Error: " + (data?.message || "Failed to request payout"));
      }
    })
    .catch(() => alert("❌ Network error while requesting payout."));
};

function checkResultAndRankingStatus() {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data && data.status === "success" && data.config?.isResultDeclared) {
        document.getElementById("org-result-ranking-box")?.classList.remove("hidden");
        fetch(`${SERVER_URL}/api/organizer/students`, {
          method: "POST",
          headers: getOrgHeaders(true),
          body: JSON.stringify({ code: orgCodeKey, orgCode: orgCodeKey })
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
      } else {
        document.getElementById("org-result-ranking-box")?.classList.add("hidden");
      }
    })
    .catch(() => {});
}

window.toggleOrganizerChatBox = function () {
  const chatArea = document.getElementById("organizer-chat-collapsible-area");
  const iconEl = document.getElementById("chat-toggle-icon");
  if (!chatArea) return;
  const isNowOpen = chatArea.classList.toggle("hidden") === false;
  if (iconEl) iconEl.textContent = isNowOpen ? "▲ Close Chat" : "▼ Open Chat";
  if (isNowOpen) fetchOrganizerChatMessages();
};

function fetchOrganizerChatMessages() {
  if (!currentOrg) return;
  const orgCodeKey = String(currentOrg.code || currentOrg.orgCode || "").trim().toUpperCase();
  fetch(
    `${SERVER_URL}/api/organizer/query_messages?orgCode=${encodeURIComponent(orgCodeKey)}`,
    { headers: getOrgHeaders(false) }
  )
    .then(res => res.json())
    .then(data => {
      const chatBox = document.getElementById("organizer-chat-box");
      if (chatBox && Array.isArray(data.messages)) {
        if (!data.messages.length) {
          chatBox.innerHTML = `<p style="color:#64748b; font-size:11px; text-align:center;">No messages yet.</p>`;
          return;
        }
        chatBox.innerHTML = data.messages
          .map(
            m =>
              `<div style="text-align:${m.isAdmin ? "left" : "right"}; margin-bottom:6px;"><div style="display:inline-block; max-width:80%; background:${m.isAdmin ? "#0369a1" : "#1e293b"}; padding:6px 10px; border-radius:6px; color:#fff; font-size:11px;">${m.text ? `<div>${escapeHtml(m.text)}</div>` : ""}${m.image ? `<img src="${escapeHtml(m.image)}" alt="Attachment" style="max-width:160px; border-radius:4px; margin-top:4px; display:block;">` : ""}</div></div>`
          )
          .join("");
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    })
    .catch(() => {});
}

window.sendOrganizerQuery = function () {
  const input = document.getElementById("organizer-chat-input");
  const fileEl = document.getElementById("organizer-chat-file");
  const msgText = input?.value.trim() || "";
  if (!msgText && !selectedChatImageBase64) return;

  const orgCodeKey = String(currentOrg?.code || currentOrg?.orgCode || "").trim().toUpperCase();
  fetch(`${SERVER_URL}/api/organizer/send_query`, {
    method: "POST",
    headers: getOrgHeaders(true),
    body: JSON.stringify({
      code: orgCodeKey,
      orgCode: orgCodeKey,
      senderName: `School (${orgCodeKey})`,
      message: msgText,
      image: selectedChatImageBase64
    })
  })
    .then(() => {
      if (input) input.value = "";
      if (fileEl) fileEl.value = "";
      selectedChatImageBase64 = "";
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
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  currentOrg = null;
  orgToken = "";
  selectedChatImageBase64 = "";
  sessionStorage.removeItem(ORG_TOKEN_KEY);
  localStorage.removeItem("nvmso_org_code");
  localStorage.removeItem("nvmso_org_pass");
  location.reload();
};
