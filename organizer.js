const SERVER_URL = "https://onrender.com";

window.verifyOrgLogin = async () => {
  const code = document.getElementById("org-code-input").value.trim().toUpperCase();
  const password = document.getElementById("org-pass-input").value.trim();

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
  .catch(() => { alert("❌ Invalid Organizer Code or Password!"); });
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
      alert(`🎉 Registration Successful!\nYour Code: ${data.orgCode}`);
      location.reload();
    } else {
      alert("❌ Error: " + data.message);
    }
  });
});
