import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBVPLR8q1NpUNSpmsDdKcqPAo_z1vZOvnA",
  authDomain: "narmadaolympiad.firebaseapp.com",
  projectId: "narmadaolympiad",
  storageBucket: "narmadaolympiad.firebasestorage.app",
  messagingSenderId: "530081464040",
  appId: "1:530081464040:web:156f425df2a6850f9e535d",
  databaseURL: "https://narmadaolympiad-default-rtdb.asia-south1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentOrgCode = localStorage.getItem("nvms_org_code") || "";
let portalConfigData = {};

// 1. Organizer Login with 6-Digit Strict PIN Validation
window.verifyOrganizerLogin = async () => {
  const codeInput = document.getElementById("org-login-code").value.trim();
  const passInput = document.getElementById("org-login-pass").value.trim();
  const alertBox = document.getElementById("org-login-alert");

  if (!codeInput || !passInput) {
    if (alertBox) {
      alertBox.textContent = "Please enter both Organization Code and Password!";
      alertBox.style.display = "block";
    }
    return;
  }

  // Strict 6-Digit PIN validation check
  if (passInput.length !== 6 || isNaN(passInput)) {
    if (alertBox) {
      alertBox.textContent = "⚠️ Security Error: PIN / Password strictly 6 digits ka hona chahiye!";
      alertBox.style.display = "block";
    }
    return;
  }

  try {
    const orgRef = doc(db, "organizers", codeInput);
    const orgSnap = await getDoc(orgRef);

    if (orgSnap.exists()) {
      const data = orgSnap.data();
      const orgPass = data.password || data.pass || "123456";

      if (passInput === orgPass) {
        localStorage.setItem("nvms_org_code", codeInput);
        currentOrgCode = codeInput;
        document.getElementById("org-login-screen").classList.add("hidden");
        document.getElementById("org-main-container").classList.remove("hidden");
        initializeOrganizerPanel();
      } else {
        if (alertBox) {
          alertBox.textContent = "Incorrect 6-Digit PIN!";
          alertBox.style.display = "block";
        }
      }
    } else {
      if (alertBox) {
        alertBox.textContent = "Organizer Code not found!";
        alertBox.style.display = "block";
      }
    }
  } catch (err) {
    console.error(err);
    if (alertBox) {
      alertBox.textContent = "Login error. Check internet connection.";
      alertBox.style.display = "block";
    }
  }
};

window.logoutOrganizer = () => {
  localStorage.removeItem("nvms_org_code");
  location.reload();
};

// Auto login check on load
window.addEventListener("DOMContentLoaded", () => {
  if (currentOrgCode) {
    const loginScreen = document.getElementById("org-login-screen");
    const mainContainer = document.getElementById("org-main-container");
    if (loginScreen) loginScreen.classList.add("hidden");
    if (mainContainer) mainContainer.classList.remove("hidden");
    initializeOrganizerPanel();
  }
});

function initializeOrganizerPanel() {
  loadPortalConfigAndData();
}

function loadPortalConfigAndData() {
  onSnapshot(doc(db, "settings", "portal_config"), (docSnap) => {
    if (docSnap.exists()) {
      portalConfigData = docSnap.data();
    }
    loadOrganizerDetailsAndStudents();
  });
}

function loadOrganizerDetailsAndStudents() {
  if (!currentOrgCode) return;

  onSnapshot(doc(db, "organizers", currentOrgCode), (orgSnap) => {
    if (!orgSnap.exists()) return;
    const orgData = orgSnap.data();
    const schoolName = orgData.schoolName || orgData.name || "School";
    const examMode = (orgData.examMode || "online").toUpperCase();

    // Render ORGCODE - OFFLINE / ONLINE format in Header
    const headerEl = document.getElementById("org-profile-header");
    if (headerEl) {
      headerEl.innerHTML = `
        <h2 style="color: #f8fafc; font-size: 20px; font-weight: bold;">
          ${currentOrgCode} - <span style="color: ${examMode === 'OFFLINE' ? '#fbbf24' : '#38bdf8'};">${examMode}</span>
        </h2>
        <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">${schoolName} | Coordinator: ${orgData.name}</p>
      `;
    }

    onSnapshot(collection(db, "students"), (stuSnap) => {
      let orgStudents = [];
      stuSnap.forEach(d => {
        const sData = d.data();
        if (sData.orgCode === currentOrgCode) {
          orgStudents.push({ id: d.id, ...sData });
        }
      });

      renderOrganizerDashboardMetrics(orgData, orgStudents);
    });
  });
}

