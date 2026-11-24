const SERVER_URL = "https://nvmso-backend.onrender.com";
let currentOrg = null;
let portalConfig = {};
let autoRefreshTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchGlobalConfigAndNotice();
  const savedOrgCode = localStorage.getItem("nvmso_org_code");
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
      if (response.status === "success") {
        currentOrg = response.data;
        loadDashboardView();
        fetchRegisteredStudentsList();
        fetchOrganizerChatMessages();
        checkResultAndRankingStatus();
      }
    })
    .catch(() => {});
  }
});

// 📄 TERMS & CONDITIONS MODAL CONTROLS
window.openTermsModal = function() {
  const modal = document.getElementById("terms-conditions-modal");
  if (modal) modal.classList.remove("hidden");
};

window.closeTermsModal = function() {
  const modal = document.getElementById("terms-conditions-modal");
  if (modal) modal.classList.add("hidden");
};

window.acceptAndCloseTermsModal = function() {
  const checkbox = document.getElementById("org-terms-check");
  if (checkbox) checkbox.checked = true;
  closeTermsModal();
};

// 🔓 FORGOT PASSWORD MODAL & RECOVERY HANDLER
window.openForgotPasswordModal = function() {
  const codeFromLogin = document.getElementById("org-code-input")?.value.trim().toUpperCase() || "";
  const fpCodeEl = document.getElementById("fp-org-code");
  if (fpCodeEl && codeFromLogin) {
    fpCodeEl.value = codeFromLogin;
  }
  const modal = document.getElementById("forgot-password-modal");
  if (modal) modal.classList.remove("hidden");
};

window.closeForgotPasswordModal = function() {
  const modal = document.getElementById("forgot-password-modal");
  if (modal) modal.classList.add("hidden");
};

window.handleForgotPasswordReset = async function() {
  const orgCode = document.getElementById("fp-org-code").value.trim().toUpperCase();
  const mobile = document.getElementById("fp-mobile").value.trim();
  const pin = document.getElementById("fp-pin").value.trim();
  const newPassword = document.getElementById("fp-new-password").value.trim();
  const btn = document.getElementById("btn-reset-password");

  if (!/^[0-9]{10}$/.test(mobile)) {
    alert("⚠️ Please enter a valid 10-digit registered mobile number.");
    return;
  }

  if (!/^[0-9]{6}$/.test(pin)) {
    alert("⚠️ Please enter your 6-digit security PIN.");
    return;
  }

  if (!newPassword || newPassword.length < 4) {
    alert("⚠️ New password must be at least 4 characters long.");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Verifying PIN & Mobile...";
  }

  try {
    const res = await fetch(`${SERVER_URL}/api/organizer/recover_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgCode: orgCode,
        contact: mobile,
        mobile: mobile,
        pin: pin,
        newPassword: newPassword
      })
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      alert("✅ Password reset successful! You can now log in with your new password.");
      if (data.orgCode || orgCode) {
        const loginCodeEl = document.getElementById("org-code-input");
        if (loginCodeEl) loginCodeEl.value = data.orgCode || orgCode;
      }
      document.getElementById("forgot-password-form")?.reset();
      closeForgotPasswordModal();
    } else {
      alert("❌ Verification failed: " + (data.message || "Invalid mobile number or 6-digit PIN."));
    }
  } catch (err) {
    alert("❌ Unable to connect to server. Please try again.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔁 Verify & Reset Password";
    }
  }
};

function fetchGlobalConfigAndNotice() {
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalConfig = data.config || {};
        const noticeBanner = document.getElementById("admin-notice-banner");
        const noticeText = document.getElementById("notice-text");
        if (portalConfig.broadcastNotice && noticeBanner && noticeText) {
          noticeText.textContent = portalConfig.broadcastNotice;
          noticeBanner.classList.remove("hidden");
        }
      }
    })
    .catch(() => {});
}

window.verifyOrgLogin = async () => {
  const code = document.getElementById("org-code-input").value.trim().toUpperCase();
  const password = document.getElementById("org-pass-input").value.trim();
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

    if (response.status === "success") {
      currentOrg = response.data;
      localStorage.setItem("nvmso_org_code", code);
      localStorage.setItem("nvmso_org_pass", password);
      loadDashboardView();
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
      checkResultAndRankingStatus();
    } else {
      alert("❌ Access Denied!");
    }
  } catch (err) {
    alert("❌ Server connection error. Please try again.");
  }
};

window.handleOrganizerRegister = function() {
  const pin = document.getElementById("new-org-pin").value.trim();
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
    name: document.getElementById("new-org-name").value.trim(),
    schoolName: document.getElementById("new-org-school").value.trim(),
    contact: document.getElementById("new-org-contact").value.trim(),
    password: document.getElementById("new-org-pass").value.trim(),
    pin: pin,
    refCode: document.getElementById("new-org-ref").value.trim().toUpperCase(),
    upiId: document.getElementById("new-org-upi") ? document.getElementById("new-org-upi").value.trim() : ""
  };

  fetch(`${SERVER_URL}/api/organizer/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      alert(`🎉 Account Created! Code: ${data.orgCode}`);
      switchOrgTab("login");
      document.getElementById("org-code-input").value = data.orgCode;
    } else {
      alert("❌ Error: " + data.message);
    }
  });
};

