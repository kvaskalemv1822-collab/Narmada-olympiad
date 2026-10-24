import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

let portalConfig = {};
let activeOrganizer = null;
let currentUser = null;
let examTimerInterval = null;
let studentAnswers = {};
let fetchedQuestions = [];

const DEFAULT_QR_SRC = "Qrcode.jpg";

function enforceNumericOnly(inputElement) {
  if (!inputElement) return;
  inputElement.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  enforceNumericOnly(document.getElementById("std-roll"));
  enforceNumericOnly(document.getElementById("login-roll"));
  enforceNumericOnly(document.getElementById("res-verify-roll"));
  enforceNumericOnly(document.getElementById("std-contact"));
});

window.handleClassChange = (val) => {
  const streamGroup = document.getElementById("stream-group");
  const streamSelect = document.getElementById("std-stream");
  if (val === "11" || val === "12") {
    streamGroup?.classList.remove("hidden");
    streamSelect?.setAttribute("required", "true");
  } else {
    streamGroup?.classList.add("hidden");
    streamSelect?.removeAttribute("required");
    if (streamSelect) streamSelect.value = "";
  }
};

onSnapshot(doc(db, "settings", "examConfig"), (docSnap) => {
  if (docSnap.exists()) {
    portalConfig = docSnap.data();
    
    const sessionYear = portalConfig.academicYear || "2026-27";
    const subTitleEl = document.getElementById("display-academic-year");
    if (subTitleEl) subTitleEl.textContent = `Official Student Portal (${sessionYear}) | Directed by V.K Olympiad`;

    const qrImg = document.getElementById("razorpay-qr-img");
    if (qrImg) qrImg.src = portalConfig.qrImageUrl || DEFAULT_QR_SRC;

    const upiSpan = document.getElementById("display-upi-id");
    if (upiSpan && portalConfig.upiId) upiSpan.textContent = portalConfig.upiId;

    const upiBtn = document.getElementById("upi-intent-btn");
    if (upiBtn && portalConfig.upiId) {
      const fee = portalConfig.onlineFee || 100;
      upiBtn.href = `upi://pay?pa=${portalConfig.upiId}&pn=NVMSO%20Olympiad&am=${fee}&cu=INR`;
    }

    if (activeOrganizer) updateOrganizerFeeDisplay();
  }
  updateUIState();
});

function updateOrganizerFeeDisplay() {
  if (!activeOrganizer) return;
  const fee = activeOrganizer.examMode === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
  const feeEl1 = document.getElementById("display-reg-fee");
  const feeEl2 = document.getElementById("display-reg-fee-online");
  if(feeEl1) feeEl1.textContent = fee;
  if(feeEl2) feeEl2.textContent = fee;
}

function updateUIState() {
  const msg = document.getElementById("portal-status-msg");
  const regView = document.getElementById("registration-view");
  const loginView = document.getElementById("login-view");
  const resultView = document.getElementById("result-login-view");
  const tabNav = document.querySelector(".tab-nav");

  if (!msg) return;

  if (portalConfig.resultAllowed) {
    msg.textContent = "🏆 Result is Live! Enter your credentials below to view your Scorecard & Certificate.";
    msg.style.background = "#d4edda"; msg.style.color = "#155724";
    regView?.classList.add("hidden"); loginView?.classList.add("hidden"); resultView?.classList.remove("hidden"); tabNav?.classList.add("hidden");
  } else if (portalConfig.examActive) {
    msg.textContent = "🚀 Exam Portal is Active. Registrations are Closed.";
    msg.style.background = "#fff3cd"; msg.style.color = "#856404";
    regView?.classList.add("hidden"); loginView?.classList.remove("hidden"); resultView?.classList.add("hidden"); tabNav?.classList.add("hidden");
  } else if (portalConfig.regActive) {
    msg.textContent = "📝 Registration is Open";
    msg.style.background = "#d4edda"; msg.style.color = "#155724";
    regView?.classList.remove("hidden"); loginView?.classList.add("hidden"); resultView?.classList.add("hidden"); tabNav?.classList.remove("hidden");
  } else {
    msg.textContent = "🔒 Portal is Currently Closed by Admin";
    msg.style.background = "#f8d7da"; msg.style.color = "#721c24";
    regView?.classList.add("hidden"); loginView?.classList.add("hidden"); resultView?.classList.add("hidden"); tabNav?.classList.add("hidden");
  }
}

