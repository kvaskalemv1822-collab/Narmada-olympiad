const SERVER_URL = "https://nvmso-backend.onrender.com";
let currentOrg = null;
let portalConfig = {};
let isAccountSettled = false;
let adminUpiId = "narmada@upi";
let currentNetPayable = 0;
let autoRefreshTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchGlobalConfigAndNotice();
  
  // Check if session already active in localStorage
  const savedOrgCode = localStorage.getItem("nvmso_org_code");
  if (savedOrgCode) {
    // Auto-login simulation if code exists
    fetch(`${SERVER_URL}/api/organizer/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgCode: savedOrgCode, password: localStorage.getItem("nvmso_org_pass") || "" })
    })
    .then(res => res.json())
    .then(response => {
      if (response.status === "success") {
        currentOrg = response.data;
        loadDashboardView();
        fetchRegisteredStudentsList();
        fetchOrganizerChatMessages();
      }
    }).catch(() => {});
  }
});

function fetchGlobalConfigAndNotice() {
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        portalConfig = data.config;
        const noticeBanner = document.getElementById("admin-notice-banner");
        const noticeText = document.getElementById("notice-text");
        if (portalConfig.broadcastNotice && noticeBanner && noticeText) {
          noticeText.textContent = portalConfig.broadcastNotice;
          noticeBanner.classList.remove("hidden");
        }
      }
    });
}

window.verifyOrgLogin = async () => {
  const code = document.getElementById("org-code-input").value.trim().toUpperCase();
  const password = document.getElementById("org-pass-input").value.trim();

  if (!code || !password) {
    alert("⚠️ Please enter both Organizer Code and Password.");
    return;
  }

  fetch(`${SERVER_URL}/api/organizer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: code, password: password })
  })
  .then(res => res.json())
  .then(response => {
    if (response.status === "success") {
      currentOrg = response.data;
      localStorage.setItem("nvmso_org_code", code);
      localStorage.setItem("nvmso_org_pass", password);
      loadDashboardView();
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
    } else {
      alert("❌ Access Denied: Invalid Credentials!");
    }
  });
};

document.getElementById("org-reg-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("new-org-name").value.trim(),
    schoolName: document.getElementById("new-org-school").value.trim(),
    contact: document.getElementById("new-org-contact").value.trim(),
    password: document.getElementById("new-org-pass").value.trim(),
    pin: document.getElementById("new-org-pin").value.trim(),
    refCode: document.getElementById("new-org-ref").value.trim().toUpperCase()
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
      location.reload();
    } else {
      alert("❌ Error: " + data.message);
    }
  });
});

function loadDashboardView() {
  document.getElementById("org-auth-section").classList.add("hidden");
  document.getElementById("org-view").classList.remove("hidden");

  const orgCodeKey = currentOrg.code || currentOrg.orgCode;
  document.getElementById("display-org-code").textContent = orgCodeKey;
  if(document.getElementById("display-org-name")) document.getElementById("display-org-name").textContent = currentOrg.name;
  if(document.getElementById("display-org-school")) document.getElementById("display-org-school").textContent = currentOrg.schoolName;
  
  document.getElementById("principal-perm-checkbox").checked = !!currentOrg.principalApproved;
  document.getElementById("org-exam-mode-select").value = currentOrg.examMode || "online";
  document.getElementById("current-applicable-fee").textContent = (currentOrg.examMode === "offline") ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);

  // 🔄 8-SECOND AUTO-REFRESH LIVE SYNC
  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => {
      fetchRegisteredStudentsList();
      fetchOrganizerChatMessages();
    }, 8000);
  }
}

window.updateExamMode = function(val) {
  if (!currentOrg) return;
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: currentOrg.code || currentOrg.orgCode, examMode: val, principalApproved: currentOrg.principalApproved
    })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      currentOrg.examMode = val;
      document.getElementById("current-applicable-fee").textContent = val === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
      alert(`✅ Configuration Updated: Mode saved as ${val.toUpperCase()} successfully!`);
    }
  });
};

window.togglePrincipalPermission = function(isChecked) {
  if (!currentOrg) return;
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: currentOrg.code || currentOrg.orgCode, examMode: currentOrg.examMode || "online", principalApproved: isChecked
    })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      currentOrg.principalApproved = isChecked;
      alert("📜 Principal permission status updated and saved permanently!");
    }
  });
};

