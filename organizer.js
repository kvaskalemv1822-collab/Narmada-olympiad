const SERVER_URL = "https://nvmso-backend.onrender.com";
let currentOrg = null;
let portalConfig = {};

document.addEventListener("DOMContentLoaded", () => {
  fetchGlobalConfigAndNotice();
  enforceNumericInputs();
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
    }).catch(err => console.log("Notice channel connection signature delay."));
}

window.verifyOrgLogin = async () => {
  const code = document.getElementById("org-code-input").value.trim().toUpperCase();
  const password = document.getElementById("org-pass-input").value.trim();

  if(!code || !password) { alert("Please input authorization credentials."); return; }

  fetch(`${SERVER_URL}/api/organizer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: code, password: password })
  })
  .then(res => {
    if (!res.ok) throw new Error();
    return res.json();
  })
  .then(response => {
    currentOrg = response.data;
    loadDashboardView();
  })
  .catch(() => { alert("❌ Access Denied: Invalid Organizer Code or Password!"); });
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
      alert(`🎉 Desk Profile Created Successfully!\n\nYour Live Organizer Code is: ${data.orgCode}\n\nProvide this code to your students to launch registration.`);
      location.reload();
    } else {
      alert("❌ Operation Terminated: " + data.message);
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
  
  document.getElementById("principal-perm-checkbox").checked = !!currentOrg.principalApproved;
  document.getElementById("org-exam-mode-select").value = currentOrg.examMode || "online";
  document.getElementById("current-applicable-fee").textContent = (currentOrg.examMode === "offline") ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
}

// 🚨 MODE PERSISTENCE FIX: Saves mode configurations securely to server documents
window.updateExamMode = function(val) {
  if (!currentOrg) return;
  
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: currentOrg.code || currentOrg.orgCode,
      examMode: val,
      principalApproved: currentOrg.principalApproved
    })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      currentOrg.examMode = val;
      document.getElementById("current-applicable-fee").textContent = val === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
      alert(`✅ Configuration Updated: Mode shifted to ${val.toUpperCase()} successfully!`);
    }
  }).catch(() => alert("Network validation error."));
};

window.togglePrincipalPermission = function(isChecked) {
  if (!currentOrg) return;
  
  fetch(`${SERVER_URL}/api/organizer/update_profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orgCode: currentOrg.code || currentOrg.orgCode,
      examMode: currentOrg.examMode || "online",
      principalApproved: isChecked
    })
  })
  .then(res => res.json())
  .then(data => {
    if(data.status === "success") {
      currentOrg.principalApproved = isChecked;
      alert(isChecked ? "📜 Principal verification marked live on server ledger!" : "🔒 Approval revoked.");
    }
  });
};

function enforceNumericInputs() {
  ['new-org-contact', 'new-org-pin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); });
  });
}

window.switchOrgTab = (tab) => {
  if (tab === 'reg') {
    document.getElementById("org-reg-box").classList.remove("hidden");
    document.getElementById("org-login-box").classList.add("hidden");
  } else {
    document.getElementById("org-reg-box").classList.add("hidden");
    document.getElementById("org-login-box").classList.remove("hidden");
  }
};