window.fetchSchoolName = async (code) => {
  const display = document.getElementById("school-name-display");
  if (!code || code.trim().length < 3) { 
    if(display) display.textContent = ""; 
    activeOrganizer = null; 
    return; 
  }
  
  try {
    const orgDoc = await getDoc(doc(db, "organizers", code.trim().toUpperCase()));
    if (orgDoc.exists()) {
      const orgData = orgDoc.data();

      if (!orgData.principalApproved) {
        if (display) {
          display.textContent = "⚠️ Code Locked: School Principal Permission Pending from Organizer!";
          display.style.background = "#ef4444";
        }
        activeOrganizer = null;
        return;
      }

      activeOrganizer = orgData;
      if (display) {
        display.textContent = `✅ ${activeOrganizer.schoolName} (Mode: ${activeOrganizer.examMode ? activeOrganizer.examMode.toUpperCase() : 'ONLINE'})`;
        display.style.background = "linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)";
      }
      updateOrganizerFeeDisplay();
    } else {
      if(display) display.textContent = "❌ Invalid Organizer Code";
      activeOrganizer = null;
    }
  } catch (err) { console.error(err); }
};

window.handlePaymentModeChange = (val) => {
  const qrBox = document.getElementById("razorpay-qr-container");
  if (!qrBox) return;
  if (val === "online") qrBox.classList.remove("hidden");
  else qrBox.classList.add("hidden");
};

window.switchTab = (tab) => {
  if (portalConfig.examActive) return;
  if (tab === 'reg') {
    document.getElementById("registration-view")?.classList.remove("hidden");
    document.getElementById("login-view")?.classList.add("hidden");
  } else {
    document.getElementById("registration-view")?.classList.add("hidden");
    document.getElementById("login-view")?.classList.remove("hidden");
  }
};

