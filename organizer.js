const SERVER_URL = "https://nvmso-backend.onrender.com";
let currentOrg = null;
let portalConfig = {};
let isAccountSettled = false;
let adminUpiId = "narmada@upi";
let currentNetPayable = 0;
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
    } else { alert("❌ Access Denied!"); }
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
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }).then(res => res.json()).then(data => {
    if (data.status === "success") { alert(`🎉 Account Created! Code: ${data.orgCode}`); location.reload(); }
    else { alert("❌ Error: " + data.message); }
  });
});

function loadDashboardView() {
  document.getElementById("org-auth-section").classList.add("hidden");
  document.getElementById("org-view").classList.remove("hidden");
  const orgCodeKey = currentOrg.code || currentOrg.orgCode;
  document.getElementById("display-org-code").textContent = orgCodeKey;
  document.getElementById("principal-perm-checkbox").checked = !!currentOrg.principalApproved;
  document.getElementById("org-exam-mode-select").value = currentOrg.examMode || "online";
  document.getElementById("current-applicable-fee").textContent = (currentOrg.examMode === "offline") ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);

  if (!autoRefreshTimer) {
    autoRefreshTimer = setInterval(() => { fetchRegisteredStudentsList(); fetchOrganizerChatMessages(); }, 8000);
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
      isAccountSettled = !!data.isSettled;
      adminUpiId = data.adminUpiId || "narmada@upi";
      if (data.financials) {
        currentNetPayable = data.financials.netPayableToNvms;
        document.getElementById("fin-total-regs").textContent = data.financials.totalRegistrations;
        document.getElementById("fin-total-fees").textContent = `₹${data.financials.totalFees}`;
        document.getElementById("fin-direct-comm").textContent = `₹${data.financials.directCommission}`;
        document.getElementById("fin-ref-comm").textContent = `₹${data.financials.referralCommission}`;
        document.getElementById("fin-net-payable").textContent = `₹${currentNetPayable}`;
        document.getElementById("settlement-amount-input").value = currentNetPayable;
      }

      container.innerHTML = data.students.length ? "" : `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:15px;">No students registered.</td></tr>`;
      data.students.forEach(s => {
        const isApproved = s.paymentStatus === "Approved" || s.paymentVerified === true;
        const payMode = (s.paymentMode || "online").toUpperCase();
        let utrInfo = s.utrNumber ? `<br><code style="color:#facc15; font-size:11px;">UTR: ${s.utrNumber}</code>` : "";

        let actionCell = `<span style="color:#4ade80; font-weight:bold;">Approved</span>`;
        if (!isApproved && s.paymentMode === 'offline') {
          actionCell = `<button onclick="approveStudentCashEntry('${s.id}')" style="background:#10b981; color:#fff; padding:5px 10px; font-size:11px; border-radius:4px; font-weight:bold; cursor:pointer;">💸 Approve Cash</button>`;
        } else if (!isApproved) {
          actionCell = `<span style='color:#f59e0b; font-size:11px;'>Awaiting UTR Approval</span>`;
        }

        container.innerHTML += `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding:10px;"><strong>${s.studentName}</strong></td>
            <td style="padding:10px;"><code style="color:#38bdf8;">${s.rollNumber}</code></td>
            <td style="padding:10px;">Class ${s.studentClass}</td>
            <td style="padding:10px;">${payMode}</td>
            <td style="padding:10px;"><span style="color:${isApproved ? '#4ade80' : '#f59e0b'}; font-weight:bold;">${s.paymentStatus || 'Pending'}</span>${utrInfo}</td>
            <td style="padding:10px;">${actionCell}</td>
          </tr>
        `;
      });
    }
  });
}

window.approveStudentCashEntry = function(studentId) {
  if(!confirm("Approve cash payment?")) return;
  fetch(`${SERVER_URL}/api/organizer/approve_cash`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId: studentId, orgCode: currentOrg.code || currentOrg.orgCode })
  }).then(res => res.json()).then(() => fetchRegisteredStudentsList());
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

window.payNetPayableToNvms = function() {
  if (currentNetPayable <= 0) { alert("⚠️ No net amount payable."); return; }
  window.location.href = `upi://pay?pa=${adminUpiId}&pn=NVMSO&am=${currentNetPayable}&cu=INR&tn=Settlement`;
};

window.submitSettlementProof = function() {
  const utr = document.getElementById("settlement-utr-input").value.trim();
  const amount = parseFloat(document.getElementById("settlement-amount-input").value) || currentNetPayable;
  if(!utr) { alert("⚠️ Please enter UTR."); return; }
  fetch(`${SERVER_URL}/api/organizer/submit_settlement`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: currentOrg.code || currentOrg.orgCode, utrNumber: utr, amount: amount })
  }).then(() => { alert("✅ Settlement proof submitted!"); fetchRegisteredStudentsList(); });
};

window.switchOrgTab = (tab) => {
  document.getElementById("org-reg-box").classList.toggle("hidden", tab !== 'reg');
  document.getElementById("org-login-box").classList.toggle("hidden", tab === 'reg');
};

window.logoutOrganizerSession = () => { localStorage.clear(); location.reload(); };
