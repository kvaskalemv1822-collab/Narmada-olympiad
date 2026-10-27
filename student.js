import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let activeStudent = null;
let examTimerInterval = null;
let isOrganizerVerified = false;
let verifiedOrgExamMode = "online";
let schoolNameCache = {};

document.addEventListener("DOMContentLoaded", () => {
  initRealtimePortalSync();
  setupEventListeners();
});

function initRealtimePortalSync() {
  const statusMsg = document.getElementById("portal-status-msg");
  const btnReg = document.getElementById("nav-btn-reg");
  const btnLogin = document.getElementById("nav-btn-login");
  const btnResult = document.getElementById("nav-btn-result");

  onSnapshot(doc(db, "settings", "portal_config"), (docSnap) => {
    if (docSnap.exists()) {
      portalConfigData = docSnap.data();

      const upiSpan = document.getElementById("display-upi-id");
      if (upiSpan) upiSpan.textContent = portalConfigData.upiId || "narmada@upi";

      // Dynamic QR Code Refresh on Config Change
      renderDynamicUPIQR();

      const isRegOpen = !!portalConfigData.isRegistrationOpen;
      const isExamActive = !!portalConfigData.isExamActive;
      const isResultAllowed = !!portalConfigData.isResultDeclared;

      if (btnReg) btnReg.style.display = isRegOpen ? "block" : "none";
      if (btnLogin) btnLogin.style.display = isExamActive ? "block" : "none";
      if (btnResult) btnResult.style.display = isResultAllowed ? "block" : "none";

      if (isRegOpen) {
        if (statusMsg) {
          statusMsg.textContent = "🟢 NVMSO Registration is Live & Active.";
          statusMsg.style.background = "rgba(16, 185, 129, 0.15)";
          statusMsg.style.color = "#10b981";
        }
      } else if (isExamActive) {
        if (statusMsg) {
          statusMsg.textContent = "✍️ Online Exam Portal is Active.";
          statusMsg.style.background = "rgba(2, 117, 216, 0.15)";
          statusMsg.style.color = "#0275d8";
        }
      } else if (isResultAllowed) {
        if (statusMsg) {
          statusMsg.textContent = "🏆 Exam Results & Scorecards Declared.";
          statusMsg.style.background = "rgba(255, 193, 7, 0.15)";
          statusMsg.style.color = "#d97706";
        }
      } else {
        if (statusMsg) {
          statusMsg.textContent = "🔴 Portal is currently offline / locked by Central Admin.";
          statusMsg.style.background = "rgba(239, 68, 68, 0.15)";
          statusMsg.style.color = "#ef4444";
        }
      }
    }
  });
}

// Secure Dynamic QR Generator Function (Gated by Organizer Verification)
function renderDynamicUPIQR() {
  const qrBox = document.getElementById("dynamic-qr-container");
  if (!qrBox) return;

  // Jab tak school organizer verify nahi hota, QR code aur fees hide rahenge
  if (typeof isOrganizerVerified === 'undefined' || !isOrganizerVerified) {
    qrBox.innerHTML = "<p style='color: #94a3b8; font-size: 13px; text-align: center;'>🔒 Please enter a valid School Organizer Code above to unlock the payment QR code & fees.</p>";
    return;
  }

  let fee = 100;
  if (typeof portalConfigData !== 'undefined') {
    let isOff = typeof verifiedOrgExamMode !== 'undefined' && verifiedOrgExamMode === "offline";
    fee = isOff ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
  }
  
  let upi = "narmada@upi";
  if (typeof portalConfigData !== 'undefined' && portalConfigData.upiId) {
    upi = portalConfigData.upiId;
  }
  
  let name = "NVMSO Exam Fee";
  let note = "NVMSO Registration Fee";
  let upiUrl = "upi://pay?pa=" + encodeURIComponent(upi) +
               "&pn=" + encodeURIComponent(name) +
               "&tn=" + encodeURIComponent(note) +
               "&am=" + encodeURIComponent(fee) +
               "&cu=INR";

  qrBox.innerHTML = ""; // Clear old QR code
  if (typeof QRCode !== "undefined") {
    new QRCode(qrBox, {
      text: upiUrl,
      width: 180,
      height: 180
    });
  } else {
    qrBox.innerHTML = "<p style='color:red;'>QR Library not loaded.</p>";
  }
}