const regForm = document.getElementById("reg-form");
if (regForm) {
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!portalConfig.regActive) { alert("Registrations are closed by admin!"); return; }
    if (!activeOrganizer) { alert("Enter a valid Organizer Code!"); return; }

    const rawName = document.getElementById("std-name").value.trim();
    const salutation = document.getElementById("std-salutation") ? document.getElementById("std-salutation").value : "Mr.";
    const name = `${salutation} ${rawName}`;
    const roll = document.getElementById("std-roll").value.trim().replace(/[^0-9]/g, '');
    const contact = document.getElementById("std-contact").value.trim().replace(/[^0-9]/g, '');
    const stdClass = document.getElementById("std-class").value;
    const stdStream = document.getElementById("std-stream") ? document.getElementById("std-stream").value : "";
    const payMode = document.getElementById("payment-mode").value;
    const utr = document.getElementById("std-utr") ? document.getElementById("std-utr").value.trim() : "";

    if (!roll) { alert("Enter a valid Roll Number!"); return; }
    if (contact.length !== 10) { alert("Enter a 10-digit mobile number!"); return; }

    try {
      const studentDocId = `${activeOrganizer.code}_c${stdClass}_${roll}`;
      const existingStdDoc = await getDoc(doc(db, "students", studentDocId));
      if (existingStdDoc.exists()) {
        alert(`⚠️ Roll No "${roll}" in Class "${stdClass}" is already registered for this school.`);
        return;
      }

      if (payMode === "online") {
        if (!utr || utr.length < 6) { alert("Enter a valid UTR Number!"); return; }
        const utrSnap = await getDocs(query(collection(db, "students"), where("utr", "==", utr)));
        if (!utrSnap.empty) { alert(`⚠️ UTR "${utr}" is already used by another student.`); return; }
      }

      const mother = document.getElementById("std-mother").value.trim();
      const father = document.getElementById("std-father").value.trim();
      const password = mother.substring(0, 2).toUpperCase() + roll;
      const fee = activeOrganizer.examMode === "offline" ? (portalConfig.offlineFee || 120) : (portalConfig.onlineFee || 100);
      const assignedYear = activeOrganizer.academicYear || portalConfig.academicYear || "2026-27";

      const studentData = {
        id: studentDocId, roll, name, mother, father, stdClass, stream: stdStream, contact, password,
        orgCode: activeOrganizer.code, schoolName: activeOrganizer.schoolName,
        academicYear: assignedYear, payMode, utr: payMode === "online" ? utr : "", fee, 
        paymentConfirmed: (payMode === "online"),
        registeredAt: new Date().toISOString()
      };

      if (confirm(`Confirm registration for ${name} (Roll No: ${roll})?`)) {
        await setDoc(doc(db, "students", studentDocId), studentData);

        if (payMode === "cash") {
          alert(`📌 Registration Pending Cash Approval!\n\nRoll No: ${roll}\nStatus: PENDING CASH APPROVAL\n\nYour password will be active once your school organizer approves your cash payment.`);
        } else {
          alert(`✅ Registration Successful!\n\nRoll No: ${roll}\nPassword: ${password}`);
        }
        window.location.href = window.location.pathname;
      }
    } catch (err) { alert("Error registering student."); }
  });
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!portalConfig.examActive) { alert("Exam portal is not active right now!"); return; }

    const roll = document.getElementById("login-roll").value.trim().replace(/[^0-9]/g, '');
    const pass = document.getElementById("login-password").value.trim();

    try {
      const stdSnap = await getDocs(query(collection(db, "students"), where("roll", "==", roll)));
      let matchedStudent = null;
      stdSnap.forEach(d => { if (d.data().password === pass) matchedStudent = d.data(); });

      if (matchedStudent) {
        currentUser = matchedStudent;

        if (currentUser.blocked) {
          alert("❌ Your account has been blocked by the admin.");
          return;
        }

        if (currentUser.payMode === "cash" && !currentUser.paymentConfirmed) {
          alert("⏳ Registration Pending: Your cash payment has not been approved by your School Organizer yet.");
          return;
        }

        const resDoc = await getDoc(doc(db, "results", currentUser.id || roll));
        if (resDoc.exists()) {
          alert("⚠️ You have ALREADY SUBMITTED this exam!");
          return;
        }

        showStudentVerificationModal(currentUser);
      } else {
        alert("Incorrect Roll Number or Password!");
      }
    } catch (err) { alert("Login error."); }
  });
}

