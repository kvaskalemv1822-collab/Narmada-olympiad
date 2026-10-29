/**
 * Narmada Valley Maths & Science Olympiad (NVMSO)
 * Official School Organizer Dashboard Script
 * Wired to Unified Central Python Backend Engine
 */

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
        } else if (noticeBanner) {
          noticeBanner.classList.add("hidden");
        }
      }
    }).catch(err => console.log("Config load offline."));
}

window.verifyOrgLogin = async () => {
  const code = document.getElementById("org-code-input").value.trim().toUpperCase();
  const password = document.getElementById("org-pass-input").value.trim();

  if(!code || !password) { alert("Please enter both Organizer Code & Password!"); return; }

  fetch(`${SERVER_URL}/api/organizer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: code, password: password })
  })
  .then(res => {
    if (!res.ok) throw new Error("Invalid Credentials");
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
      alert(`🎉 REGISTRATION SUCCESSFUL!\n\nYour Unique Organizer Code is: ${data.orgCode}\nSecret Recovery PIN: ${payload.pin}\n\nShare this Code with your students to unlock registration.`);
      location.reload();
    } else {
      alert("❌ Setup Error: " + data.message);
    }
  });
});

function loadDashboardView() {
  document.getElementById("org-auth-section")?.classList.add("hidden");
  document.getElementById("org-view")?.classList.remove("hidden");

  const orgCodeKey = currentOrg.code || currentOrg.orgCode;
  const examMode = (currentOrg.examMode || "online").toUpperCase();

  if (document.getElementById("display-org-code")) {
    document.getElementById("display-org-code").innerHTML = `${orgCodeKey} - <span style="color:${examMode === 'OFFLINE' ? '#fbbf24' : '#38bdf8'}; font-weight:bold;">${examMode}</span>`;
  }
  if (document.getElementById("display-org-name")) document.getElementById("display-org-name").textContent = currentOrg.name;
  if (document.getElementById("display-org-school")) document.getElementById("display-org-school").textContent = currentOrg.schoolName;

  document.getElementById("principal-perm-checkbox").checked = !!currentOrg.principalApproved;
}

function enforceNumericInputs() {
  ['new-org-contact', 'new-org-pin', 'reset-org-contact', 'reset-org-pin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ""); });
    }
  });
}

window.switchOrgTab = (tab) => {
  document.getElementById("org-reg-box")?.classList.add("hidden");
  document.getElementById("org-login-box")?.classList.add("hidden");
  document.getElementById("org-forgot-box")?.classList.add("hidden");

  if (tab === 'reg') document.getElementById("org-reg-box")?.classList.remove("hidden");
  else if (tab === 'forgot') document.getElementById("org-forgot-box")?.classList.remove("hidden");
  else document.getElementById("org-login-box")?.classList.remove("hidden");
};
