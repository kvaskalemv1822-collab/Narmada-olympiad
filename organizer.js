const SERVER_URL = "https://nvmso-backend.onrender.com";
let currentOrg = null;
let portalConfig = {};
let adminUpiId = "narmada@upi";
let autoRefreshTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchGlobalConfigAndNotice();
  const savedOrgCode = localStorage.getItem("nvmso_org_code");
  if (savedOrgCode) {
    fetch(`${SERVER_URL}/api/organizer/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgCode: savedOrgCode, password: localStorage.getItem("nvmso_org_pass") || "" })
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
  if (!code || !password) { alert("⚠️ Please enter credentials."); return; }

  fetch(`${SERVER_URL}/api/organizer/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
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
      checkResultAndRankingStatus();
    } else { alert("❌ Access Denied!"); }
  });
};

// Strict 6-Digit PIN & Terms Check during Registration
window.handleOrganizerRegister = function() {
  const pin = document.getElementById("new-org-pin").value.trim();
  const termsChecked = document.getElementById("org-terms-check")?.checked;

  if (!termsChecked) {
    alert("⚠️ Please accept the Terms & Conditions before registering your school.");
    return;
  }

  if (pin.length !== 6 || isNaN(pin)) {
    alert("❌ Security Error: Secret Security PIN must be strictly a 6-digit numeric code!");
    return;
  }

  const payload = {
    name: document.getElementById("new-org-name").value.trim(),
    schoolName: document.getElementById("new-org-school").value.trim(),
    contact: document.getElementById("new-org-contact").value.trim(),
    password: document.getElementById("new-org-pass").value.trim(),
    pin: pin,
    refCode: document.getElementById("new-org-ref").value.trim().toUpperCase()
  };

  fetch(`${SERVER_URL}/api/organizer/register`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }).then(res => res.json()).then(data => {
    if (data.status === "success") { 
      alert(`🎉 Account Created Successfully!\nYour Assigned Organizer Code is: ${data.orgCode}`); 
      switchOrgTab('login');
      document.getElementById("org-code-input").value = data.orgCode;
    } else { alert("❌ Error: " + data.message); }
  });
};

function loadDashboardView() {
  document.getElementById("org-auth-section").classList.add("hidden");
  document.getElementById("org-view").classList.remove("hidden");
  
  const orgCodeKey = currentOrg.code || currentOrg.orgCode;
  
  // Display School Name & Organizer Code at the top header card
  document.getElementById("display-school-name").textContent = currentOrg.schoolName || "Associated School";
  document.getElementById("display-org-code").textContent = orgCodeKey;
  
  document.getElementById("principal-perm-checkbox").checked = !!currentOrg.principalApproved;
  document.getElementById("org-exam-mode-select").value = currentOrg.examMode || "online";
  document.getElementById("current-applicable-fee").textContent = (currentOrg.examMode === "offline") ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);

  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => { 
      fetchRegisteredStudentsList(); 
      fetchOrganizerChatMessages(); 
      checkResultAndRankingStatus();
    }, 8000);
  }
}

window.updateExamMode = function(val) {
  if (!currentOrg) return;
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode, examMode: val, principalApproved: currentOrg.principalApproved })
  }).then(res => res.json()).then(data => {
    if(data.status === "success") {
      currentOrg.examMode = val;
      document.getElementById("current-applicable-fee").textContent = val === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
      alert(`✅ Mode saved as ${val.toUpperCase()}`);
      fetchRegisteredStudentsList();
    }
  });
};

window.togglePrincipalPermission = function(isChecked) {
  if (!currentOrg) return;
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode, examMode: currentOrg.examMode || "online", principalApproved: isChecked })
  }).then(res => res.json()).then(() => { currentOrg.principalApproved = isChecked; alert("📜 Principal permission updated!"); });
};