function fetchRegisteredStudentsList() {
  const container = document.getElementById("student-roster-rows");
  if(!container || !currentOrg) return;

  fetch(`${SERVER_URL}/api/organizer/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      isAccountSettled = !!data.isSettled;
      adminUpiId = data.adminUpiId || "narmada@upi";
      
      const statusTextEl = document.getElementById("settlement-status-text");
      if (statusTextEl) {
        if (isAccountSettled) {
          statusTextEl.textContent = "🟢 Settlement Confirmed: Net amount paid to NVMS.";
          statusTextEl.style.color = "#4ade80";
        } else {
          statusTextEl.textContent = "🔒 Settlement Pending: Pay net amount to NVMS to unlock commission payouts.";
          statusTextEl.style.color = "#f87171";
        }
      }

      if (data.financials) {
        currentNetPayable = data.financials.netPayableToNvms;
        if(document.getElementById("fin-total-regs")) document.getElementById("fin-total-regs").textContent = data.financials.totalRegistrations;
        if(document.getElementById("fin-total-fees")) document.getElementById("fin-total-fees").textContent = `₹${data.financials.totalFees}`;
        if(document.getElementById("fin-direct-comm")) document.getElementById("fin-direct-comm").textContent = `₹${data.financials.directCommission}`;
        if(document.getElementById("fin-ref-comm")) document.getElementById("fin-ref-comm").textContent = `₹${data.financials.referralCommission}`;
        if(document.getElementById("fin-net-payable")) document.getElementById("fin-net-payable").textContent = `₹${currentNetPayable}`;
        
        const amountInput = document.getElementById("settlement-amount-input");
        if(amountInput && !amountInput.value) {
          amountInput.value = currentNetPayable;
        }
      }

      container.innerHTML = "";
      if (data.students.length === 0) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:15px;">No students registered under this school code yet.</td></tr>`;
        return;
      }

      data.students.forEach(s => {
        const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
        const isRejected = s.paymentStatus === "Rejected";
        const payMode = (s.paymentMode || "online").toUpperCase();
        
        let utrInfo = s.utrNumber ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>` : "";
        if (isRejected && s.rejectionReason) {
          utrInfo += `<br><span style="color:#f87171; font-size:11px; font-weight:bold;">Reason: ${s.rejectionReason}</span>`;
        }

        let statusColor = "#f59e0b";
        if (isApproved) statusColor = "#4ade80";
        if (isRejected) statusColor = "#f87171";

        let statusText = s.paymentStatus || "Pending Verification";
        let actionCell = `<span style="color:#4ade80; font-weight:bold;">Verified</span>`;

        if (!isApproved && !isRejected && (s.paymentMode || "").toLowerCase() === "offline") {
          actionCell = `<button onclick="approveStudentCashEntry('${s.id}')" style="background:#10b981; color:#fff; border:none; padding:6px 12px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">💸 Approve Cash</button>`;
        } else if (!isApproved && !isRejected && (s.paymentMode || "").toLowerCase() === "online") {
          actionCell = `<span style='color:#f59e0b; font-size:11px;'>Awaiting Admin UTR</span>`;
        }

        container.innerHTML += `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding:10px;"><strong>${s.studentName}</strong></td>
            <td style="padding:10px;"><code style="color:#38bdf8;">${s.rollNumber}</code></td>
            <td style="padding:10px;">Class ${s.studentClass}</td>
            <td style="padding:10px;"><span style="background:#1e293b; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; color:${payMode=='OFFLINE' ? '#fbbf24':'#38bdf8'}">${payMode}</span></td>
            <td style="padding:10px;"><span style="color:${statusColor}; font-weight:bold;">${statusText}</span>${utrInfo}</td>
            <td style="padding:10px;">${actionCell}</td>
          </tr>
        `;
      });
    }
  });
}

window.approveStudentCashEntry = function(studentId) {
  if(!confirm("Confirm cash collection payment verification approval?")) return;

  fetch(`${SERVER_URL}/api/organizer/approve_cash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, orgCode: currentOrg.code || currentOrg.orgCode })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      alert("🎉 Registration Fee Cash Payment Verification Approved Successfully!");
      fetchRegisteredStudentsList(); 
    } else {
      alert("❌ Error: " + data.message);
    }
  });
};