function loadDashboardView() {
  document.getElementById("org-auth-section").classList.add("hidden");
  document.getElementById("org-view").classList.remove("hidden");

  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";
  document.getElementById("display-school-name").textContent = currentOrg.schoolName || "Associated School";
  document.getElementById("display-org-code").textContent = orgCodeKey;
  document.getElementById("principal-perm-checkbox").checked = !!currentOrg.principalApproved;
  document.getElementById("org-exam-mode-select").value = currentOrg.examMode || "online";

  const upiField = document.getElementById("org-upi-input");
  if (upiField) upiField.value = currentOrg.upiId || "";

  document.getElementById("current-applicable-fee").textContent =
    currentOrg.examMode === "offline"
      ? (portalConfig.offlineFee || 120)
      : (portalConfig.onlineFee || 100);

  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
      checkResultAndRankingStatus();
    }, 4000);
  }
}

window.updateExamMode = function(val) {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";
  const upiIdVal = document.getElementById("org-upi-input")?.value.trim() || "";
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: val,
      principalApproved: currentOrg.principalApproved,
      upiId: upiIdVal
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      currentOrg.examMode = val;
      currentOrg.upiId = upiIdVal;
      document.getElementById("current-applicable-fee").textContent =
        val === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
      fetchRegisteredStudentsList();
    }
  });
};

window.saveOrganizerUpi = function() {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";
  const upiIdVal = document.getElementById("org-upi-input")?.value.trim() || "";
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: currentOrg.examMode || "online",
      principalApproved: currentOrg.principalApproved,
      upiId: upiIdVal
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      currentOrg.upiId = upiIdVal;
      alert("✅ UPI ID updated successfully for payouts!");
    }
  });
};

window.togglePrincipalPermission = function(isChecked) {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";
  const upiIdVal = document.getElementById("org-upi-input")?.value.trim() || "";
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      examMode: currentOrg.examMode || "online",
      principalApproved: isChecked,
      upiId: upiIdVal
    })
  })
  .then(res => res.json())
  .then(() => {
    currentOrg.principalApproved = isChecked;
  });
};

