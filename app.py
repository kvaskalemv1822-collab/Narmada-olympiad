import os
import json
import hmac
import time
import base64
import hashlib
import random
from collections import defaultdict, deque
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)

ALLOWED_ORIGINS_ENV = os.environ.get("ALLOWED_ORIGINS", "*").strip()
allowed_origins = (
    "*"
    if ALLOWED_ORIGINS_ENV == "*"
    else [o.strip() for o in ALLOWED_ORIGINS_ENV.split(",") if o.strip()]
)
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": allowed_origins,
            "allow_headers": ["Content-Type", "Authorization", "X-Admin-Token", "X-Org-Token", "X-Student-Token"],
            "methods": ["GET", "POST", "OPTIONS"],
        }
    },
)

# ==========================================================================
# CLOUD FIREBASE DATABASE INITIALIZATION GRID
# ==========================================================================
db = None
try:
    if not firebase_admin._apps:
        firebase_key_json = os.environ.get("FIREBASE_CONFIG_JSON")
        if not firebase_key_json:
            if os.path.exists("serviceAccountKey.json"):
                cred = credentials.Certificate("serviceAccountKey.json")
                firebase_admin.initialize_app(cred)
            else:
                raise ValueError("CRITICAL: FIREBASE_CONFIG_JSON environment variable is missing!")
        else:
            cred_dict = json.loads(firebase_key_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"❌ Critical Core Setup Exception Tracker: {str(e)}")

GOOGLE_SHEET_WEBHOOK_URL = os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL", "").strip()
ADMIN_SECRET_KEY = os.environ.get("ADMIN_SECRET_KEY", "").strip()

# ==========================================================================
# CRYPTOGRAPHIC TOKEN & RATE LIMITING ENGINE
# ==========================================================================
_RATE_BUCKETS = defaultdict(deque)


def _ensure_db():
    if db is None:
        raise RuntimeError("Database connection is not initialized.")


def _get_client_ip() -> str:
    xff = request.headers.get("X-Forwarded-For", "").strip()
    if xff:
        return xff.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _rate_limited(bucket_key: str, max_requests: int, window_seconds: int) -> bool:
    now = time.time()
    q = _RATE_BUCKETS[bucket_key]
    while q and (now - q[0]) > window_seconds:
        q.popleft()
    if len(q) >= max_requests:
        return True
    q.append(now)
    return False


def _get_signing_secret() -> bytes:
    if ADMIN_SECRET_KEY:
        return ADMIN_SECRET_KEY.encode("utf-8")
    fb_env = os.environ.get("FIREBASE_CONFIG_JSON", "").strip()
    if fb_env:
        return hashlib.sha256(fb_env.encode("utf-8")).digest()
    raise RuntimeError("ADMIN_SECRET_KEY or FIREBASE_CONFIG_JSON must be configured for token signing.")