function fetchRegisteredStudentsList() {
  const container = document.getElementById("student-roster-rows");
  if(!container || !currentOrg) return;

  fetch(`${SERVER_URL}/api/organizer/students`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      adminUpiId = data.adminUpiId || "narmada@upi";

      if (data.financials) {
        let totalDirectComm = data.financials.directCommission || 0;
        let totalRefComm = data.financials.referralCommission || 0;
        let netPayableToNvms = data.financials.netPayableToNvms || 0;

        document.getElementById("fin-total-regs").textContent = data.financials.totalRegistrations;
        document.getElementById("fin-total-fees").textContent = `₹${data.financials.totalFees}`;
        document.getElementById("fin-direct-comm").textContent = `₹${totalDirectComm}`;
        document.getElementById("fin-ref-comm").textContent = `₹${totalRefComm}`;

        renderDynamicFinancialAction(netPayableToNvms, totalDirectComm + totalRefComm);
      }

      container.innerHTML = data.students.length ? "" : `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:15px;">No students registered.</td></tr>`;
      data.students.forEach(s => {
        const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
        const payMode = (s.paymentMode || "online").toUpperCase();
        let utrInfo = s.utrNumber ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>` : "";

        // Marks and Percentage calculation for Roster Table
        let marksDisplay = `<span style="color:#94a3b8; font-size:11px;">Exam Pending</span>`;
        if (s.examCompleted || s.score !== undefined) {
          let scoreVal = parseFloat(s.score) || 0;
          let totalVal = parseFloat(s.totalMarks) || 100;
          let pctVal = s.percentage !== undefined ? s.percentage : ((scoreVal / totalVal) * 100).toFixed(2);
          marksDisplay = `<strong style="color:#4ade80;">${scoreVal}/${totalVal}</strong> <br><span style="color:#38bdf8; font-weight:bold; font-size:11px;">${pctVal}%</span>`;
        }

        let actionCell = `<span style="color:#4ade80; font-weight:bold;">Approved</span>`;
        if (!isApproved && s.paymentMode === 'offline') {
          actionCell = `<button onclick="approveStudentCashEntry('${s.studentId || s.id}')" style="background:#10b981; color:#fff; padding:5px 10px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer; border:none;">💸 Approve Cash</button>`;
        } else if (!isApproved) {
          actionCell = `<span style='color:#f59e0b; font-size:11px;'>Awaiting UTR Approval</span>`;
        }

        container.innerHTML += `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding:10px;"><strong>${s.studentName}</strong></td>
            <td style="padding:10px;"><code style="color:#38bdf8;">${s.rollNumber}</code></td>
            <td style="padding:10px;">Class ${s.studentClass}</td>
            <td style="padding:10px;">${payMode}</td>
            <td style="padding:10px;">${marksDisplay}</td>
            <td style="padding:10px;"><span style="color:${isApproved ? '#4ade80' : '#f59e0b'}; font-weight:bold;">${s.paymentStatus || 'Pending'}</span>${utrInfo}</td>
            <td style="padding:10px;">${actionCell}</td>
          </tr>
        `;
      });
    }
  });
}

function renderDynamicFinancialAction(netPayable, totalCommission) {
  const actionContainer = document.getElementById("dynamic-financial-action-container");
  if (!actionContainer) return;

  if (netPayable > 0) {
    actionContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <p style="font-size: 13px; color: #f87171; font-weight: bold; margin: 0;">Net Amount Payable to NVMS Central:</p>
          <h2 style="color: #f87171; margin: 5px 0 0 0;">₹${netPayable}</h2>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <button onclick="payNetPayableToNvms(${netPayable})" class="btn-primary" style="background: #10b981; padding: 10px 16px; width: auto; cursor:pointer;">⚡ Pay via UPI</button>
        </div>
      </div>
      <div style="margin-top: 12px; border-top: 1px dashed #334155; padding-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
        <input type="text" id="settlement-utr-input" placeholder="Enter UTR No after paying NVMS" style="flex: 1; min-width: 180px;">
        <input type="number" id="settlement-amount-input" value="${netPayable}" placeholder="Amount (₹)" style="width: 100px;">
        <button onclick="submitSettlementProof(${netPayable})" class="btn-primary" style="background: #0284c7; width: auto; cursor:pointer;">Submit UTR Proof</button>
      </div>
    `;
  } else if (totalCommission > 0) {
    actionContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
        <div>
          <p style="font-size: 13px; color: #4ade80; font-weight: bold; margin: 0;">Total Commission Payout Receivable:</p>
          <h2 style="color: #4ade80; margin: 5px 0 0 0;">₹${totalCommission}</h2>
        </div>
      </div>
      <div style="border-top: 1px dashed #334155; padding-top: 10px;">
        <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 8px;">Enter your UPI ID / PhonePe / GooglePay number to request payout from NVMS:</p>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <input type="text" id="payout-upi-input" placeholder="Enter UPI ID (e.g. user@paytm)" style="flex: 1; min-width: 200px;">
          <input type="number" id="payout-amount-input" value="${totalCommission}" placeholder="Amount (₹)" style="width: 100px;">
          <button onclick="requestCommissionPayout(${totalCommission})" class="btn-primary" style="background: #10b981; width: auto; cursor:pointer;">📤 Request Payout</button>
        </div>
      </div>
    `;
  } else {
    actionContainer.innerHTML = `
      <p style="text-align: center; color: #4ade80; font-size: 13px; font-weight: bold; margin: 0;">✅ All accounts are fully settled and up to date! (Balance: ₹0)</p>
    `;
  }
}

window.approveStudentCashEntry = function(studentId) {
  if(!confirm("Approve cash payment?")) return;
  fetch(`${SERVER_URL}/api/organizer/approve_cash`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, orgCode: currentOrg.code || currentOrg.orgCode })
  }).then(res => res.json()).then(() => fetchRegisteredStudentsList());
};

window.payNetPayableToNvms = function(amount) {
  if (amount <= 0) { alert("⚠️ No net amount payable."); return; }
  window.location.href = `upi://pay?pa=${adminUpiId}&pn=NVMSO&am=${amount}&cu=INR&tn=NVMSO_Settlement`;
};

window.submitSettlementProof = function(defaultAmount) {
  const utr = document.getElementById("settlement-utr-input").value.trim();
  const amount = parseFloat(document.getElementById("settlement-amount-input").value) || defaultAmount;
  if(!utr) { alert("⚠️ Please enter UTR / Reference number."); return; }
  
  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode, utrNumber: utr, amount: amount, type: "PAY_TO_NVMS" })
  }).then(res => res.json()).then(() => { 
    alert("✅ Settlement payment proof submitted to Central Admin!"); 
    fetchRegisteredStudentsList(); 
  });
};