// 💬 DIRECT ADMIN CHAT & SCREENSHOT SUPPORT
function fetchOrganizerChatMessages() {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode;

  fetch(`${SERVER_URL}/api/organizer/query_messages?orgCode=${orgCodeKey}`)
    .then(res => res.json())
    .then(data => {
      const chatBox = document.getElementById("organizer-chat-box");
      if (!chatBox) return;

      if (data.status === "success" && data.messages && data.messages.length > 0) {
        chatBox.innerHTML = "";
        data.messages.forEach(m => {
          let align = m.isAdmin ? "left" : "right";
          let bg = m.isAdmin ? "#0369a1" : "#1e293b";
          let senderLabel = m.isAdmin ? `<span style="font-size:9px; color:#38bdf8; display:block; font-weight:bold;">Central Admin</span>` : "";
          let imageHtml = m.imageUrl ? `<br><a href="${m.imageUrl}" target="_blank"><img src="${m.imageUrl}" style="max-width:140px; max-height:140px; border-radius:4px; margin-top:5px; border:1px solid #38bdf8;" /></a>` : "";

          chatBox.innerHTML += `
            <div style="text-align: ${align}; margin-bottom: 8px;">
              <div style="display: inline-block; background: ${bg}; padding: 6px 10px; border-radius: 6px; max-width: 80%; text-align: left; color: #fff; font-size: 11px;">
                ${senderLabel}${m.text || ""}${imageHtml}
              </div>
            </div>
          `;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }).catch(() => {});
}

window.sendOrganizerQuery = function() {
  if (!currentOrg) return;
  const orgCodeKey = currentOrg.code || currentOrg.orgCode;

  const input = document.getElementById("organizer-chat-input");
  const fileInput = document.getElementById("organizer-chat-file");

  const msgText = input ? input.value.trim() : "";
  const file = fileInput && fileInput.files.length > 0 ? fileInput.files[0] : null;

  if (!msgText && !file) return;

  const dispatch = (imgBase64 = "") => {
    fetch(`${SERVER_URL}/api/organizer/send_query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgCode: orgCodeKey,
        senderName: `School (${orgCodeKey})`,
        message: msgText,
        imageUrl: imgBase64
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        if (input) input.value = "";
        if (fileInput) fileInput.value = "";
        fetchOrganizerChatMessages();
      }
    });
  };

  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => dispatch(reader.result);
    reader.readAsDataURL(file);
  } else {
    dispatch("");
  }
};

window.payNetPayableToNvms = function() {
  if (currentNetPayable <= 0) {
    alert("⚠️ No net amount payable to NVMS right now.");
    return;
  }
  const orgCode = currentOrg.code || currentOrg.orgCode;
  const upiLink = `upi://pay?pa=${adminUpiId}&pn=NVMSO%20Central%20Admin&am=${currentNetPayable}&cu=INR&tn=Settlement%20for%20${orgCode}`;
  window.location.href = upiLink;
};

window.submitSettlementProof = function() {
  const utr = document.getElementById("settlement-utr-input").value.trim();
  const amount = parseFloat(document.getElementById("settlement-amount-input").value) || currentNetPayable;
  const orgCode = currentOrg.code || currentOrg.orgCode;

  if(!utr) {
    alert("⚠️ Please enter the UTR / Transaction Reference Number.");
    return;
  }

  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: orgCode, utrNumber: utr, amount: amount })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      alert("✅ Settlement payment proof submitted successfully!");
      document.getElementById("settlement-utr-input").value = "";
    } else {
      alert("❌ Error: " + data.message);
    }
  });
};

window.requestCommissionPayout = function() {
  if (!isAccountSettled) {
    alert("🔒 Locked: You must pay the net amount to NVMS first before requesting a commission payout!");
    return;
  }

  const upiId = document.getElementById("payout-upi-input").value.trim();
  const commStr = document.getElementById("fin-ref-comm").textContent;
  const amount = parseFloat(commStr.replace('₹', '')) || 0;

  if(!upiId) {
    alert("⚠️ Please enter your valid UPI ID for payout request.");
    return;
  }

  fetch(`${SERVER_URL}/api/organizer/request_payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode, upiId: upiId, amount: amount })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      alert("✅ Commission Payout Request sent successfully!");
      document.getElementById("payout-upi-input").value = "";
    } else {
      alert("❌ Error: " + data.message);
    }
  });
};

window.switchOrgTab = (tab) => {
  if (tab === 'reg') {
    document.getElementById("org-reg-box").classList.remove("hidden");
    document.getElementById("org-login-box").classList.add("hidden");
  } else {
    document.getElementById("org-reg-box").classList.add("hidden");
    document.getElementById("org-login-box").classList.remove("hidden");
  }
};

window.logoutOrganizerSession = () => {
  localStorage.removeItem("nvmso_org_code");
  localStorage.removeItem("nvmso_org_pass");
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  location.reload();
};