function fetchRegisteredStudentsList() {
  const container = document.getElementById("student-roster-rows");
  if (!container || !currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";

  fetch(`${SERVER_URL}/api/organizer/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCodeKey })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      if (data.financials) {
        const totalRegs = data.financials.approvedRegistrations || 0;
        const cashHeld = data.financials.cashHeld || 0;
        const onlineCollected = data.financials.onlineCollected || 0;
        const directComm = data.financials.directCommission || 0;
        const refComm = data.financials.referralCommission || 0;
        const totalComm = data.financials.totalCommission || 0;
        const netPayableToNvms = data.financials.netPayableToNvms || 0;
        const nvmsOwesOrganizer = data.financials.nvmsOwesOrganizer || 0;
        const isSettled = !!data.isSettled;
        const adminUpi = data.adminUpiId || "narmada@upi";

        document.getElementById("fin-total-regs").textContent = totalRegs;
        document.getElementById("fin-cash-held").textContent = `₹${cashHeld}`;
        document.getElementById("fin-online-collected").textContent = `₹${onlineCollected}`;
        document.getElementById("fin-direct-comm").textContent = `₹${directComm}`;
        document.getElementById("fin-ref-comm").textContent = `₹${refComm}`;
        document.getElementById("fin-total-comm").textContent = `₹${totalComm}`;

        renderDynamicFinancialAction(netPayableToNvms, nvmsOwesOrganizer, isSettled, adminUpi);
      }

      container.innerHTML = data.students.length
        ? ""
        : `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:15px;">No students registered.</td></tr>`;

      data.students.forEach(s => {
        const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
        const utrInfo = s.utrNumber
          ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>`
          : "";

        let marksDisplay = `<span style="color:#94a3b8; font-size:11px;">Exam Pending</span>`;
        if (s.examCompleted || s.score !== undefined) {
          const scoreVal = parseFloat(s.score) || 0;
          const totalVal = parseFloat(s.totalMarks) || 30;
          const pctVal =
            s.percentage !== undefined ? s.percentage : ((scoreVal / totalVal) * 100).toFixed(2);
          marksDisplay = `<strong style="color:#4ade80;">${scoreVal}/${totalVal}</strong> <br><span style="color:#38bdf8; font-size:11px;">${pctVal}%</span>`;
        }

        let actionCell = `<span style="color:#4ade80; font-weight:bold;">Approved</span>`;
        if (!isApproved && (s.paymentMode || "").toLowerCase() === "offline") {
          actionCell = `<button type="button" onclick="approveStudentCashEntry('${s.studentId || s.id}')" style="background:#10b981; color:#fff; padding:5px 10px; font-size:11px; border-radius:4px; border:none; cursor:pointer;">💸 Approve Cash</button>`;
        } else if (!isApproved) {
          actionCell = `<span style='color:#f59e0b; font-size:11px;'>Awaiting UTR</span>`;
        }

        container.innerHTML += `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding:10px;"><strong>${s.studentName}</strong></td>
            <td style="padding:10px;"><code style="color:#38bdf8;">${s.rollNumber}</code></td>
            <td style="padding:10px;">Class ${s.studentClass}</td>
            <td style="padding:10px;">${(s.paymentMode || "online").toUpperCase()}</td>
            <td style="padding:10px;">${marksDisplay}</td>
            <td style="padding:10px;"><span style="color:${isApproved ? "#4ade80" : "#f59e0b"}; font-weight:bold;">${s.paymentStatus || "Pending"}</span>${utrInfo}</td>
            <td style="padding:10px;">${actionCell}</td>
          </tr>
        `;
      });
    }
  });
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
          <p style="font-size: 13px; color: #f87171; font-weight: bold; margin: 0;">Net Amount Payable to NVMS:</p>
          <h2 style="color: #f87171; margin: 5px 0 0 0;">₹${netPayable}</h2>
        </div>
        <div>
          <a href="${upiPayLink}" class="btn-primary" style="background: #10b981; padding: 8px 14px; font-size: 12px; text-decoration: none; display: inline-block; border-radius: 6px; font-weight: bold;">📲 Pay ₹${netPayable} via UPI</a>
        </div>
      </div>
      <div style="margin-top: 12px; border-top: 1px dashed #334155; padding-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
        <input type="text" id="settlement-utr-input" placeholder="Enter UTR No after paying" style="flex: 1; min-width: 180px;">
        <input type="number" id="settlement-amount-input" value="${netPayable}" style="width: 100px;">
        <button type="button" onclick="submitSettlementProof(${netPayable})" class="btn-primary" style="background: #0284c7; width: auto; cursor:pointer;">Submit UTR</button>
      </div>
    `;
  } else if (nvmsOwesOrg > 0) {
    actionContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div><p style="font-size: 13px; color: #4ade80; font-weight: bold; margin: 0;">NVMS Owes You (Commission Payout Receivable):</p><h2 style="color: #4ade80; margin: 5px 0 0 0;">₹${nvmsOwesOrg}</h2></div>
      </div>
      <div style="border-top: 1px dashed #334155; padding-top: 10px; margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
        <input type="text" id="payout-upi-input" value="${currentOrg.upiId || ""}" placeholder="Enter your UPI ID (e.g. user@paytm)" style="flex: 1; min-width: 200px;">
        <input type="number" id="payout-amount-input" value="${nvmsOwesOrg}" style="width: 100px;">
        <button type="button" onclick="requestCommissionPayout(${nvmsOwesOrg})" class="btn-primary" style="background: #f59e0b; width: auto; cursor:pointer;">📤 Request Payout</button>
      </div>
    `;
  } else {
    actionContainer.innerHTML = `<p style="text-align: center; color: #4ade80; font-size: 13px; font-weight: bold; margin: 0;">✅ All accounts fully settled! (Balance: ₹0)</p>`;
  }
}

window.approveStudentCashEntry = function(studentId) {
  if (!confirm("Approve cash payment?")) return;
  const orgCodeKey = currentOrg ? (currentOrg.code || currentOrg.orgCode || "") : "";
  fetch(`${SERVER_URL}/api/organizer/approve_cash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, orgCode: orgCodeKey })
  }).then(() => fetchRegisteredStudentsList());
};