function renderOrganizerDashboardMetrics(orgData, studentsList) {
  let totalCount = studentsList.length;
  let cashCollection = 0;
  let onlineCollection = 0;

  const tbody = document.querySelector("#org-students-table tbody");
  if (tbody) tbody.innerHTML = "";

  studentsList.forEach((s, index) => {
    const payMode = s.paymentMode || s.payMode || "cash";
    const fee = Number(s.feePaid || s.fee) || 100;
    const isPaid = s.cashApproved || s.paymentConfirmed || payMode === "online";

    if (isPaid) {
      if (payMode === "cash") cashCollection += fee;
      else onlineCollection += fee;
    }

    if (tbody) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${s.rollNumber || s.roll || 'N/A'}</strong></td>
        <td>${s.studentName || s.name}</td>
        <td>Class ${s.studentClass || s.stdClass}</td>
        <td><span style="color:${payMode === 'online' ? '#38bdf8' : '#fbbf24'}; font-weight:bold;">${payMode.toUpperCase()}</span></td>
        <td><span style="color:${isPaid ? '#4ade80' : '#facc15'}; font-weight:bold;">${isPaid ? 'PAID' : 'PENDING'}</span></td>
      `;
      tbody.appendChild(tr);
    }
  });

  // 15% Direct Commission Calculation
  let totalCollectedAmount = cashCollection + onlineCollection;
  let organizerCommission = orgData.examMode === "offline" ? (totalCount * 15) : (totalCollectedAmount * 0.15);
  
  // Net Dues to NVMSO
  let netPayableToNvms = cashCollection - organizerCommission;
  if (netPayableToNvms < 0) netPayableToNvms = 0;

  let lastSettled = orgData.lastSettledCash || 0;
  let finalDues = orgData.manualSettled ? Math.max(0, netPayableToNvms - lastSettled) : netPayableToNvms;

  if (document.getElementById("org-total-students")) document.getElementById("org-total-students").textContent = totalCount;
  if (document.getElementById("org-total-collection")) document.getElementById("org-total-collection").textContent = `₹${totalCollectedAmount}`;
  if (document.getElementById("org-my-commission")) document.getElementById("org-my-commission").textContent = `₹${organizerCommission.toFixed(2)} (15%)`;
  if (document.getElementById("org-net-payable")) document.getElementById("org-net-payable").textContent = `₹${finalDues.toFixed(2)}`;

  // Render Auto-Filled UPI Payment Button with exact dues
  const payContainer = document.getElementById("organizer-pay-container");
  if (payContainer) {
    if (finalDues > 0) {
      let upiId = portalConfigData.upiId || "narmada@upi";
      let payeeName = "Narmada Valley Olympiad";
      let upiIntentUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${finalDues}&cu=INR`;

      payContainer.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); padding: 20px; border-radius: 10px; border: 1px solid #10b981; text-align: center;">
          <p style="color: #34d399; font-weight: bold; margin-bottom: 10px;">Pending Dues to NVMSO: ₹${finalDues.toFixed(2)}</p>
          <a href="${upiIntentUrl}" class="btn-primary" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Pay ₹${finalDues.toFixed(2)} Now (Auto-Filled UPI)
          </a>
          <button onclick="notifyAdminPaymentDone('${finalDues}')" style="display:block; margin: 10px auto 0 auto; background:#0284c7; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:12px;">Notify Admin (I Have Paid)</button>
        </div>
      `;
    } else {
      payContainer.innerHTML = `<div style="color: #4ade80; font-weight: bold; padding: 15px; text-align: center;">✅ All dues fully settled with NVMSO!</div>`;
    }
  }
}

window.notifyAdminPaymentDone = async (amount) => {
  if (confirm("Confirm sending payment notification to Central Admin?")) {
    try {
      await addDoc(collection(db, "settlement_payments"), {
        orgCode: currentOrgCode,
        amountPaid: Number(amount),
        timestamp: new Date().toISOString(),
        status: "Pending Verification"
      });
      alert("✅ Notification sent to Central Admin successfully!");
    } catch (e) {
      alert("Error sending notification.");
    }
  }
};