function showStudentVerificationModal(student) {
  let modal = document.getElementById("student-verify-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "student-verify-modal";
    modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index:9999; padding:15px;";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#1e293b; color:#fff; padding:25px; border-radius:12px; max-width:450px; width:100%; border:2px solid #38bdf8;">
      <h3 style="color:#fbbf24; text-align:center; margin-bottom:15px;">🔍 Verify Your Details</h3>
      <div style="background:#0f172a; padding:12px; border-radius:8px; font-size:14px; line-height:1.6; margin-bottom:20px;">
        <p><strong>Student Name:</strong> ${student.name}</p>
        <p><strong>Roll Number:</strong> ${student.roll}</p>
        <p><strong>Class:</strong> Class ${student.stdClass} ${student.stream ? `(${student.stream})` : ''}</p>
        <p><strong>School:</strong> ${student.schoolName}</p>
      </div>
      <button id="btn-confirm-exam-start" style="width:100%; padding:12px; background:#10b981; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">Confirm & Start Exam 🚀</button>
    </div>
  `;

  document.getElementById("btn-confirm-exam-start").onclick = async () => {
    modal.remove();
    await loadDynamicQuestions(currentUser.stdClass);
    document.getElementById("login-view")?.classList.add("hidden");
    document.getElementById("exam-view")?.classList.remove("hidden");
    startExamEngine();
  };
}

async function loadDynamicQuestions(stdClass) {
  try {
    let targetRange = "3-5";
    const clsNum = parseInt(stdClass);
    if (clsNum >= 3 && clsNum <= 5) targetRange = "3-5";
    else if (clsNum >= 6 && clsNum <= 8) targetRange = "6-8";
    else if (clsNum >= 9 && clsNum <= 12) targetRange = "9-12";

    const qSnap = await getDocs(query(collection(db, "questions"), where("targetClass", "==", targetRange)));
    fetchedQuestions = [];
    qSnap.forEach(d => {
      const q = d.data();
      fetchedQuestions.push({
        question: q.qText,
        options: [q.optA, q.optB, q.optC, q.optD],
        correct: q.correctOpt === "A" ? 0 : q.correctOpt === "B" ? 1 : q.correctOpt === "C" ? 2 : 3,
        marks: 1
      });
    });

    if (fetchedQuestions.length === 0) {
      fetchedQuestions = [
        { question: `Sample Question 1 for Class ${stdClass}?`, options: ["Option A", "Option B", "Option C", "Option D"], correct: 0, marks: 1 },
        { question: `Sample Question 2 for Class ${stdClass}?`, options: ["Option A", "Option B", "Option C", "Option D"], correct: 1, marks: 1 }
      ];
    }
  } catch(err) { console.error(err); }
}

function startExamEngine() {
  let timeRemaining = (portalConfig.duration || 30) * 60;
  const timerEl = document.getElementById("time-remaining");
  
  if (examTimerInterval) clearInterval(examTimerInterval);

  examTimerInterval = setInterval(() => {
    timeRemaining--;
    const mins = Math.floor(timeRemaining / 60);
    const secs = timeRemaining % 60;
    if (timerEl) timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    if (timeRemaining <= 0) {
      clearInterval(examTimerInterval);
      alert("⏳ Time UP! Auto-submitting exam.");
      submitExamPaper(true);
    }
  }, 1000);

  renderQuestions();
}

function renderQuestions() {
  const box = document.getElementById("question-container");
  if (!box) return;
  box.innerHTML = "";

  fetchedQuestions.forEach((q, idx) => {
    const qDiv = document.createElement("div");
    qDiv.style.cssText = "margin:15px 0; padding:15px; background:#f8fafc; border-radius:8px; border:1px solid #cbd5e1;";
    let optionsHTML = "";
    q.options.forEach((opt, optIdx) => {
      optionsHTML += `<label style="display:block; margin:8px 0; cursor:pointer;"><input type="radio" name="question_${idx}" value="${optIdx}" onchange="selectAnswer(${idx}, ${optIdx})"> ${opt}</label>`;
    });
    qDiv.innerHTML = `<h4 style="color:#0f172a; margin-bottom:10px;">Q${idx + 1}. ${q.question}</h4>${optionsHTML}`;
    box.appendChild(qDiv);
  });
}

window.selectAnswer = (qIdx, optIdx) => { studentAnswers[qIdx] = optIdx; };

document.getElementById("exam-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  submitExamPaper(false);
});

async function submitExamPaper(isAutoSubmit = false) {
  if (!isAutoSubmit && !confirm("Finalize and submit exam?")) return;

  if (examTimerInterval) clearInterval(examTimerInterval);

  let score = 0;
  fetchedQuestions.forEach((q, idx) => {
    if (studentAnswers[idx] === q.correct) score += (q.marks || 1);
  });

  const totalMarks = fetchedQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);
  const percentage = parseFloat(((score / totalMarks) * 100).toFixed(2));

  try {
    await setDoc(doc(db, "results", currentUser.id || currentUser.roll), {
      roll: currentUser.roll, name: currentUser.name, stdClass: currentUser.stdClass,
      orgCode: currentUser.orgCode, schoolName: currentUser.schoolName, marks: score,
      totalMarks, percentage, submittedAt: new Date().toISOString()
    });

    showExamSuccessScreen(score, totalMarks, percentage);
  } catch (e) { 
    alert("Error saving exam result. Please check your network connection."); 
  }
}

function showExamSuccessScreen(score, totalMarks, percentage) {
  const examView = document.getElementById("exam-view");
  if (examView) examView.classList.add("hidden");

  let successModal = document.getElementById("exam-success-modal");
  if (!successModal) {
    successModal = document.createElement("div");
    successModal.id = "exam-success-modal";
    successModal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:#0f172a; display:flex; justify-content:center; align-items:center; z-index:99999; padding:20px; color:#fff; text-align:center;";
    document.body.appendChild(successModal);
  }

  let countdown = 10;
  successModal.innerHTML = `
    <div style="background:#1e293b; padding:35px; border-radius:16px; max-width:500px; width:100%; border:2px solid #10b981; box-shadow:0 15px 35px rgba(0,0,0,0.6);">
      <h2 style="color:#4ade80; margin-bottom:15px; font-size:28px;">🎉 Exam Successfully Completed!</h2>
      <p style="color:#94a3b8; font-size:15px; margin-bottom:20px;">Great job! Your answers have been successfully evaluated and recorded.</p>
      
      <div style="background:#0f172a; padding:15px; border-radius:10px; margin-bottom:25px; font-size:18px;">
        <p><strong>Score:</strong> <span style="color:#fbbf24;">${score} / ${totalMarks}</span></p>
        <p style="margin-top:5px;"><strong>Percentage:</strong> <span style="color:#38bdf8;">${percentage}%</span></p>
      </div>

      <p style="color:#facc15; font-size:14px; margin-bottom:15px;">Returning to Home Portal in <strong id="success-countdown" style="font-size:18px;">10</strong> seconds...</p>
      
      <button id="btn-force-reload" style="width:100%; padding:14px; background:linear-gradient(135deg, #0284c7 0%, #38bdf8 100%); color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:16px; cursor:pointer; pointer-events:auto;">🏠 Back to Home / Next Student</button>
    </div>
  `;

  const btnReload = document.getElementById("btn-force-reload");
  if (btnReload) {
    btnReload.onclick = () => {
      window.location.href = window.location.pathname;
    };
  }

  const countdownInterval = setInterval(() => {
    countdown--;
    const counterEl = document.getElementById("success-countdown");
    if (counterEl) counterEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      window.location.href = window.location.pathname;
    }
  }, 1000);
}

document.getElementById("result-verify-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const roll = document.getElementById("res-verify-roll").value.trim().replace(/[^0-9]/g, '');
  const pass = document.getElementById("res-verify-pass").value.trim();

  const stdSnap = await getDocs(query(collection(db, "students"), where("roll", "==", roll)));
  let matchedStd = null;
  stdSnap.forEach(d => { if (d.data().password === pass) matchedStd = d.data(); });

  if (matchedStd) {
    const resDoc = await getDoc(doc(db, "results", matchedStd.id || roll));
    if (resDoc.exists()) {
      const resData = resDoc.data();
      
      document.getElementById("result-login-view")?.classList.add("hidden");
      document.getElementById("score-card-view")?.classList.remove("hidden");
      document.getElementById("res-marks").textContent = `${resData.marks} / ${resData.totalMarks}`;
      document.getElementById("res-percentage").textContent = `${resData.percentage}%`;
      
      // Remove Mr., Ms., Mrs. from the displayed name on certificate
      let cleanName = matchedStd.name.replace(/^(Mr\.|Ms\.|Mrs\.)\s*/i, '');
      document.getElementById("cert-student-name").textContent = cleanName;
      
      const certClassEl = document.getElementById("cert-student-class");
      if(certClassEl) certClassEl.textContent = `Class: ${matchedStd.stdClass} ${matchedStd.stream ? `(${matchedStd.stream})` : ''}`;
      
      const certSchoolEl = document.getElementById("cert-school-name");
      if(certSchoolEl) certSchoolEl.textContent = matchedStd.schoolName;

    } else { alert("Result not declared yet!"); }
  } else { alert("Incorrect credentials!"); }
});

window.downloadHighQualityPDF = () => {
  const element = document.getElementById("certificate");
  const studentName = document.getElementById("cert-student-name")?.textContent || "Student";
  
  const opt = {
    margin: 0,
    filename: `NVMSO_Certificate_${studentName.replace(/\s+/g, '_')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
  };
  html2pdf().set(opt).from(element).save();
};