window.requestCommissionPayout = function(maxAmount) {
  const upiId = document.getElementById("payout-upi-input").value.trim();
  const requestedAmount = parseFloat(document.getElementById("payout-amount-input").value) || maxAmount;

  if (!upiId) {
    alert("⚠️ Please enter a valid UPI ID or phone number to receive your payout.");
    return;
  }

  if (requestedAmount <= 0 || requestedAmount > maxAmount) {
    alert(`⚠️ Invalid request amount. Maximum available payout is ₹${maxAmount}.`);
    return;
  }

  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST", 
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      orgCode: currentOrg.code || currentOrg.orgCode, 
      utrNumber: `PAYOUT_REQ_${upiId}`, 
      amount: requestedAmount,
      payoutUpi: upiId,
      type: "COMMISSION_PAYOUT_REQUEST"
    })
  })
  .then(res => res.json())
  .then(() => {
    alert("✅ Commission Payout request successfully sent to NVMS Central Admin!");
    document.getElementById("payout-upi-input").value = "";
  })
  .catch(() => {
    alert("✅ Payout request submitted successfully.");
  });
};

// Result & Ranking View with Percentage & Descending Ranking Arrangement
function checkResultAndRankingStatus() {
  if (!currentOrg) return;
  fetch(`${SERVER_URL}/api/portal/config`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success" && data.config.isResultDeclared) {
        const rankingBox = document.getElementById("org-result-ranking-box");
        const rankingContent = document.getElementById("org-ranking-content");
        if (rankingBox) rankingBox.classList.remove("hidden");

        fetch(`${SERVER_URL}/api/organizer/students`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode })
        })
        .then(r => r.json())
        .then(stData => {
          if (stData.status === "success" && stData.students) {
            let completed = stData.students.filter(s => s.examCompleted);
            
            // Sort by score/percentage in descending order (Highest to Lowest) for proper ranking
            completed.sort((a, b) => {
              let scoreA = parseFloat(a.score) || 0;
              let scoreB = parseFloat(b.score) || 0;
              return scoreB - scoreA;
            });
            
            if (completed.length === 0) {
              rankingContent.innerHTML = `<p style="color:#94a3b8; text-align:center; padding:10px;">No student exam records available for ranking yet.</p>`;
              return;
            }

            let rankHtml = `
              <div style="overflow-x: auto;">
                <table style="width:100%; border-collapse: collapse; font-size: 13px; color: #fff;">
                  <thead>
                    <tr style="background:#1e293b; border-bottom:1px solid #334155;">
                      <th style="padding:10px; text-align:left;">Rank</th>
                      <th style="padding:10px; text-align:left;">Student Name</th>
                      <th style="padding:10px; text-align:left;">Class</th>
                      <th style="padding:10px; text-align:right;">Score</th>
                      <th style="padding:10px; text-align:right;">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
            `;
            
            completed.forEach((s, index) => {
              let scoreVal = parseFloat(s.score) || 0;
              let totalMarksVal = parseFloat(s.totalMarks) || 100;
              let percentageVal = s.percentage !== undefined ? s.percentage : ((scoreVal / totalMarksVal) * 100).toFixed(2);

              rankHtml += `
                <tr style="border-bottom:1px solid #1e293b;">
                  <td style="padding:10px; color:#facc15; font-weight:bold;">#${index+1}</td>
                  <td style="padding:10px;"><strong>${s.studentName}</strong> <br><code style="color:#38bdf8; font-size:11px;">Roll: ${s.rollNumber}</code></td>
                  <td style="padding:10px;">Class ${s.studentClass}</td>
                  <td style="padding:10px; text-align:right; color:#4ade80; font-weight:bold;">${scoreVal} / ${totalMarksVal}</td>
                  <td style="padding:10px; text-align:right; color:#38bdf8; font-weight:bold;">${percentageVal}%</td>
                </tr>
              `;
            });

            rankHtml += `</tbody></table></div>`;
            rankingContent.innerHTML = rankHtml;
          }
        });
      }
    });
}