window.openDirectUpiApp = function() {
  // Check if school organizer is verified
  if (typeof isOrganizerVerified === 'undefined' || !isOrganizerVerified) {
    alert("⛔ Please enter a valid School Organizer Code above to unlock payment options.");
    document.getElementById("org-code")?.focus();
    return;
  }

  try {
    let fee = 100;
    if (typeof portalConfigData !== 'undefined') {
      let isOff = typeof verifiedOrgExamMode !== 'undefined' && verifiedOrgExamMode === "offline";
      fee = isOff ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);
    }
    
    let upi = "narmada@upi";
    if (typeof portalConfigData !== 'undefined' && portalConfigData.upiId) {
      upi = portalConfigData.upiId;
    }
    
    let name = "NVMSO Exam Fee";
    let note = "NVMSO Registration Fee";
    let url = "upi://pay?pa=" + encodeURIComponent(upi);
    url += "&pn=" + encodeURIComponent(name);
    url += "&tn=" + encodeURIComponent(note);
    url += "&am=" + encodeURIComponent(fee) + "&cu=INR";

    window.location.href = url;
  } catch (err) {
    alert("Please scan the QR code using your phone.");
  }
};

window.switchTab = (tabName) => {
  document.getElementById("registration-view").classList.add("hidden");
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("student-confirm-view")?.classList.add("hidden");
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
    const btn = document.getElementById("nav-btn-reg");
    if(btn) btn.classList.add("active-tab");
  } 
  else if (tabName === 'login') {
    if (!portalConfigData.isExamActive) {
      alert("Online Exam Portal is not active yet.");
      return;
    }
    document.getElementById("login-view").classList.remove("hidden");
    const btn = document.getElementById("nav-btn-login");
    if(btn) btn.classList.add("active-tab");
  }
  else if (tabName === 'result') {
    if (!portalConfigData.isResultDeclared) {
      alert("❌ Results have not been declared yet by Administration.");
      return;
    }
    document.getElementById("result-login-view").classList.remove("hidden");
    const btn = document.getElementById("nav-btn-result");
    if(btn) btn.classList.add("active-tab");
  }
};

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
  const onlineSection = document.getElementById("online-payment-section");
  const qrContainer = document.getElementById("dynamic-qr-container");
  
  if (mode === "online") {
    onlineSection.classList.remove("hidden");
    document.getElementById("std-utr").required = true;
    renderDynamicUPIQR(); // Generate QR when online payment is selected
  } else {
    onlineSection.classList.add("hidden");
    if(qrContainer) qrContainer.classList.add("hidden");
    document.getElementById("std-utr").required = false;
    document.getElementById("std-utr").value = "";
  }
};

window.toggleQrCode = () => {
  const qrContainer = document.getElementById("dynamic-qr-container");
  if (qrContainer) {
    qrContainer.classList.toggle("hidden");
    if (!qrContainer.classList.contains("hidden")) {
      renderDynamicUPIQR(); // Refresh QR code when shown
    }
  }
};

window.fetchSchoolName = async (code) => {
  const display = document.getElementById("school-name-display");
  const modeDisplay = document.getElementById("display-student-exam-mode");
  isOrganizerVerified = false;
  verifiedOrgExamMode = "online";

  if (!code || code.length < 3) {
    if (display) display.textContent = "";
    if (modeDisplay) modeDisplay.textContent = "Enter Organizer Code First";
    renderDynamicUPIQR();
    return;
  }

  try {
    const q = query(collection(db, "organizers"), where("orgCode", "==", code.trim().toUpperCase()));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const orgData = snapshot.docs[0].data();
      schoolNameCache[orgData.orgCode || orgData.code] = orgData.schoolName || orgData.name;

      if (!orgData.principalApproved) {
        isOrganizerVerified = false;
        if (display) {
          display.textContent = `❌ Organizer Code exists, but Official Principal Permission is PENDING! Registration is Locked.`;
          display.style.color = "#ef4444";
        }
        if (modeDisplay) modeDisplay.textContent = "Permission Pending (Locked)";
        return;
      }

      isOrganizerVerified = true;
      verifiedOrgExamMode = orgData.examMode || "online";
      const applicableFee = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);

      if (display) {
        display.innerHTML = `✅ School Verified: ${orgData.schoolName || orgData.name}<br><span style="color:#fbbf24;">Exam Mode: ${verifiedOrgExamMode.toUpperCase()} | Applicable Fee: ₹${applicableFee}</span>`;
        display.style.color = "#10b981";
      }

      if (modeDisplay) {
        modeDisplay.textContent = verifiedOrgExamMode === "offline" ? `Offline Paper Mode (OMR) - Fee: ₹${applicableFee}` : `Online Exam Mode - Fee: ₹${applicableFee}`;
        modeDisplay.style.color = verifiedOrgExamMode === "offline" ? "#d97706" : "#0284c7";
      }

      // Update QR Code with the correct exam mode fee instantly
      renderDynamicUPIQR();

    } else {
      isOrganizerVerified = false;
      if (display) {
        display.textContent = `❌ Invalid Organizer Code! Registration is locked without a valid code.`;
        display.style.color = "#ef4444";
      }
      if (modeDisplay) modeDisplay.textContent = "Invalid Code";
      renderDynamicUPIQR();
    }
  } catch (e) {
    console.error(e);
    isOrganizerVerified = false;
  }
};