def _create_signed_token(payload_dict: dict, ttl_seconds: int = 28800) -> str:
    body = {
        **payload_dict,
        "iat": int(time.time()),
        "exp": int(time.time()) + ttl_seconds,
    }
    raw_json = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw_json).decode("utf-8").rstrip("=")
    sig = hmac.new(_get_signing_secret(), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"


def _verify_signed_token(token: str):
    if not token or "." not in token:
        return None
    parts = token.strip().split(".", 1)
    b64_payload, sig = parts[0], parts[1]
    try:
        expected_sig = hmac.new(_get_signing_secret(), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    except RuntimeError:
        return None
    if not hmac.compare_digest(sig, expected_sig):
        return None
    padded = b64_payload + "=" * (-len(b64_payload) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def _extract_bearer_token() -> str:
    auth_header = request.headers.get("Authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return ""


def _require_admin():
    token = _extract_bearer_token() or request.headers.get("X-Admin-Token", "").strip()
    payload = _verify_signed_token(token)
    if not payload or payload.get("role") != "admin":
        return None
    return payload


def _require_organizer(requested_org_code: str = ""):
    token = _extract_bearer_token() or request.headers.get("X-Org-Token", "").strip()
    payload = _verify_signed_token(token)
    if not payload or payload.get("role") != "organizer":
        return None
    token_org = str(payload.get("orgCode", "")).strip().upper()
    if not token_org:
        return None
    if requested_org_code and str(requested_org_code).strip().upper() != token_org:
        return None
    return token_org


def _require_student(requested_student_id: str = ""):
    token = _extract_bearer_token() or request.headers.get("X-Student-Token", "").strip()
    if not token and isinstance(request.json, dict):
        token = str(request.json.get("sessionToken") or "").strip()
    payload = _verify_signed_token(token)
    if not payload or payload.get("role") != "student":
        return None
    token_sid = str(payload.get("studentId", "")).strip()
    if not token_sid:
        return None
    if requested_student_id and str(requested_student_id).strip() != token_sid:
        return None
    return token_sid


def _verify_secret_value(plain_val: str, stored_val: str) -> bool:
    if not plain_val or not stored_val:
        return False
    if stored_val.startswith("scrypt:") or stored_val.startswith("pbkdf2:"):
        return check_password_hash(stored_val, plain_val)
    return hmac.compare_digest(plain_val, stored_val)


@app.after_request
def apply_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def backup_data_to_sheets(payload_type, data_body):
    if GOOGLE_SHEET_WEBHOOK_URL:
        try:
            requests.post(GOOGLE_SHEET_WEBHOOK_URL, json={"type": payload_type, "data": data_body}, timeout=4)
        except Exception:
            pass


def format_school_name(name_str):
    if not name_str:
        return "NVMSO Associated School"
    return " ".join([word.capitalize() for word in name_str.split()])


def _resolve_student_bucket(student_class_str, stream_str=""):
    cls_clean = "".join(ch for ch in str(student_class_str or "") if ch.isdigit())
    cls_num = int(cls_clean) if cls_clean else 0
    stream_low = str(stream_str or "").strip().lower()

    if 3 <= cls_num <= 5:
        return "3-5", ""
    if 6 <= cls_num <= 8:
        return "6-8", ""
    if 9 <= cls_num <= 10:
        return "9-10", ""
    if 11 <= cls_num <= 12:
        if "math" in stream_low or stream_low == "m":
            return "11-12-maths", "maths"
        if "sci" in stream_low or stream_low == "s":
            return "11-12-science", "science"
    return "", ""


def _resolve_question_bucket(q_data):
    grp = str(q_data.get("classGroup") or q_data.get("classRange") or q_data.get("targetClass") or "").strip().lower()
    sub = str(q_data.get("subject") or q_data.get("stream") or "").strip().lower()

    if grp in ("3-5", "3rd to 5th") or ("3" in grp and "5" in grp):
        return "3-5", sub
    if grp in ("6-8", "6th to 8th") or ("6" in grp and "8" in grp):
        return "6-8", sub
    if grp in ("9-10", "9th to 10th") or ("9" in grp and "10" in grp):
        return "9-10", sub
    if "11" in grp or "12" in grp:
        if "math" in grp or "math" in sub or sub == "m":
            return "11-12-maths", "maths"
        if "sci" in grp or "sci" in sub or sub == "s":
            return "11-12-science", "science"

    cls_clean = "".join(ch for ch in grp if ch.isdigit())
    cls_num = int(cls_clean) if cls_clean else 0
    if 3 <= cls_num <= 5:
        return "3-5", sub
    if 6 <= cls_num <= 8:
        return "6-8", sub
    if 9 <= cls_num <= 10:
        return "9-10", sub
    if 11 <= cls_num <= 12:
        if "math" in sub or sub == "m":
            return "11-12-maths", "maths"
        if "sci" in sub or sub == "s":
            return "11-12-science", "science"
    return "", sub


def _filter_questions_for_student(questions_list, student_data):
    st_bucket, _ = _resolve_student_bucket(
        student_data.get("studentClass") or student_data.get("class"),
        student_data.get("stream") or student_data.get("subject"),
    )
    if not st_bucket:
        return []

    filtered = []
    for q in questions_list:
        q_bucket, q_sub = _resolve_question_bucket(q)
        if st_bucket == "11-12-maths":
            if q_bucket == "11-12-maths" and (not q_sub or "math" in q_sub or q_sub == "m"):
                filtered.append(q)
        elif st_bucket == "11-12-science":
            if q_bucket == "11-12-science" and (not q_sub or "sci" in q_sub or q_sub == "s"):
                filtered.append(q)
        else:
            if q_bucket == st_bucket:
                filtered.append(q)
    return filtered


def _sanitize_org_profile(org_code: str, od: dict) -> dict:
    clean = dict(od or {})
    clean.pop("password", None)
    clean.pop("pin", None)
    clean["code"] = org_code
    clean["orgCode"] = org_code
    clean["examMode"] = str(clean.get("examMode") or "online").strip().lower()
    if clean["examMode"] not in ("online", "offline"):
        clean["examMode"] = "online"
    upi_val = str(clean.get("upiId") or clean.get("payoutUpi") or "").strip()
    clean["upiId"] = upi_val
    clean["payoutUpi"] = upi_val
    clean["principalApproved"] = bool(clean.get("principalApproved", False))
    return clean


def _compute_org_ledger_totals(org_code: str, org_raw: dict, students: list, g_cfg: dict):
    approved = [s for s in students if s.get("paymentStatus") == "Approved" or s.get("paymentVerified") is True]
    exam_mode = str(org_raw.get("examMode") or "online").strip().lower()
    if exam_mode not in ("online", "offline"):
        exam_mode = "online"

    online_fee = int(g_cfg.get("onlineFee", 100) or 100)
    offline_fee = int(g_cfg.get("offlineFee", 120) or 120)
    current_fee_per_student = offline_fee if exam_mode == "offline" else online_fee

    cash_approved = [s for s in approved if (s.get("paymentMode") or "").lower() in ["offline", "cash"]]
    online_approved = [s for s in approved if (s.get("paymentMode") or "").lower() == "online"]

    total_cash_held = len(cash_approved) * current_fee_per_student
    total_online_collected = len(online_approved) * online_fee
    gross_total = len(approved) * current_fee_per_student
    total_direct_comm = int(len(approved) * online_fee * 0.15)

    referred_organizers_summary = []
    total_ref_comm = 0
    for ref_doc in db.collection("organizers").where("refCode", "==", org_code).stream():
        ref_org_code = str(ref_doc.id).strip().upper()
        if not ref_org_code or ref_org_code == org_code:
            continue

        ref_students = []
        ref_seen = set()
        for rf in ["orgCode", "schoolCode"]:
            for s_doc in db.collection("students").where(rf, "==", ref_org_code).stream():
                if s_doc.id not in ref_seen:
                    ref_seen.add(s_doc.id)
                    ref_students.append(s_doc.to_dict())

        ref_approved_count = len([
            s for s in ref_students
            if s.get("paymentStatus") == "Approved" or s.get("paymentVerified") is True
        ])
        ref_earned = int(ref_approved_count * online_fee * 0.05)
        total_ref_comm += ref_earned
        referred_organizers_summary.append({
            "orgCode": ref_org_code,
            "schoolName": ref_doc.to_dict().get("schoolName", ref_org_code),
            "approvedRegistrations": ref_approved_count,
            "referralCommission": ref_earned,
        })

    return {
        "approved": approved,
        "gross_total": gross_total,
        "total_cash_held": total_cash_held,
        "total_online_collected": total_online_collected,
        "total_direct_comm": total_direct_comm,
        "total_ref_comm": total_ref_comm,
        "referred_organizers_summary": referred_organizers_summary,
    }


# ==========================================================================
# 1. ADMIN AUTHENTICATION ENGINE
# ==========================================================================
@app.route("/api/admin/authenticate", methods=["POST"])
def admin_authenticate():
    ip = _get_client_ip()
    if _rate_limited(f"admin_auth:{ip}", max_requests=10, window_seconds=300):
        return jsonify({"status": "rate_limited", "message": "⏳ Too many login attempts. Try again later."}), 429
    try:
        _ensure_db()
        data = request.json or {}
        password = str(data.get("password", "")).strip()

        config_doc = db.collection("settings").document("portal_config").get()
        if not config_doc.exists:
            return jsonify({"status": "error", "message": "Config document missing!"}), 500

        stored_password = str(config_doc.to_dict().get("adminPassword", "")).strip()
        if _verify_secret_value(password, stored_password):
            admin_token = _create_signed_token({"role": "admin"}, ttl_seconds=28800)
            return jsonify({
                "status": "success",
                "message": "Master Node Auth Success!",
                "token": admin_token,
            }), 200

        return jsonify({"status": "unauthorized", "message": "Wrong password"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==========================================================================
# 2. GLOBAL PORTAL PHASE LIFECYCLE MANAGEMENT ROUTERS
# ==========================================================================
@app.route("/api/portal/config", methods=["GET"])
def get_global_config():
    try:
        _ensure_db()
        config_doc = db.collection("settings").document("portal_config").get()
        if config_doc.exists:
            config = config_doc.to_dict()
            config.pop("adminPassword", None)
            if "totalQuestions" not in config:
                config["totalQuestions"] = int(config.get("questionCount", 30) or 30)
            if "examDurationMinutes" not in config:
                config["examDurationMinutes"] = int(config.get("paperTimeLimit", 30) or 30)
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Config mapping trace missing!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/update_config", methods=["POST"])
def update_master_portal_settings():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        is_reg = bool(data.get("isRegistrationOpen", False))
        is_exam = bool(data.get("isExamActive", False))
        is_result = bool(data.get("isResultDeclared", False))

        if is_result:
            is_reg = False
            is_exam = False
        elif is_exam:
            is_reg = False
            is_result = False
        elif is_reg:
            is_exam = False
            is_result = False

        online_fee = max(0, int(data.get("onlineFee", 100)))
        offline_fee = max(0, int(data.get("offlineFee", 120)))
        total_questions = max(1, min(300, int(data.get("totalQuestions", data.get("questionCount", 30)) or 30)))
        exam_duration = max(1, min(360, int(data.get("examDurationMinutes", data.get("paperTimeLimit", 30)) or 30)))

        update_payload = {
            "onlineFee": online_fee,
            "offlineFee": offline_fee,
            "totalQuestions": total_questions,
            "questionCount": total_questions,
            "examDurationMinutes": exam_duration,
            "paperTimeLimit": exam_duration,
            "adminUpiId": str(data.get("adminUpiId", "narmada@upi")).strip(),
            "isRegistrationOpen": is_reg,
            "isExamActive": is_exam,
            "isResultDeclared": is_result,
            "broadcastNotice": str(data.get("broadcastNotice", "")).strip(),
        }

        db.collection("settings").document("portal_config").set(update_payload, merge=True)
        return jsonify({"status": "success", "message": "Master parameters synced!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==========================================================================
# 3. STUDENT REGISTRATION & SCHOOL VERIFICATION ROUTERS
# ==========================================================================
@app.route("/api/student/verify-school", methods=["POST"])
def verify_school_code():
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode", "")).strip().upper()
        if not org_code:
            return jsonify({"status": "invalid", "message": "Organizer School Code Required!"}), 200

        org_doc = db.collection("organizers").document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            if not org_data.get("principalApproved", False):
                return jsonify({"status": "locked", "message": "Registration Locked! Principal Permission NOC pending."}), 200

            config_doc = db.collection("settings").document("portal_config").get()
            g_cfg = config_doc.to_dict() if config_doc.exists else {}

            exam_mode = (org_data.get("examMode") or "online").lower()
            fee = g_cfg.get("offlineFee", 120) if exam_mode == "offline" else g_cfg.get("onlineFee", 100)

            return jsonify({
                "status": "success",
                "schoolName": org_data.get("schoolName"),
                "examMode": exam_mode,
                "applicableFee": fee,
            }), 200
        return jsonify({"status": "invalid", "message": "Organizer School Code Not Found!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/student/register", methods=["POST"])
def secure_registration():
    ip = _get_client_ip()
    if _rate_limited(f"std_reg:{ip}", max_requests=25, window_seconds=300):
        return jsonify({"status": "rate_limited", "message": "⏳ Too many registration attempts. Try again later."}), 429
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode", "")).strip().upper()
        roll_num = str(data.get("rollNumber", "")).strip()
        student_name = str(data.get("studentName", "")).strip()
        student_class = str(data.get("studentClass", "")).strip()
        payment_mode = str(data.get("paymentMode", "online")).strip().lower()
        if payment_mode not in ("online", "offline"):
            payment_mode = "online"

        utr_number = str(data.get("utrNumber", "")).strip().upper() or "NOT_PROVIDED"
        mother_name = str(data.get("motherName", "")).strip()
        father_name = str(data.get("fatherName", "")).strip()
        stream = str(data.get("stream", data.get("subject", ""))).strip()
        contact_number = "".join(ch for ch in str(data.get("contactNumber", "")) if ch.isdigit())

        if not org_code or not roll_num or not student_name or not roll_num.isdigit() or len(contact_number) < 10:
            return jsonify({"status": "error", "message": "Invalid registration fields! Check Roll No and 10-digit Mobile."}), 400

        if payment_mode == "online" and (utr_number == "NOT_PROVIDED" or len(utr_number) < 6):
            return jsonify({"status": "error", "message": "Valid UTR number is required for online payment!"}), 400

        config_doc = db.collection("settings").document("portal_config").get()
        g_cfg = config_doc.to_dict() if config_doc.exists else {}
        if not g_cfg.get("isRegistrationOpen", False):
            return jsonify({"status": "error", "message": "🚫 Registration is currently closed by Central Admin!"}), 403

        org_doc = db.collection("organizers").document(org_code).get()
        if not org_doc.exists:
            return jsonify({"status": "error", "message": "🚫 Invalid School Organizer Code!"}), 400
        if not org_doc.to_dict().get("principalApproved", False):
            return jsonify({"status": "locked", "message": "🚫 Principal Permission NOC pending for this school!"}), 403

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection("students").document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "error", "message": "🚫 Roll Number already registered under this school!"}), 409

        if payment_mode == "online":
            existing_utr = list(db.collection("students").where("utrNumber", "==", utr_number).limit(1).stream())
            if existing_utr:
                return jsonify({"status": "error", "message": "🚫 Duplicate UTR Number detected! Each UTR can be used only once."}), 409

        initial_status = "Pending Payment Verification" if payment_mode == "online" else "Pending Organizer Cash Approval"

        student_payload = {
            "studentId": student_id,
            "orgCode": org_code,
            "schoolCode": org_code,
            "rollNumber": roll_num,
            "studentName": student_name,
            "motherName": mother_name,
            "fatherName": father_name,
            "studentClass": student_class,
            "stream": stream,
            "subject": stream,
            "contactNumber": contact_number,
            "paymentMode": payment_mode,
            "utrNumber": utr_number if payment_mode == "online" else "CASH_MODE",
            "paymentStatus": initial_status,
            "paymentVerified": False,
            "examCompleted": False,
            "score": 0,
            "percentage": 0,
            "timestamp": firestore.SERVER_TIMESTAMP,
        }

        student_ref.set(student_payload)
        db.collection("organizers").document(org_code).set({"manualSettled": False}, merge=True)
        backup_data_to_sheets("STUDENT_REGISTRATION", student_payload)

        return jsonify({"status": "success", "message": "Registration successful!", "studentId": student_id}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==========================================================================
# 4. STUDENT EXAM LOGIN & ASSESSMENT ROUTERS
# ==========================================================================
@app.route("/api/student/login", methods=["POST"])
def student_login():
    ip = _get_client_ip()
    if _rate_limited(f"std_login:{ip}", max_requests=20, window_seconds=300):
        return jsonify({"status": "rate_limited", "message": "⏳ Too many login attempts. Try again later."}), 429
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode", "")).strip().upper()
        roll_number = str(data.get("rollNumber", "")).strip()
        input_password = str(data.get("password", "")).strip()

        if not org_code or not roll_number or not input_password:
            return jsonify({"status": "error", "message": "Missing login credentials"}), 400

        student_id = f"{org_code}_{roll_number}"
        student_doc = db.collection("students").document(student_id).get()
        if not student_doc.exists:
            return jsonify({"status": "error", "message": "Student record not found. Check School Code & Roll No."}), 404

        s_data = student_doc.to_dict()
        is_verified = bool(s_data.get("paymentVerified", False) or s_data.get("paymentStatus") == "Approved")
        pay_mode = str(s_data.get("paymentMode", "online")).lower()

        if not is_verified:
            if pay_mode == "online":
                return jsonify({"status": "error", "message": "🔒 Exam Locked! Your online payment UTR is pending Central Admin verification."}), 403
            return jsonify({"status": "error", "message": "🔒 Exam Locked! Your cash payment is pending School Organizer approval."}), 403

        if s_data.get("examCompleted", False):
            return jsonify({"status": "error", "message": "⚠️ You have already submitted your exam! Multiple attempts are not allowed."}), 403

        mother_name = s_data.get("motherName", "").strip()
        expected_password = (mother_name[:2].upper() + roll_number) if len(mother_name) >= 2 else roll_number

        if not hmac.compare_digest(input_password, expected_password):
            return jsonify({"status": "error", "message": "Invalid password! Format is Mother's first 2 capital letters + Roll No."}), 401

        org_doc = db.collection("organizers").document(org_code).get()
        if org_doc.exists:
            org_d = org_doc.to_dict()
            s_data["schoolName"] = org_d.get("schoolName", org_code)
            s_data["examMode"] = (org_d.get("examMode") or "online").lower()
        else:
            s_data["schoolName"] = org_code
            s_data["examMode"] = (s_data.get("examMode") or "online").lower()

        s_data.pop("submittedAnswers", None)
        s_data["id"] = student_doc.id
        s_data["studentId"] = student_id
        s_data["sessionToken"] = _create_signed_token({"role": "student", "studentId": student_id}, ttl_seconds=10800)
        return jsonify({"status": "success", "student": s_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/student/questions", methods=["GET"])
def student_get_questions():
    try:
        _ensure_db()
        questions_ref = db.collection("questions").stream()
        questions = []
        for doc in questions_ref:
            q_data = doc.to_dict()
            q_data.pop("correctOption", None)
            q_data.pop("negativeMarking", None)
            q_data["id"] = doc.id
            questions.append(q_data)
        return jsonify({"status": "success", "questions": questions}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/student/submit_exam", methods=["POST"])
def student_submit_exam():
    try:
        _ensure_db()
        data = request.json or {}
        student_id = str(data.get("studentId") or "").strip()
        answers = data.get("answers", {})
        auto_submitted = bool(data.get("autoSubmitted", False))

        if not student_id or not isinstance(answers, dict):
            return jsonify({"status": "error", "message": "Invalid submission payload"}), 400

        verified_sid = _require_student(student_id)
        if not verified_sid:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid student session token required!"}), 401

        student_ref = db.collection("students").document(student_id)
        doc = student_ref.get()
        if not doc.exists:
            return jsonify({"status": "error", "message": "Student not found"}), 404

        s_data = doc.to_dict()
        if s_data.get("examCompleted", False):
            return jsonify({"status": "error", "message": "Exam already submitted earlier!"}), 409

        config_doc = db.collection("settings").document("portal_config").get()
        g_cfg = config_doc.to_dict() if config_doc.exists else {}
        configured_q_limit = int(g_cfg.get("totalQuestions") or g_cfg.get("questionCount") or 30)

        all_q_docs = list(db.collection("questions").stream())
        questions_map = {q.id: q.to_dict() for q in all_q_docs}

        matched_q_list = _filter_questions_for_student(
            [{"id": q.id, **q.to_dict()} for q in all_q_docs],
            s_data,
        )
        if matched_q_list:
            total_marks = max(1, min(len(matched_q_list), configured_q_limit))
            allowed_q_ids = {q["id"] for q in matched_q_list[:configured_q_limit]}
        else:
            total_marks = max(1, configured_q_limit)
            allowed_q_ids = set(questions_map.keys())

        obtained_score = 0.0
        sanitized_answers = {}

        for q_id, selected_opt in answers.items():
            q_id_str = str(q_id)
            if q_id_str not in allowed_q_ids or q_id_str not in questions_map:
                continue
            opt_clean = str(selected_opt or "").strip().upper()
            if opt_clean not in ("A", "B", "C", "D", ""):
                continue
            sanitized_answers[q_id_str] = opt_clean

            correct_opt = str(questions_map[q_id_str].get("correctOption", "")).strip().upper()
            neg_marking = float(questions_map[q_id_str].get("negativeMarking", 0) or 0)

            if opt_clean and opt_clean == correct_opt:
                obtained_score += 1.0
            elif opt_clean and opt_clean != correct_opt:
                obtained_score -= neg_marking

        final_score = max(0.0, min(float(total_marks), obtained_score))
        percentage = round((final_score / total_marks) * 100, 2)

        student_ref.update({
            "examCompleted": True,
            "score": final_score,
            "totalMarks": total_marks,
            "totalQuestions": total_marks,
            "percentage": percentage,
            "autoSubmitted": auto_submitted,
            "submittedAnswers": sanitized_answers,
        })

        return jsonify({
            "status": "success",
            "score": final_score,
            "total": total_marks,
            "percentage": percentage,
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/student/result", methods=["POST"])
def student_get_result():
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode", "")).strip().upper()
        roll_number = str(data.get("rollNumber", "")).strip()

        if not org_code or not roll_number:
            return jsonify({"status": "error", "message": "Missing school code or roll number"}), 400

        config_doc = db.collection("settings").document("portal_config").get()
        g_cfg = config_doc.to_dict() if config_doc.exists else {}
        if not g_cfg.get("isResultDeclared", False):
            return jsonify({"status": "error", "message": "Result has not been declared by Central Admin yet!"}), 403

        student_id = f"{org_code}_{roll_number}"
        student_doc = db.collection("students").document(student_id).get()
        if not student_doc.exists:
            return jsonify({"status": "error", "message": "Student record not found."}), 404

        s_data = student_doc.to_dict()
        s_data.pop("submittedAnswers", None)

        org_doc = db.collection("organizers").document(org_code).get()
        s_data["schoolName"] = org_doc.to_dict().get("schoolName", org_code) if org_doc.exists else org_code

        safe_result = {
            "studentId": s_data.get("studentId", student_id),
            "orgCode": org_code,
            "schoolName": s_data.get("schoolName"),
            "rollNumber": s_data.get("rollNumber"),
            "studentName": s_data.get("studentName"),
            "studentClass": s_data.get("studentClass"),
            "stream": s_data.get("stream", ""),
            "score": s_data.get("score", 0),
            "totalMarks": s_data.get("totalMarks", s_data.get("totalQuestions", 30)),
            "totalQuestions": s_data.get("totalQuestions", s_data.get("totalMarks", 30)),
            "percentage": s_data.get("percentage", 0),
            "examCompleted": bool(s_data.get("examCompleted", False)),
        }
        return jsonify({"status": "success", "result": safe_result}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==========================================================================
# 5. ADMIN CENTRAL PANEL & ORGANIZER MANAGEMENT ROUTERS
# ==========================================================================
@app.route("/api/admin/all_data", methods=["POST"])
def admin_get_all_data():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        orgs = []
        for doc in db.collection("organizers").stream():
            orgs.append(_sanitize_org_profile(doc.id, doc.to_dict()))
        students = []
        for doc in db.collection("students").stream():
            sd = doc.to_dict()
            sd.pop("submittedAnswers", None)
            sd["id"] = doc.id
            students.append(sd)
        return jsonify({"status": "success", "organizers": orgs, "students": students}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/financial_requests", methods=["GET"])
def admin_get_financial_requests():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        settlements = [{**doc.to_dict(), "id": doc.id} for doc in db.collection("settlements").where("status", "==", "pending").stream()]
        payouts = [{**doc.to_dict(), "id": doc.id} for doc in db.collection("payouts").where("status", "==", "pending").stream()]
        return jsonify({"status": "success", "settlements": settlements, "payouts": payouts}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/approve_payment", methods=["POST"])
def admin_approve_online_payment():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        student_id = str(data.get("studentId") or "").strip()
        if not student_id:
            return jsonify({"status": "error", "message": "Missing ID"}), 400
        db.collection("students").document(student_id).update({
            "paymentVerified": True,
            "paymentStatus": "Approved",
            "rejectionReason": "",
        })
        return jsonify({"status": "success", "message": "Payment approved"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/reject_payment", methods=["POST"])
def admin_reject_online_payment():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        student_id = str(data.get("studentId") or "").strip()
        reason = str(data.get("reason") or "Invalid UTR").strip()
        if not student_id:
            return jsonify({"status": "error", "message": "Missing ID"}), 400
        db.collection("students").document(student_id).update({
            "paymentVerified": False,
            "paymentStatus": "Rejected",
            "rejectionReason": reason,
        })
        return jsonify({"status": "success", "message": "Payment rejected"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/manual_score_entry", methods=["POST"])
def admin_manual_score_entry():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        student_id = str(data.get("studentId") or "").strip()
        score = float(data.get("score", 0))
        total_marks = float(data.get("totalMarks", data.get("totalQuestions", 30)) or 30)
        if not student_id or total_marks <= 0 or score < 0 or score > total_marks:
            return jsonify({"status": "error", "message": "Invalid score or total marks range!"}), 400

        percentage = round((score / total_marks) * 100, 2)
        db.collection("students").document(student_id).update({
            "score": score,
            "totalMarks": total_marks,
            "totalQuestions": total_marks,
            "percentage": percentage,
            "examCompleted": True,
            "manualEntry": True,
        })
        return jsonify({"status": "success", "message": "Score saved successfully"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/reexam", methods=["POST"])
def admin_trigger_reexam():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        student_id = str(data.get("studentId") or "").strip()
        if not student_id:
            return jsonify({"status": "error", "message": "Missing ID"}), 400
        db.collection("students").document(student_id).update({
            "examCompleted": False,
            "score": 0,
            "percentage": 0,
            "submittedAnswers": {},
        })
        return jsonify({"status": "success", "message": "Re-exam triggered"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/approve_settlement", methods=["POST"])
def admin_approve_settlement():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode") or "").strip().upper()
        req_id = str(data.get("requestId") or "").strip()

        if org_code:
            org_ref = db.collection("organizers").document(org_code)
            org_doc = org_ref.get()
            org_raw = org_doc.to_dict() if org_doc.exists else {}

            cfg_doc = db.collection("settings").document("portal_config").get()
            g_cfg = cfg_doc.to_dict() if cfg_doc.exists else {}

            students = []
            seen = set()
            for f in ["orgCode", "schoolCode"]:
                for doc in db.collection("students").where(f, "==", org_code).stream():
                    if doc.id not in seen:
                        seen.add(doc.id)
                        students.append(doc.to_dict())

            totals = _compute_org_ledger_totals(org_code, org_raw, students, g_cfg)

            org_ref.set({
                "manualSettled": True,
                "settledApprovedCount": len(totals["approved"]),
                "settledCashBase": totals["total_cash_held"],
                "settledDirectCommBase": totals["total_direct_comm"],
                "settledAt": firestore.SERVER_TIMESTAMP,
            }, merge=True)

        if req_id:
            db.collection("settlements").document(req_id).update({"status": "approved"})

        return jsonify({"status": "success", "message": "Settlement approved"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/complete_payout", methods=["POST"])
def admin_complete_payout():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        payout_id = str(data.get("payoutId") or "").strip()
        if payout_id:
            payout_ref = db.collection("payouts").document(payout_id)
            payout_doc = payout_ref.get()
            payout_ref.update({"status": "completed"})
            if payout_doc.exists:
                p_data = payout_doc.to_dict()
                org_code = str(p_data.get("orgCode") or "").strip().upper()
                if org_code:
                    org_ref = db.collection("organizers").document(org_code)
                    org_raw = org_ref.get().to_dict() or {}
                    cfg_doc = db.collection("settings").document("portal_config").get()
                    g_cfg = cfg_doc.to_dict() if cfg_doc.exists else {}
                    students = []
                    seen = set()
                    for f in ["orgCode", "schoolCode"]:
                        for s_doc in db.collection("students").where(f, "==", org_code).stream():
                            if s_doc.id not in seen:
                                seen.add(s_doc.id)
                                students.append(s_doc.to_dict())
                    totals = _compute_org_ledger_totals(org_code, org_raw, students, g_cfg)
                    org_ref.set({
                        "settledRefCommBase": totals["total_ref_comm"],
                        "payoutSettledAt": firestore.SERVER_TIMESTAMP,
                    }, merge=True)
        return jsonify({"status": "success", "message": "Payout completed"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==========================================================================
# 6. ORGANIZER PORTAL & STUDENTS MATRIX
# ==========================================================================
@app.route("/api/organizer/login", methods=["POST"])
def organizer_login():
    ip = _get_client_ip()
    if _rate_limited(f"org_login:{ip}", max_requests=15, window_seconds=300):
        return jsonify({"status": "rate_limited", "message": "⏳ Too many login attempts. Try again later."}), 429
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode", "")).strip().upper()
        password = str(data.get("password", "")).strip()
        org_doc = db.collection("organizers").document(org_code).get()
        if not org_doc.exists:
            return jsonify({"status": "error", "message": "Invalid credentials"}), 401
        stored_pass = str(org_doc.to_dict().get("password", "")).strip()
        if not _verify_secret_value(password, stored_pass):
            return jsonify({"status": "error", "message": "Invalid credentials"}), 401

        org_ref = db.collection("organizers").document(org_code)
        login_update = {}
        if "examMode" in data and data.get("examMode"):
            selected_mode = str(data.get("examMode")).strip().lower()
            if selected_mode in ("online", "offline"):
                login_update["examMode"] = selected_mode
        if "principalApproved" in data and data.get("principalApproved") is not None:
            login_update["principalApproved"] = bool(data.get("principalApproved"))
        if login_update:
            org_ref.set(login_update, merge=True)
            org_doc = org_ref.get()

        org_data = _sanitize_org_profile(org_code, org_doc.to_dict())
        org_data["orgToken"] = _create_signed_token({"role": "organizer", "orgCode": org_code}, ttl_seconds=28800)
        return jsonify({"status": "success", "data": org_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/recover_password", methods=["POST"])
def organizer_recover_password():
    ip = _get_client_ip()
    if _rate_limited(f"org_recover:{ip}", max_requests=10, window_seconds=300):
        return jsonify({"status": "rate_limited", "message": "⏳ Too many recovery attempts. Try again later."}), 429
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode", "")).strip().upper()
        contact = "".join(ch for ch in str(data.get("contact", "")) if ch.isdigit())
        pin = str(data.get("pin", "")).strip()
        new_password = str(data.get("newPassword", "")).strip()

        if not org_code or len(contact) < 10 or len(pin) != 6 or not pin.isdigit():
            return jsonify({"status": "error", "message": "Enter valid Organizer Code, Mobile Number, and 6-digit PIN."}), 400

        org_doc = db.collection("organizers").document(org_code).get()
        if not org_doc.exists:
            return jsonify({"status": "error", "message": "Organizer Code not found."}), 404

        od = org_doc.to_dict()
        stored_contact = "".join(ch for ch in str(od.get("contact", "")) if ch.isdigit())
        stored_pin = str(od.get("pin", "")).strip()

        if contact != stored_contact or not _verify_secret_value(pin, stored_pin):
            return jsonify({"status": "error", "message": "Mobile number or 6-digit PIN does not match."}), 401

        if new_password:
            if len(new_password) < 4:
                return jsonify({"status": "error", "message": "New password must be at least 4 characters."}), 400
            db.collection("organizers").document(org_code).update({
                "password": generate_password_hash(new_password)
            })
            return jsonify({"status": "success", "message": "Password reset successfully!"}), 200

        stored_pass = str(od.get("password", "")).strip()
        if stored_pass and not (stored_pass.startswith("scrypt:") or stored_pass.startswith("pbkdf2:")):
            return jsonify({"status": "success", "password": stored_pass}), 200

        return jsonify({"status": "error", "message": "Please enter a New Password to reset your hashed credential."}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/register", methods=["POST"])
def organizer_register():
    ip = _get_client_ip()
    if _rate_limited(f"org_reg:{ip}", max_requests=10, window_seconds=300):
        return jsonify({"status": "rate_limited", "message": "⏳ Too many registration attempts. Try again later."}), 429
    try:
        _ensure_db()
        data = request.json or {}
        school_name = str(data.get("schoolName", "")).strip()
        name = str(data.get("name", "")).strip()
        contact = "".join(ch for ch in str(data.get("contact", "")) if ch.isdigit())
        password = str(data.get("password", "")).strip()
        pin = str(data.get("pin", "")).strip()
        ref_code = str(data.get("refCode", "")).strip().upper()

        if not school_name or not name or len(contact) < 10 or len(password) < 4 or len(pin) != 6 or not pin.isdigit():
            return jsonify({"status": "error", "message": "Please fill all fields properly (10-digit mobile, 6-digit PIN)."}), 400

        existing_contact = list(db.collection("organizers").where("contact", "==", contact).limit(1).stream())
        if existing_contact:
            return jsonify({"status": "error", "message": "An organizer account with this contact number already exists!"}), 409

        rand_num = random.randint(100, 999)
        org_code = f"NVMS{rand_num}"
        while db.collection("organizers").document(org_code).get().exists:
            org_code = f"NVMS{random.randint(100, 999)}"

        org_payload = {
            "schoolName": format_school_name(school_name),
            "name": name,
            "contact": contact,
            "password": generate_password_hash(password),
            "pin": generate_password_hash(pin),
            "refCode": ref_code,
            "examMode": "online",
            "upiId": "",
            "payoutUpi": "",
            "principalApproved": False,
            "manualSettled": False,
            "settledCashBase": 0,
            "settledDirectCommBase": 0,
            "settledRefCommBase": 0,
            "totalRegistrations": 0,
            "timestamp": firestore.SERVER_TIMESTAMP,
        }
        db.collection("organizers").document(org_code).set(org_payload)
        return jsonify({"status": "success", "orgCode": org_code}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/update_profile", methods=["POST"])
def organizer_update_profile():
    try:
        _ensure_db()
        data = request.json or {}
        org_code = str(data.get("orgCode", "")).strip().upper()
        verified_org = _require_organizer(org_code)
        if not verified_org:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid coordinator session required!"}), 401

        update_fields = {}

        if "examMode" in data and data.get("examMode") is not None:
            exam_mode = str(data.get("examMode", "online")).strip().lower()
            if exam_mode not in ("online", "offline"):
                exam_mode = "online"
            update_fields["examMode"] = exam_mode

        if "principalApproved" in data and data.get("principalApproved") is not None:
            update_fields["principalApproved"] = bool(data.get("principalApproved"))

        upi_raw = data.get("upiId") if "upiId" in data else (
            data.get("payoutUpi") if "payoutUpi" in data else data.get("upi")
        )
        if upi_raw is not None:
            upi_val = str(upi_raw).strip()
            update_fields["upiId"] = upi_val
            update_fields["payoutUpi"] = upi_val

        if not update_fields:
            return jsonify({"status": "error", "message": "No profile fields provided to update"}), 400

        org_ref = db.collection("organizers").document(verified_org)
        org_ref.set(update_fields, merge=True)
        updated_doc = org_ref.get()
        sanitized = _sanitize_org_profile(verified_org, updated_doc.to_dict() if updated_doc.exists else update_fields)

        return jsonify({
            "status": "success",
            "message": "Updated",
            "data": sanitized,
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/students", methods=["POST"])
def organizer_get_students():
    try:
        _ensure_db()
        data = request.json or {}
        req_org = str(data.get("orgCode", "")).strip().upper()
        org_code = _require_organizer(req_org)
        if not org_code:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid coordinator session required!"}), 401

        students = []
        seen = set()
        for f in ["orgCode", "schoolCode"]:
            for doc in db.collection("students").where(f, "==", org_code).stream():
                if doc.id not in seen:
                    seen.add(doc.id)
                    sd = doc.to_dict()
                    sd.pop("submittedAnswers", None)
                    sd["id"] = doc.id
                    students.append(sd)

        org_doc = db.collection("organizers").document(org_code).get()
        org_raw = org_doc.to_dict() if org_doc.exists else {}
        org_clean = _sanitize_org_profile(org_code, org_raw)
        is_settled = bool(org_raw.get("manualSettled", False))
        cfg_doc = db.collection("settings").document("portal_config").get()
        g_cfg = cfg_doc.to_dict() if cfg_doc.exists else {}

        totals = _compute_org_ledger_totals(org_code, org_raw, students, g_cfg)

        settled_cash_base = int(org_raw.get("settledCashBase", 0) or 0) if is_settled else 0
        settled_direct_base = int(org_raw.get("settledDirectCommBase", 0) or 0) if is_settled else 0
        settled_ref_base = int(org_raw.get("settledRefCommBase", 0) or 0)

        active_cash_held = max(0, totals["total_cash_held"] - settled_cash_base)
        active_direct_comm = max(0, totals["total_direct_comm"] - settled_direct_base)
        active_ref_comm = max(0, totals["total_ref_comm"] - settled_ref_base)
        active_total_comm = active_direct_comm + active_ref_comm

        # Referral commission is paid by NVMS Portal only; never deducted from cash collection.
        cash_net_balance = active_cash_held - active_direct_comm
        net_payable_to_nvms = max(0, cash_net_balance)
        direct_shortfall = max(0, -cash_net_balance)
        nvms_owes_organizer = direct_shortfall + active_ref_comm

        return jsonify({
            "status": "success",
            "students": students,
            "organizer": org_clean,
            "isSettled": is_settled,
            "adminUpiId": g_cfg.get("adminUpiId", "narmada@upi"),
            "isResultDeclared": bool(g_cfg.get("isResultDeclared", False)),
            "referredOrganizers": totals["referred_organizers_summary"],
            "financials": {
                "totalRegistrations": len(students),
                "approvedRegistrations": len(totals["approved"]),
                "totalFees": totals["gross_total"],
                "cashHeld": active_cash_held,
                "onlineCollected": totals["total_online_collected"],
                "totalCommission": active_total_comm,
                "directCommission": active_direct_comm,
                "referralCommission": active_ref_comm,
                "netPayableToNvms": net_payable_to_nvms,
                "nvmsOwesOrganizer": nvms_owes_organizer,
            },
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/approve_cash", methods=["POST"])
def organizer_approve_cash():
    try:
        _ensure_db()
        data = request.json or {}
        student_id = str(data.get("studentId") or "").strip()
        req_org = str(data.get("orgCode") or "").strip().upper()
        org_code = _require_organizer(req_org)
        if not org_code:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid coordinator session required!"}), 401
        if not student_id:
            return jsonify({"status": "error", "message": "Missing student ID"}), 400

        st_doc = db.collection("students").document(student_id).get()
        if not st_doc.exists:
            return jsonify({"status": "error", "message": "Student not found"}), 404

        st_data = st_doc.to_dict()
        if str(st_data.get("orgCode") or "").strip().upper() != org_code:
            return jsonify({"status": "unauthorized", "message": "Student does not belong to your school"}), 403
        if str(st_data.get("paymentMode") or "").strip().lower() not in ("offline", "cash"):
            return jsonify({"status": "error", "message": "Only offline/cash registrations can be approved by coordinator"}), 400

        db.collection("students").document(student_id).update({"paymentVerified": True, "paymentStatus": "Approved"})
        db.collection("organizers").document(org_code).set({"manualSettled": False}, merge=True)
        return jsonify({"status": "success", "message": "Cash approved"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/submit_settlement", methods=["POST"])
def organizer_submit_settlement():
    try:
        _ensure_db()
        data = request.json or {}
        req_org = str(data.get("orgCode") or "").strip().upper()
        org_code = _require_organizer(req_org)
        if not org_code:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid coordinator session required!"}), 401

        utr = str(data.get("utrNumber") or "").strip().upper()
        amount = float(data.get("amount") or 0)
        if not utr or len(utr) < 6 or amount <= 0:
            return jsonify({"status": "error", "message": "Valid UTR number and amount required"}), 400

        existing_utr = list(db.collection("settlements").where("utrNumber", "==", utr).limit(1).stream())
        if existing_utr:
            return jsonify({"status": "error", "message": "Duplicate UTR number already submitted!"}), 409

        db.collection("settlements").document().set({
            "orgCode": org_code,
            "utrNumber": utr,
            "amount": amount,
            "status": "pending",
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
        return jsonify({"status": "success", "message": "Submitted"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/request_payout", methods=["POST"])
def organizer_request_payout():
    try:
        _ensure_db()
        data = request.json or {}
        req_org = str(data.get("orgCode") or "").strip().upper()
        org_code = _require_organizer(req_org)
        if not org_code:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid coordinator session required!"}), 401

        upi_id = str(data.get("upiId") or data.get("payoutUpi") or "").strip()
        amount = float(data.get("amount") or 0)
        if "@" not in upi_id or amount <= 0:
            return jsonify({"status": "error", "message": "Valid UPI ID and amount required"}), 400

        db.collection("organizers").document(org_code).set({
            "upiId": upi_id,
            "payoutUpi": upi_id,
        }, merge=True)

        db.collection("payouts").document().set({
            "orgCode": org_code,
            "upiId": upi_id,
            "amount": amount,
            "status": "pending",
            "timestamp": firestore.SERVER_TIMESTAMP,
        })
        return jsonify({"status": "success", "message": "Requested"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==========================================================================
# 7. CHAT & QUESTION BANK ROUTERS
# ==========================================================================
@app.route("/api/admin/queries", methods=["GET"])
def get_queries():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        queries = [{**doc.to_dict(), "ticketId": doc.id} for doc in db.collection("supportTickets").stream()]
        return jsonify({"status": "success", "queries": queries}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/query_messages", methods=["GET"])
def get_query_messages():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        ticket_id = str(request.args.get("ticketId") or "").strip()
        if not ticket_id:
            return jsonify({"status": "error", "message": "Missing ticketId"}), 400
        msgs = [
            doc.to_dict()
            for doc in db.collection("supportTickets").document(ticket_id).collection("messages").order_by("createdAt").stream()
        ]
        return jsonify({"status": "success", "messages": msgs}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/reply_query", methods=["POST"])
def reply_query():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        t_id = str(data.get("ticketId") or "").strip()
        msg = str(data.get("message") or "").strip()
        if not t_id:
            return jsonify({"status": "error", "message": "Missing ticketId"}), 400
        db.collection("supportTickets").document(t_id).collection("messages").add({
            "text": msg,
            "imageUrl": data.get("imageUrl", ""),
            "isAdmin": True,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        db.collection("supportTickets").document(t_id).set({"lastMessage": msg}, merge=True)
        return jsonify({"status": "success", "message": "Replied"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/send_query", methods=["POST"])
def organizer_send_query():
    try:
        _ensure_db()
        data = request.json or {}
        req_org = str(data.get("orgCode") or "").strip().upper()
        org_code = _require_organizer(req_org)
        if not org_code:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid coordinator session required!"}), 401

        t_id = f"TICKET_{org_code}"
        msg_text = str(data.get("message") or "").strip()
        db.collection("supportTickets").document(t_id).set({
            "orgCode": org_code,
            "senderName": data.get("senderName") or f"School ({org_code})",
            "lastMessage": msg_text,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
        db.collection("supportTickets").document(t_id).collection("messages").add({
            "text": msg_text,
            "imageUrl": data.get("imageUrl", ""),
            "isAdmin": False,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        return jsonify({"status": "success", "message": "Sent"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/organizer/query_messages", methods=["GET"])
def organizer_get_query_messages():
    try:
        _ensure_db()
        req_org = str(request.args.get("orgCode") or "").strip().upper()
        org_code = _require_organizer(req_org)
        if not org_code:
            return jsonify({"status": "unauthorized", "message": "🔒 Valid coordinator session required!"}), 401

        msgs = [
            doc.to_dict()
            for doc in db.collection("supportTickets").document(f"TICKET_{org_code}").collection("messages").order_by("createdAt").stream()
        ]
        return jsonify({"status": "success", "messages": msgs}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/admin/add-question", methods=["POST"])
def admin_add_question():
    if not _require_admin():
        return jsonify({"status": "unauthorized", "message": "🔒 Admin token required!"}), 401
    try:
        _ensure_db()
        data = request.json or {}
        class_grp = str(data.get("classGroup") or