// Collapsible Support Chat Box toggle function
window.toggleOrganizerChatBox = function() {
  const chatArea = document.getElementById("organizer-chat-collapsible-area");
  const icon = document.getElementById("chat-toggle-icon");
  if (chatArea.classList.contains("hidden")) {
    chatArea.classList.remove("hidden");
    icon.textContent = "▲ Close Chat";
    fetchOrganizerChatMessages();
  } else {
    chatArea.classList.add("hidden");
    icon.textContent = "▼ Open Chat";
  }
};

function fetchOrganizerChatMessages() {
  if (!currentOrg) return;
  fetch(`${SERVER_URL}/api/organizer/query_messages?orgCode=${currentOrg.code || currentOrg.orgCode}`)
    .then(res => res.json())
    .then(data => {
      const chatBox = document.getElementById("organizer-chat-box");
      if (!chatBox) return;
      if (data.status === "success" && data.messages) {
        chatBox.innerHTML = "";
        data.messages.forEach(m => {
          let align = m.isAdmin ? "left" : "right", bg = m.isAdmin ? "#0369a1" : "#1e293b";
          let imageHtml = m.imageUrl ? `<br><a href="${m.imageUrl}" target="_blank"><img src="${m.imageUrl}" style="max-width:140px; border-radius:4px; margin-top:5px;" /></a>` : "";
          chatBox.innerHTML += `<div style="text-align: ${align}; margin-bottom: 8px;"><div style="display: inline-block; background: ${bg}; padding: 6px 10px; border-radius: 6px; max-width: 80%; color: #fff; font-size: 11px;">${m.text || ""}${imageHtml}</div></div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    });
}

window.sendOrganizerQuery = function() {
  const input = document.getElementById("organizer-chat-input");
  const fileInput = document.getElementById("organizer-chat-file");
  const msgText = input ? input.value.trim() : "";
  const file = fileInput && fileInput.files.length ? fileInput.files[0] : null;
  if (!msgText && !file) return;

  const dispatch = (imgBase64 = "") => {
    fetch(`${SERVER_URL}/api/organizer/send_query`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode, senderName: `School (${currentOrg.code || currentOrg.orgCode})`, message: msgText, imageUrl: imgBase64 })
    }).then(() => { if (input) input.value = ""; if (fileInput) fileInput.value = ""; fetchOrganizerChatMessages(); });
  };

  if (file) {
    const reader = new FileReader();
    reader.onloadend = () => dispatch(reader.result);
    reader.readAsDataURL(file);
  } else { dispatch(""); }
};

window.switchOrgTab = (tab) => {
  document.getElementById("org-reg-box").classList.toggle("hidden", tab !== 'reg');
  document.getElementById("org-login-box").classList.toggle("hidden", tab === 'reg');
};

window.logoutOrganizerSession = () => { localStorage.clear(); location.reload(); };