function setupEventListeners() {
  const regForm = document.getElementById("reg-form");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!isOrganizerVerified) {
        alert("⛔ Registration Blocked!\n\nPlease enter a valid School Organizer Code with official principal permission.");
        document.getElementById("org-code").focus();
        return;
      }

      const termsBox = document.getElementById("terms-checkbox");
      if (!termsBox.checked) {
        alert("You must agree to the terms and conditions by checking the box.");
        return;
      }

      const orgCode = document.getElementById("org-code").value.trim().toUpperCase();
      const studentName = document.getElementById("std-name").value.trim();
      const motherName = document.getElementById("std-mother").value.trim();
      const fatherName = document.getElementById("std-father").value.trim();
      const studentClass = document.getElementById("std-class").value;
      const studentStream = (studentClass === "11" || studentClass === "12") ? document.getElementById("std-stream").value : "General";
      const rollNumber = document.getElementById("std-roll").value.trim();
      const contact = document.getElementById("std-contact").value.trim();
      const paymentMode = document.getElementById("payment-mode").value;
      const utrNumber = document.getElementById("std-utr") ? document.getElementById("std-utr").value.trim() : "";

      if (contact.length !== 10) {
        alert("Please enter a valid 10-digit contact number.");
        return;
      }

      if (motherName.length < 2) {
        alert("Please enter a valid mother's name.");
        return;
      }

      try {
        const qDup = query(collection(db, "students"), where("orgCode", "==", orgCode), where("rollNumber", "==", rollNumber));
        const dupSnap = await getDocs(qDup);
        if (!dupSnap.empty) {
          alert(`❌ Roll Number "${rollNumber}" is already registered under School Code "${orgCode}"! Please use a unique roll number.`);
          document.getElementById("std-roll").focus();
          return;
        }

        if (paymentMode === "online") {
          if (!utrNumber || utrNumber.length < 6) {
            alert("❌ Please enter a valid UPI UTR / Transaction Reference Number!");
            document.getElementById("std-utr").focus();
            return;
          }

          const qUtr = query(collection(db, "students"), where("utrNumber", "==", utrNumber));
          const utrSnap = await getDocs(qUtr);
          if (!utrSnap.empty) {
            alert("❌ This UTR transaction number has already been used by another student! Each student must use a unique UTR.");
            document.getElementById("std-utr").focus();
            return;
          }
        }

        const motherPrefix = motherName.trim().substring(0, 2).toUpperCase();
        const generatedPassword = motherPrefix + rollNumber;
        const feePaid = verifiedOrgExamMode === "offline" ? (portalConfigData.offlineFee || 120) : (portalConfigData.onlineFee || 100);

        await addDoc(collection(db, "students"), {
          orgCode, studentName, motherName, fatherName, studentClass, studentStream,
          rollNumber, contact, password: generatedPassword, paymentMode, utrNumber: utrNumber || null, feePaid,
          examMode: verifiedOrgExamMode,
          cashApproved: paymentMode === "cash" ? false : true,
          verified: paymentMode === "online" ? true : false,
          blocked: false,
          createdAt: new Date().toISOString()
        });

        alert(`🎉 Registration Successful!\n\nYour Login Password is: ${generatedPassword}\nExam Mode: ${verifiedOrgExamMode.toUpperCase()}\nFee Paid: ₹${feePaid}\n(Save this password along with your Roll Number).`);
        regForm.reset();
        document.getElementById("online-payment-section").classList.add("hidden");
        document.getElementById("school-name-display").textContent = "";
        document.getElementById("display-student-exam-mode").textContent = "Enter Organizer Code First";
        isOrganizerVerified = false;
        renderDynamicUPIQR();
      } catch (err) {
        console.error("Registration error:", err);
        alert("Error submitting registration. Please try again.");
      }
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const roll = document.getElementById("login-roll").value.trim();
      const pass = document.getElementById("login-password").value.trim().toUpperCase();

      try {
        const q = query(collection(db, "students"), where("rollNumber", "==", roll));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const studentDocRef = snapshot.docs[0];
          const studentData = studentDocRef.data();
          activeStudent = { id: studentDocRef.id, ...studentData };

          if (studentData.blocked) {
            alert("❌ Your account has been blocked by admin.");
            return;
          }

          if (studentData.password !== pass) {
            alert("❌ Incorrect password! Format is Mother's first 2 capital letters + Roll Number (e.g., SU101).");
            return;
          }

          const payMode = studentData.paymentMode || 'cash';
          const isPaid = studentData.cashApproved || studentData.paymentConfirmed || payMode === "online";
          if (!isPaid) {
            alert("⛔ Exam Access Locked!\n\nYour cash payment is still PENDING approval by your School Organizer. Please contact your organizer to verify your cash fee.");
            return;
          }

          if (studentData.examCompleted) {
            alert("❌ You have already submitted this exam. You cannot take the exam twice!");
            return;
          }

          let schoolNameText = studentData.orgCode;
          try {
            if (schoolNameCache[studentData.orgCode]) {
              schoolNameText = schoolNameCache[studentData.orgCode];
            } else {
              const orgQ = query(collection(db, "organizers"), where("orgCode", "==", studentData.orgCode));
              const orgSnap = await getDocs(orgQ);
              if (!orgSnap.empty) {
                const orgInfo = orgSnap.docs[0].data();
                schoolNameText = orgInfo.schoolName || orgInfo.name;
                schoolNameCache[studentData.orgCode] = schoolNameText;
              }
            }
          } catch (err) {
            console.error(err);
          }

          document.getElementById("conf-name").textContent = studentData.studentName;
          document.getElementById("conf-roll").textContent = studentData.rollNumber;
          document.getElementById("conf-class").textContent = `Class ${studentData.studentClass} ${studentData.studentStream && studentData.studentStream !== 'General' ? '(' + studentData.studentStream + ')' : ''}`;
          document.getElementById("conf-school").textContent = schoolNameText;
          document.getElementById("conf-mother").textContent = studentData.motherName;
          document.getElementById("conf-pay").textContent = `VERIFIED (${payMode.toUpperCase()})`;

          document.getElementById("login-view").classList.add("hidden");
          document.getElementById("student-confirm-view").classList.remove("hidden");

        } else {
          alert("❌ Roll number not found. Please register first.");
        }
      } catch (err) {
        console.error(err);
        alert("Login error. Check connection.");
      }
    });
  }

  const proceedBtn = document.getElementById("proceed-to-exam-btn");
  if (proceedBtn) {
    proceedBtn.onclick = async () => {
      document.getElementById("student-confirm-view").classList.add("hidden");
      document.getElementById("exam-view").classList.remove("hidden");
      
      const duration = portalConfigData.examDuration || 30;
      startExamTimer(duration);
      loadExamQuestions(activeStudent.studentClass, activeStudent.studentStream);
    };
  }

  const examForm = document.getElementById("exam-form");
  if (examForm) {
    examForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeStudent) return;

      if (!confirm("Are you sure you want to submit your exam paper?")) return;

      clearInterval(examTimerInterval);

      try {
        const qSnap = await getDocs(collection(db, "questions"));
        let totalQuestions = 0;
        let correctCount = 0;
        let incorrectCount = 0;
        let unattemptedCount = 0;

        qSnap.forEach(docSnap => {
          const qData = docSnap.data();
          const qTarget = qData.targetClass || "6-8";

          let isMatch = false;
          const sClass = Number(activeStudent.studentClass);
          const sStream = activeStudent.studentStream || "General";

          if (qTarget === "3-5" && sClass >= 3 && sClass <= 5) isMatch = true;
          else if (qTarget === "6-8" && sClass >= 6 && sClass <= 8) isMatch = true;
          else if (qTarget === "9-10" && sClass >= 9 && sClass <= 10) isMatch = true;
          else if (qTarget === "11-12-Maths" && sClass >= 11 && sClass <= 12 && sStream === "Maths") isMatch = true;
          else if (qTarget === "11-12-Science" && sClass >= 11 && sClass <= 12 && sStream === "Science") isMatch = true;

          if (isMatch) {
            totalQuestions++;
            const qId = docSnap.id;
            const selectedOption = document.querySelector(`input[name="q_${qId}"]:checked`);

            if (!selectedOption) {
              unattemptedCount++;
            } else if (selectedOption.value === qData.correctOpt) {
              correctCount++;
            } else {
              incorrectCount++;
            }
          }
        });

        const marksPerCorrect = Number(portalConfigData.marksPerCorrect) || 1;
        const negativeMarking = Number(portalConfigData.negativeMarking) || 0;

        const positiveScore = correctCount * marksPerCorrect;
        const negativeScore = incorrectCount * negativeMarking;
        const netScore = Math.max(0, positiveScore - negativeScore);
        const maxPossibleMarks = totalQuestions * marksPerCorrect;
        const percentage = maxPossibleMarks > 0 ? ((netScore / maxPossibleMarks) * 100).toFixed(2) : 0;

        await setDoc(doc(db, "students", activeStudent.id), {
          examCompleted: true,
          score: netScore,
          percentage: Number(percentage),
          correctAnswers: correctCount,
          incorrectAnswers: incorrectCount,
          unattempted: unattemptedCount,
          submittedAt: new Date().toISOString()
        }, { merge: true });

        document.getElementById("exam-view").classList.add("hidden");
        document.getElementById("login-view").classList.remove("hidden");

        alert("✅ Exam Submitted Successfully!\n\nYour answers have been recorded safely in the database.\n\nScorecard and Certificate will be available for download once results are officially declared by the Central Administration.");
        
        examForm.reset();
        activeStudent = null;
      } catch (err) {
        console.error(err);
        alert("Error submitting exam results.");
      }
    });
  }

  const resultForm = document.getElementById("result-verify-form");
  if (resultForm) {
    resultForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!portalConfigData.isResultDeclared) {
        alert("❌ Results have not been declared yet by Administration.");
        return;
      }

      const roll = document.getElementById("res-verify-roll").value.trim();
      const pass = document.getElementById("res-verify-pass").value.trim().toUpperCase();

      try {
        const q = query(collection(db, "students"), where("rollNumber", "==", roll));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const studentData = snapshot.docs[0].data();
          if (studentData.password !== pass) {
            alert("Incorrect password!");
            return;
          }
          if (!studentData.examCompleted) {
            alert("Exam result not available yet or exam not attempted.");
            return;
          }

          let schoolNameText = studentData.orgCode;
          try {
            const orgQ = query(collection(db, "organizers"), where("orgCode", "==", studentData.orgCode));
            const orgSnap = await getDocs(orgQ);
            if (!orgSnap.empty) {
              const orgInfo = orgSnap.docs[0].data();
              schoolNameText = orgInfo.schoolName || orgInfo.name;
            }
          } catch (e) { console.error(e); }

          document.getElementById("result-login-view").classList.add("hidden");
          document.getElementById("score-card-view").classList.remove("hidden");

          if (document.getElementById("res-marks")) document.getElementById("res-marks").textContent = studentData.score || 0;
          if (document.getElementById("res-percentage")) document.getElementById("res-percentage").textContent = `${studentData.percentage || 0}%`;

          if (document.getElementById("cert-student-name")) document.getElementById("cert-student-name").textContent = studentData.studentName;
          if (document.getElementById("cert-student-class")) document.getElementById("cert-student-class").textContent = `Class: ${studentData.studentClass} ${studentData.studentStream && studentData.studentStream !== 'General' ? '(' + studentData.studentStream + ')' : ''}`;
          if (document.getElementById("cert-school-name")) document.getElementById("cert-school-name").textContent = schoolNameText;
        } else {
          alert("Roll number not found.");
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
}