window.submitSettlementProof = function(defaultAmount) {
  const utr = document.getElementById("settlement-utr-input").value.trim();
  if (!utr) {
    alert("Enter UTR number.");
    return;
  }
  const orgCodeKey = currentOrg ? (currentOrg.code || currentOrg.orgCode || "") : "";
  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCodeKey, utrNumber: utr, amount: defaultAmount })
  }).then(() => {
    alert("✅ Settlement proof submitted!");
    fetchRegisteredStudentsList();
  });
};

window.requestCommissionPayout = function(maxAmount) {
  const upiId = document.getElementById("payout-upi-input").value.trim();
  if (!upiId) {
    alert("Enter UPI ID.");
    return;
  }
  const orgCodeKey = currentOrg ? (currentOrg.code || currentOrg.orgCode || "") : "";
  fetch(`${SERVER_URL}/api/organizer/request_payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCodeKey, upiId: upiId, amount: maxAmount })
  }).then(() => alert("✅ Commission payout request sent to Central Admin!"));
};

function checkResultAndRankingStatus() {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success" && data.config.isResultDeclared) {
        document.getElementById("org-result-ranking-box")?.classList.remove("hidden");
        fetch(`${SERVER_URL}/api/organizer/students`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgCode: orgCodeKey })
        })
        .then(r => r.json())
        .then(stData => {
          if (stData.status === "success" && stData.students) {
            const completed = stData.students.filter(s => s.examCompleted);
            completed.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
            let rankHtml = `<table style="width:100%; border-collapse: collapse; font-size: 13px; color: #fff;"><thead><tr style="background:#1e293b;"><th style="padding:8px;">Rank</th><th style="padding:8px;">Name</th><th style="padding:8px; text-align:right;">Score</th></tr></thead><tbody>`;
            completed.forEach((s, idx) => {
              rankHtml += `<tr style="border-bottom:1px solid #1e293b;"><td style="padding:8px; color:#facc15;">#${idx + 1}</td><td style="padding:8px;">${s.studentName}</td><td style="padding:8px; text-align:right; color:#4ade80;">${s.score || 0}/${s.totalMarks || 30}</td></tr>`;
            });
            document.getElementById("org-ranking-content").innerHTML = rankHtml + `</tbody></table>`;
          }
        });
      }
    });
}

window.toggleOrganizerChatBox = function() {
  const chatArea = document.getElementById("organizer-chat-collapsible-area");
  chatArea.classList.toggle("hidden");
  if (!chatArea.classList.contains("hidden")) fetchOrganizerChatMessages();
};

function fetchOrganizerChatMessages() {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode || "";
  fetch(`${SERVER_URL}/api/organizer/query_messages?orgCode=${orgCodeKey}`)
    .then(res => res.json())
    .then(data => {
      const chatBox = document.getElementById("organizer-chat-box");
      if (chatBox && data.messages) {
        chatBox.innerHTML = data.messages
          .map(
            m =>
              `<div style="text-align:${m.isAdmin ? "left" : "right"}; margin-bottom:5px;"><span style="background:${m.isAdmin ? "#0369a1" : "#1e293b"}; padding:5px 8px; border-radius:5px; color:#fff; font-size:11px; display:inline-block;">${m.text}</span></div>`
          )
          .join("");
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    });
}

window.sendOrganizerQuery = function() {
  const input = document.getElementById("organizer-chat-input");
  if (!input || !input.value.trim()) return;
  const orgCodeKey = currentOrg ? (currentOrg.code || currentOrg.orgCode || "") : "";
  fetch(`${SERVER_URL}/api/organizer/send_query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: orgCodeKey,
      senderName: `School (${orgCodeKey})`,
      message: input.value.trim()
    })
  }).then(() => {
    input.value = "";
    fetchOrganizerChatMessages();
  });
};

window.switchOrgTab = tab => {
  document.getElementById("org-reg-box").classList.toggle("hidden", tab !== "reg");
  document.getElementById("org-login-box").classList.toggle("hidden", tab === "reg");
};

window.logoutOrganizerSession = () => {
  localStorage.clear();
  location.reload();
};
