import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let portalConfigData = {};

document.addEventListener("DOMContentLoaded", async () => {
  await fetchPortalConfig();
  setupEventListeners();
});

// 1. Fetch Master Switches & Config from Firebase
async function fetchPortalConfig() {
  const statusMsg = document.getElementById("portal-status-msg");
  try {
    const docRef = doc(db, "settings", "portal_config");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      portalConfigData = docSnap.data();
      
      // Update Fees and UPI dynamically from Central Panel config
      const onlineFee = portalConfigData.onlineFee || 100;
      const offlineFee = portalConfigData.offlineFee || 120;
      
      if (document.getElementById("display-reg-fee")) document.getElementById("display-reg-fee").textContent = offlineFee;
      if (document.getElementById("display-reg-fee-online")) document.getElementById("display-reg-fee-online").textContent = onlineFee;
      if (document.getElementById("display-upi-id")) document.getElementById("display-upi-id").textContent = portalConfigData.upiId || "narmada@upi";

      // Check Registration Status Switch
      if (!portalConfigData.isRegistrationOpen) {
        if (statusMsg) {
          statusMsg.textContent = "🔴 Registration is currently closed by NVMS Admin.";
          statusMsg.style.background = "rgba(239, 68, 68, 0.15)";
          statusMsg.style.color = "#ef4444";
        }
      } else {
        if (statusMsg) {
          statusMsg.textContent = "🟢 NVMSO 2026 Portal is Live & Active.";
          statusMsg.style.background = "rgba(16, 185, 129, 0.15)";
          statusMsg.style.color = "#10b981";
        }
        document.getElementById("registration-view").classList.remove("hidden");
      }
    } else {
      if (statusMsg) statusMsg.textContent = "🟢 Portal Active (Default Mode)";
      document.getElementById("registration-view").classList.remove("hidden");
    }
  } catch (e) {
    console.error("Config fetch error:", e);
    if (statusMsg) statusMsg.textContent = "🟢 Portal Ready";
    document.getElementById("registration-view").classList.remove("hidden");
  }
}

// 2. Tab Switching Logic
window.switchTab = (tabName) => {
  document.getElementById("registration-view").classList.add("hidden");
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("exam-view").classList.add("hidden");
  document.getElementById("result-login-view").classList.add("hidden");
  document.getElementById("score-card-view").classList.add("hidden");

  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach(b => b.classList.remove("active-tab"));

  if (tabName === 'reg') {
    if (!portalConfigData.isRegistrationOpen) {
      alert("Registration is currently closed by Administration.");
      return;
    }
    document.getElementById("registration-view").classList.remove("hidden");
    if(buttons[0]) buttons[0].classList.add("active-tab");
  } else if (tabName === 'login') {
    if (!portalConfigData.isExamActive) {
      alert("Online Exam Portal is not active yet. Please wait for admin clearance.");
      return;
    }
    document.getElementById("login-view").classList.remove("hidden");
    if(buttons[1]) buttons[1].classList.add("active-tab");
  }
};

// 3. Dynamic UI Handlers
window.handleClassChange = (val) => {
  const streamGroup = document.getElementById("stream-group");
  if (val === "11" || val === "12") {
    streamGroup.classList.remove("hidden");
    document.getElementById("std-stream").required = true;
  } else {
    streamGroup.classList.add("hidden");
    document.getElementById("std-stream").required = false;
  }
};

window.handlePaymentModeChange = (mode) => {
  const qrContainer = document.getElementById("razorpay-qr-container");
  if (mode === "online") {
    qrContainer.classList.remove("hidden");
    document.getElementById("std-utr").required = true;
  } else {
    qrContainer.classList.add("hidden");
    document.getElementById("std-utr").required = false;
  }
};

window.fetchSchoolName = async (code) => {
  const display = document.getElementById("school-name-display");
  if (!code || code.length < 3) {
    if (display) display.textContent = "";
    return;
  }
  try {
    const q = query(collection(db, "organizers"), where("orgCode", "==", code.trim().toUpperCase()));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const orgData = snapshot.docs[0].data();
      if (display) {
        display.textContent = `✅ School Verified: ${orgData.schoolName || orgData.organizerName}`;
        display.style.color = "#10b981";
      }
    } else {
      if (display) {
        display.textContent = `⚠️ Organizer code not found in registry (You can still proceed)`;
        display.style.color = "#f59e0b";
      }
    }
  } catch (e) {
    console.error(e);
  }
};

