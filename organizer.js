const SERVER_URL = "https://nvmso-backend.onrender.com";
let currentOrg = null;
let portalConfig = {};
let isAccountSettled = false;
let adminUpiId = "narmada@upi";
let currentNetPayable = 0;

document.addEventListener("DOMContentLoaded", () => {
  fetchGlobalConfigAndNotice();
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

  fetch(`${SERVER_URL}/api/organizer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: code, password: password })
  })
  .then(res => res.json())
  .then(response => {
    if (response.status === "success") {
      currentOrg = response.data;
      loadDashboardView();
      fetchRegisteredStudentsList(); 
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
    }
  });
});

function loadDashboardView() {
  document.getElementById("org-auth-section").classList.add("hidden");
  document.getElementById("org-view").classList.remove("hidden");

  const orgCodeKey = currentOrg.code || currentOrg.orgCode;
  document.getElementById("display-org-code").textContent = orgCodeKey;
  document.getElementById("display-org-name").textContent = currentOrg.name;
  document.getElementById("display-org-school").textContent = currentOrg.schoolName;
  
  const chatLink = document.getElementById("dashboard-chat-link");
  if(chatLink) {
    chatLink.href = `https://wa.me/919999999999?text=Hello%20NVMS%20Admin,%20I%20am%20organizer%20(${orgCodeKey}%20-%20${encodeURIComponent(currentOrg.schoolName)}).%20I%20need%20help%20regarding:`;
  }
  
  document.getElementById("principal-perm-checkbox").checked = !!currentOrg.principalApproved;
  document.getElementById("org-exam-mode-select").value = currentOrg.examMode || "online";
  document.getElementById("current-applicable-fee").textContent = (currentOrg.examMode === "offline") ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
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
      }

      container.innerHTML = "";
      if (data.students.length === 0) {
        container.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:15px;">No students registered under this school code yet.</td></tr>`;
        return;
      }

      // Dynamic Header for Result Ranking & Marks/Percentage
      const tableHead = document.getElementById("roster-table-head");
      if (tableHead) {
        if (data.isResultDeclared) {
          tableHead.innerHTML = `
            <th style="padding:10px;">Rank Order</th>
            <th style="padding:10px;">Student Name</th>
            <th style="padding:10px;">Roll Number</th>
            <th style="padding:10px;">Class</th>
            <th style="padding:10px;">Mode</th>
            <th style="padding:10px;">Payment Status</th>
            <th style="padding:10px;">Action / Verification</th>
            <th style="padding:10px; color:#4ade80;">Score Marks</th>
            <th style="padding:10px; color:#38bdf8;">Percentage</th>
          `;
        } else {
          tableHead.innerHTML = `
            <th style="padding:10px;">Student Name</th>
            <th style="padding:10px;">Roll Number</th>
            <th style="padding:10px;">Class</th>
            <th style="padding:10px;">Mode</th>
            <th style="padding:10px;">Payment Status</th>
            <th style="padding:10px;">Action / Verification</th>
          `;
        }
      }

      data.students.forEach(s => {
        const isApproved = s.paymentStatus === "Approved";
        const isOfflinePay = s.paymentMode === "offline";
        
        const statusBadge = isApproved ? "<span style='color:#4ade80; font-weight:bold;'>✔️ Approved</span>" : "<span style='color:#f87171; font-weight:bold;'>⏳ Pending Verification</span>";
        
        let actionCell = "<span>N/A</span>";
        if (!isApproved && isOfflinePay) {
          actionCell = `<button onclick="approveStudentCashEntry('${s.id}')" style="background:#10b981; color:#fff; border:none; padding:6px 12px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">💸 Approve Cash</button>`;
        } else if (!isApproved && !isOfflinePay) {
          actionCell = `<span style='color:#64748b; font-size:11px;'>Waiting UPI Ref</span>`;
        }

        let rankCell = data.isResultDeclared ? `<td style="padding:10px;"><strong>Rank #${s.rank}</strong></td>` : "";
        let scoreCells = data.isResultDeclared ? `<td style="padding:10px;"><span style='color:#4ade80; font-weight:bold;'>${s.score}</span></td><td style="padding:10px;"><span style='color:#38bdf8; font-weight:bold;'>${s.percentage}</span></td>` : "";

        const row = `<tr style="border-bottom: 1px solid #1e293b;">
          ${rankCell}
          <td style="padding:10px;"><strong>${s.studentName}</strong></td>
          <td style="padding:10px;"><code>${s.rollNumber}</code></td>
          <td style="padding:10px;">Class ${s.studentClass}</td>
          <td style="padding:10px;"><span style="background:#1e293b; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; color:${isOfflinePay ? '#fbbf24':'#38bdf8'}">${s.paymentMode.toUpperCase()}</span></td>
          <td style="padding:10px;">${statusBadge}</td>
          <td style="padding:10px;">${actionCell}</td>
          ${scoreCells}
        </tr>`;
        container.innerHTML += row;
      });
    }
  });
}

window.approveStudentCashEntry = function(studentId) {
  if(!confirm("Confirm cash collection payment verification approval?")) return;

  fetch(`${SERVER_URL}/api/organizer/approve_payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      alert("🎉 Registration Fee Cash Payment Verification Approved Successfully!");
      fetchRegisteredStudentsList(); 
    }
  });
};

// ⚡ DIRECT UPI / PHONEPE PAYMENT TO NVMS
window.payNetPayableToNvms = function() {
  if (currentNetPayable <= 0) {
    alert("⚠️ No net amount payable to NVMS right now.");
    return;
  }
  const orgCode = currentOrg.code || currentOrg.orgCode;
  const upiLink = `upi://pay?pa=${adminUpiId}&pn=NVMSO%20Central%20Admin&am=${currentNetPayable}&cu=INR&tn=Settlement%20for%20${orgCode}`;
  
  // Trigger UPI intent / app (PhonePe, GPay, Paytm)
  window.location.href = upiLink;

  setTimeout(() => {
    const utr = prompt("Enter UTR / Transaction Reference Number after successful payment to notify NVMS Admin:");
    if (utr) {
      fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgCode: orgCode, utrNumber: utr, amount: currentNetPayable })
      })
      .then(res => res.json())
      .then(d => {
        if(d.status === "success") {
          alert("✅ Settlement payment proof submitted successfully! Admin will verify and unlock commission payouts.");
        }
      });
    }
  }, 1500);
};

window.requestCommissionPayout = function() {
  if (!isAccountSettled) {
    alert("🔒 Locked: You must pay the net amount to NVMS first before requesting a commission payout!");
    return;
  }

  const upiId = document.getElementById("payout-upi-input").value.trim();
  const netPayableText = document.getElementById("fin-direct-comm").textContent;
  const amount = parseFloat(netPayableText.replace('₹', '')) || 0;

  if(!upiId) {
    alert("⚠️ Please enter your valid UPI ID for payout request.");
    return;
  }

  fetch(`${SERVER_URL}/api/organizer/request_payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: currentOrg.code || currentOrg.orgCode,
      upiId: upiId,
      amount: amount
    })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      alert("✅ Commission Payout Request sent successfully to NVMS Admin!");
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

window.logoutOrganizerSession = () => { location.reload(); };