function startExamTimer(durationMinutes) {
  let timer = durationMinutes * 60;
  const display = document.getElementById("time-remaining");
  
  examTimerInterval = setInterval(() => {
    let minutes = parseInt(timer / 60, 10);
    let seconds = parseInt(timer % 60, 10);

    minutes = minutes < 10 ? "0" + minutes : minutes;
    seconds = seconds < 10 ? "0" + seconds : seconds;

    if (display) display.textContent = minutes + ":" + seconds;

    if (--timer < 0) {
      clearInterval(examTimerInterval);
      alert("Time is up! Auto-submitting exam.");
      document.getElementById("exam-form").requestSubmit();
    }
  }, 1000);
}

async function loadExamQuestions(studentClass, studentStream) {
  const container = document.getElementById("question-container");
  if (!container) return;
  container.innerHTML = "<p style='color:#fff;'>Loading exam questions...</p>";

  try {
    const qSnap = await getDocs(collection(db, "questions"));
    container.innerHTML = "";
    
    let count = 0;
    const sClass = Number(studentClass);
    const sStream = studentStream || "General";

    if (qSnap.empty) {
      container.innerHTML = "<p style='color: #f87171;'>⚠️ No questions found in the database. Please ask Central Admin to add questions in Question Bank Manager.</p>";
      return;
    }

    qSnap.forEach(docSnap => {
      const q = docSnap.data();
      const qTarget = q.targetClass || "6-8";

      let includeQuestion = false;

      if (qTarget === "3-5" && sClass >= 3 && sClass <= 5) includeQuestion = true;
      else if (qTarget === "6-8" && sClass >= 6 && sClass <= 8) includeQuestion = true;
      else if (qTarget === "9-10" && sClass >= 9 && sClass <= 10) includeQuestion = true;
      else if (qTarget === "11-12-Maths" && sClass >= 11 && sClass <= 12 && sStream === "Maths") includeQuestion = true;
      else if (qTarget === "11-12-Science" && sClass >= 11 && sClass <= 12 && sStream === "Science") includeQuestion = true;

      if (includeQuestion) {
        count++;
        const div = document.createElement("div");
        div.style.cssText = "background: rgba(15,23,42,0.8); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #334155;";
        div.innerHTML = `
          <p style="font-weight: bold; color: #38bdf8; margin-bottom: 10px;">Q${count}. ${q.qText || ''}</p>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="color:#fff;"><input type="radio" name="q_${docSnap.id}" value="A"> A) ${q.optA || ''}</label>
            <label style="color:#fff;"><input type="radio" name="q_${docSnap.id}" value="B"> B) ${q.optB || ''}</label>
            <label style="color:#fff;"><input type="radio" name="q_${docSnap.id}" value="C"> C) ${q.optC || ''}</label>
            <label style="color:#fff;"><input type="radio" name="q_${docSnap.id}" value="D"> D) ${q.optD || ''}</label>
          </div>
        `;
        container.appendChild(div);
      }
    });

    if (document.getElementById("exam-total-q")) document.getElementById("exam-total-q").textContent = count;
    if (document.getElementById("exam-mark-per-q")) document.getElementById("exam-mark-per-q").textContent = portalConfigData.marksPerCorrect || 1;
    if (document.getElementById("exam-neg-mark")) document.getElementById("exam-neg-mark").textContent = portalConfigData.negativeMarking || 0;

    if (count === 0) {
      container.innerHTML = `<p style='color: #f87171;'>⚠️ No matching questions found for Class ${sClass} (${sStream}) in the database. Please add questions for this category in Question Bank Manager.</p>`;
    }
  } catch (e) {
    console.error("Error loading questions:", e);
    container.innerHTML = "<p style='color: #f87171;'>❌ Error loading questions from database. Please check internet connection or Firebase permissions.</p>";
  }
}

window.downloadHighQualityPDF = () => {
  const element = document.getElementById("certificate");
  if (!element) return;
  const opt = {
    margin: 0,
    filename: 'NVMSO_Certificate.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 3, useCORS: true, letterRendering: true, scrollX: 0, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  html2pdf().from(element).set(opt).save();
};