function setupEventListeners() {
  const regForm = document.getElementById("reg-form");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const orgCode = document.getElementById("org-code").value.trim();
      const studentName = document.getElementById("std-name").value.trim();
      const motherName = document.getElementById("std-mother").value.trim();
      const fatherName = document.getElementById("std-father").value.trim();
      const studentClass = document.getElementById("std-class").value;
      const rollNumber = document.getElementById("std-roll").value.trim();
      const contact = document.getElementById("std-contact").value.trim();
      const paymentMode = document.getElementById("payment-mode").value;
      const utrNumber = document.getElementById("std-utr") ? document.getElementById("std-utr").value.trim() : "";

      if (contact.length !== 10) {
        alert("Please enter a valid 10-digit contact number.");
        return;
      }

      const feePaid = paymentMode === "online" ? (portalConfigData.onlineFee || 100) : (portalConfigData.offlineFee || 120);

      try {
        await addDoc(collection(db, "students"), {
          orgCode,
          studentName,
          motherName,
          fatherName,
          studentClass,
          rollNumber,
          contact,
          paymentMode,
          utrNumber,
          feePaid,
          cashApproved: paymentMode === "cash" ? false : true,
          verified: paymentMode === "online" ? true : false,
          blocked: false,
          createdAt: new Date().toISOString()
        });

        alert("🎉 Registration Successful! Save your Roll Number and Password for exam login.");
        regForm.reset();
      } catch (err) {
        console.error("Registration error:", err);
        alert("Error submitting registration. Please try again.");
      }
    });
  }

  // Login Form for Exam
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const roll = document.getElementById("login-roll").value.trim();
      const pass = document.getElementById("login-password").value.trim();

      // Simple authentication check against registered students
      try {
        const q = query(collection(db, "students"), where("rollNumber", "==", roll));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const studentDoc = snapshot.docs[0].data();
          if (studentDoc.blocked) {
            alert("Your account has been blocked by admin. Contact school organizer.");
            return;
          }
          
          // Switch to Exam View
          document.getElementById("login-view").classList.add("hidden");
          document.getElementById("exam-view").classList.remove("hidden");
          startExamTimer(portalConfigData.examDuration || 30);
          loadExamQuestions(studentDoc.studentClass);
        } else {
          alert("Roll number not found. Please register first.");
        }
      } catch (err) {
        console.error(err);
        alert("Login error. Check connection.");
      }
    });
  }
}

function startExamTimer(durationMinutes) {
  let timer = durationMinutes * 60;
  const display = document.getElementById("time-remaining");
  
  const interval = setInterval(() => {
    let minutes = parseInt(timer / 60, 10);
    let seconds = parseInt(timer % 60, 10);

    minutes = minutes < 10 ? "0" + minutes : minutes;
    seconds = seconds < 10 ? "0" + seconds : seconds;

    if (display) display.textContent = minutes + ":" + seconds;

    if (--timer < 0) {
      clearInterval(interval);
      alert("Time is up! Your exam will be submitted automatically.");
      document.getElementById("exam-form").submit();
    }
  }, 1000);
}

async function loadExamQuestions(studentClass) {
  const container = document.getElementById("question-container");
  if (!container) return;
  container.innerHTML = "<p>Loading exam questions from question bank...</p>";

  try {
    const qSnap = await getDocs(collection(db, "questions"));
    container.innerHTML = "";
    
    let count = 0;
    qSnap.forEach(doc => {
      count++;
      const q = doc.data();
      const div = document.createElement("div");
      div.style.cssText = "background: rgba(15,23,42,0.6); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #334155;";
      div.innerHTML = `
        <p style="font-weight: bold; color: #38bdf8; margin-bottom: 10px;">Q${count}. ${q.qText}</p>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label><input type="radio" name="q_${doc.id}" value="A"> A) ${q.optA}</label>
          <label><input type="radio" name="q_${doc.id}" value="B"> B) ${q.optB}</label>
          <label><input type="radio" name="q_${doc.id}" value="C"> C) ${q.optC}</label>
          <label><input type="radio" name="q_${doc.id}" value="D"> D) ${q.optD}</label>
        </div>
      `;
      container.appendChild(div);
    });

    if (count === 0) {
      container.innerHTML = "<p style='color: #f87171;'>No questions found in database. Please ask admin to add questions via Question Manager Panel.</p>";
    }
  } catch (e) {
    console.error(e);
    container.innerHTML = "<p style='color: #f87171;'>Error loading questions.</p>";
  }
}

window.downloadHighQualityPDF = () => {
  const element = document.getElementById("certificate");
  if (!element) return;
  const opt = {
    margin: 0,
    filename: 'NVMSO_Certificate.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  html2pdf().from(element).set(opt).save();
};
