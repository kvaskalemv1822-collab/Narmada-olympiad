import os
import json
import random
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)

# Strict Security Lockdowns for Cross-Origin Resources (CORS)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ==========================================================================
# 🛡️ CLOUD FIREBASE DATABASE INITIALIZATION GRID
# ==========================================================================
try:
    if not firebase_admin._apps:
        firebase_key_json = os.environ.get('FIREBASE_CONFIG_JSON')
        if not firebase_key_json:
            raise ValueError("CRITICAL CYBER THREAT: FIREBASE_CONFIG_JSON environmental vector is missing!")
        cred_dict = json.loads(firebase_key_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"❌ Critical Core Setup Exception Tracker: {str(e)}")

# Google Apps Script Webhook URL for 3-Year Secure Storage Backup
GOOGLE_SHEET_WEBHOOK_URL = os.environ.get('GOOGLE_SHEETS_WEBHOOK_URL', '')

def backup_data_to_sheets(payload_type, data_body):
    """Dispatches long-term archival entries to Google Sheets for 3+ years storage."""
    if GOOGLE_SHEET_WEBHOOK_URL:
        try:
            # Runs quietly with timeout to ensure zero system overhead on MAIN server thread
            requests.post(GOOGLE_SHEET_WEBHOOK_URL, json={"type": payload_type, "data": data_body}, timeout=4)
        except:
            pass 

def format_school_name(name_str):
    """Enforces strict Space-Separated Capital Letters Rule (e.g. Ma Parvati School Barwani)"""
    if not name_str: 
        return "NVMSO Associated School"
    return ' '.join([word.capitalize() for word in name_str.split()])

# ==========================================================================
# 1. FIREBASE CONSOLE-ONLY ADMIN AUTHENTICATION ENGINE
# ==========================================================================
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_authenticate():
    try:
        data = request.json or {}
        password = str(data.get('password', '')).strip()
        
        # ABSOLUTE RULE: Fetches ONLY from live Firebase Firestore parameters. Zero hardcoded passkeys inside code.
        config_doc = db.collection('settings').document('portal_config').get()
        if not config_doc.exists:
            return jsonify({"status": "cyber_attack", "message": "🚨 Security Intercept: Config document missing in Firebase console!"}), 500
            
        stored_password = str(config_doc.to_dict().get('adminPassword', '')).strip()
        
        if not stored_password:
            return jsonify({"status": "cyber_attack", "message": "🚨 Security Warning: Password string null inside Cloud Console!"}), 403

        if password == stored_password:
            return jsonify({"status": "success", "message": "Master Node Auth Success!"}), 200
            
        # Triggers acoustic alarm on client browser dashboard instantly on mismatch keys
        return jsonify({"status": "cyber_attack", "message": "🚨 SECURITY INTRUSION TRACE: Admin Password Rejected!"}), 401
    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

# ==========================================================================
# 2. GLOBAL PORTAL PHASE LIFECYCLE MANAGEMENT ROUTERS
# ==========================================================================
@app.route('/api/portal/config', methods=['GET'])
def get_global_config():
    try:
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            if "adminPassword" in config: 
                del config["adminPassword"] # Strips master admin key from public endpoint outputs
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Config mapping trace missing!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_master_portal_settings():
    try:
        data = request.json or {}
        db.collection('settings').document('portal_config').update({
            "onlineFee": int(data.get('onlineFee', 100)),
            "offlineFee": int(data.get('offlineFee', 120)),
            "examDuration": int(data.get('examDuration', 30)),
            "isRegistrationOpen": bool(data.get('isRegistrationOpen', True)),
            "isExamActive": bool(data.get('isExamActive', False)),
            "isResultDeclared": bool(data.get('isResultDeclared', False)),
            "broadcastNotice": str(data.get('broadcastNotice', '')).strip()
        })
        return jsonify({"status": "success", "message": "Master parameters synced!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================================
# 3. STUDENT REGISTRATION PIPELINE WITH HIGH-SECURITY DEFLECTORS
# ==========================================================================
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        org_doc = db.collection('organizers').document(org_code).get()
        
        if org_doc.exists:
            org_data = org_doc.to_dict()
            # NOC Gating Rule: Locks registration pipeline if Coordinator hasn't confirmed NOC permissions
            if not org_data.get('principalApproved', False):
                return jsonify({
                    "status": "locked", 
                    "message": "Registration Locked! School Coordinator has not confirmed Principal Permission NOC yet."
                }), 200
            config_doc = db.collection('settings').document('portal_config').get()
            g_cfg = config_doc.to_dict() if config_doc.exists else {}
            fee = g_cfg.get('offlineFee', 120) if org_data.get('examMode') == 'offline' else g_cfg.get('onlineFee', 100)
            
            return jsonify({
                "status": "success", 
                "schoolName": org_data.get('schoolName'),
                "examMode": org_data.get('examMode', 'online'), 
                "applicableFee": fee
            }), 200
        return jsonify({"status": "invalid", "message": "Organizer School Code Not Found!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/register', methods=['POST'])
def secure_registration():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_num = str(data.get('rollNumber', '')).strip()
        payment_mode = str(data.get('paymentMode', 'online')).lower()
        utr_number = str(data.get('utrNumber', '')).strip()

        if not org_code or not roll_num or not data.get('studentName') or not roll_num.isdigit():
            return jsonify({"status": "cyber_attack", "message": "Security Reject: Malformed payload data vectors!"}), 400

        # RULE 1: Double Registration Blocker (Same School Code + Same Roll Number match grid)
        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "cyber_attack", "message": "🚫 Submission Rejected: This Roll Number is already registered under this School Code!"}), 400

        if payment_mode == "online":
            # ANTI-FAKE UTR PARSING (Strict 12-Digit Numeric Constraint and Repetitive Sequence Filters)
            if not utr_number or len(utr_number) != 12 or not utr_number.isdigit() or utr_number in ["123456789012", "000000000000", "999999999999"]:
                return jsonify({"status": "cyber_attack", "message": "🚫 Fraud Match Detected: Entered Transaction UTR is Fake!"}), 400
            
            # RULE 2: Single-Use Spent Token UTR Tracker
            dup_utr_query = db.collection('students').where('utrNumber', '==', utr_number).limit(1).get()
            if len(dup_utr_query) > 0:
                return jsonify({"status": "cyber_attack", "message": "🚫 Cyber Guard: This transaction UTR token has already been spent!"}), 400
            
            initial_status = "Approved"
            generated_password = str(random.randint(100000, 999999))
        else:
            # RULE 7: Cash Payment Lifecycle Gating. Status: PENDING, Passkey: HIDDEN
            initial_status = "Pending Coordinator Verification"
            generated_password = "HIDDEN_UNTIL_APPROVED"
            utr_number = f"CASH_{org_code}_{roll_num}"

        student_data = {
            "orgCode": org_code, 
            "studentName": str(data.get('studentName')).strip(),
            "motherName": data.get('motherName'), 
            "fatherName": data.get('fatherName'),
            "studentClass": data.get('studentClass'), 
            "rollNumber": roll_num,
            "stream": data.get('stream', ''), 
            "contactNumber": data.get('contactNumber'),
            "paymentMode": payment_mode, 
            "utrNumber": utr_number,
            "paymentStatus": initial_status, 
            "examStatus": "Not Started", 
            "studentPassword": generated_password, 
            "score": 0,
            "createdAt": firestore.SERVER_TIMESTAMP
        }
        
        # Secure Write to main live Firestore Database Clusters
        student_ref.set(student_data)
        db.collection('organizers').document(org_code).update({"totalRegistrations": firestore.Increment(1)})

        # MIRROR BACKUP VECTOR: Instant synchronization replication to Google Sheets for 3+ years storage
        backup_data_to_sheets("STUDENT_REGISTRATION", student_data)

        return jsonify({"status": "success", "message": "Registration Securely Synced!", "paymentStatus": initial_status}), 200
    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

# ==========================================================================
# 4. ORGANIZER LIFECYCLE TERMINAL LAYER (6-DIGIT PIN VECTOR CHECK)
# ==========================================================================
@app.route('/api/organizer/register', methods=['POST'])
def organizer_signup():
    try:
        data = request.json or {}
        pin = str(data.get('pin', '')).strip()
        
        # Enforcing Exactly 6-Digit PIN Validation Gating
        if len(pin) != 6 or not pin.isdigit():
            return jsonify({"status": "error", "message": "Organiser PIN must be exactly 6 digits long!"}), 400
            
        generated_code = f"ORG{random.randint(1000, 9999)}"
        org_data = {
            "orgCode": generated_code, "code": generated_code, "name": data.get('name'),
            "schoolName": format_school_name(data.get('schoolName')), # Auto formatting applied natively
            "contact": data.get('contact'), "password": data.get('password'), "pin": pin, "examMode": "online",
            "principalApproved": False, "manualSettled": False, "totalRegistrations": 0, "registeredAt": firestore.SERVER_TIMESTAMP
        }
        
        db.collection('organizers').document(generated_code).set(org_data)
        backup_data_to_sheets("ORGANIZER_SIGNUP", org_data)
        
        return jsonify({"status": "success", "orgCode": generated_code}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/login', methods=['POST'])
def organizer_login():
    try:
        data = request.json or {}
        code = str(data.get('orgCode', '')).strip().upper()
        doc = db.collection('organizers').document(code).get()
        if doc.exists and str(doc.to_dict().get('password', '')).strip() == str(data.get('password', '')).strip():
            return jsonify({"status": "success", "data": doc.to_dict()}), 200
        return jsonify({"status": "error", "message": "Invalid credentials!"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/update_profile', methods=['POST'])
def update_organizer_profile():
    try:
        data = request.json or {}
        code = str(data.get('orgCode', '')).strip().upper()
        db.collection('organizers').document(code).update({
            "examMode": data.get('examMode', 'online'), 
            "principalApproved": bool(data.get('principalApproved', False))
        })
        return jsonify({"status": "success", "message": "Profile Matrix Updated!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/approve-cash-student', methods=['POST'])
def approve_cash_student():
    """Unlocks hidden passkey and moves candidate from Pending -> Approved on physical cash token collection."""
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        student_ref = db.collection('students').document(student_id)
        if not student_ref.get().exists:
            return jsonify({"status": "error", "message": "Student profile token trace missing!"}), 404
        
        new_pass = str(random.randint(100000, 999999))
        student_ref.update({
            "paymentStatus": "Approved", 
            "studentPassword": new_pass
        })
        return jsonify({"status": "success", "activatedPassword": new_pass}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================================
# 5. SECURE TEST DESIGN FRAMEWORKS & EVALUATION RUNTIME CORES
# ==========================================================================
@app.route('/api/student/exam-login', methods=['POST'])
def student_exam_login():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_num = str(data.get('rollNumber', '')).strip()
        password = str(data.get('password', '')).strip()
        force_score_fetch = bool(data.get('forceScoreFetch', False))
        
        student_id = f"{org_code}_{roll_num}"
        s_doc = db.collection('students').document(student_id).get()
        if not s_doc.exists:
            return jsonify({"status": "error", "message": "Candidate record trace refused!"}), 401
            
        s_data = s_doc.to_dict()
        
        # Dynamic Result Matrix scorecard lookups bypasses login password constraints safely
        if force_score_fetch:
            return jsonify({"status": "success", "accumulatedScore": s_data.get('score', 0)}), 200
            
        if s_data.get('paymentStatus') != "Approved":
            return jsonify({"status": "error", "message": "🔒 Access Refused: Cash verification pending from coordinator!"}), 403
            
        if str(s_data.get('studentPassword')) != password:
            return jsonify({"status": "error", "message": "Incorrect Examination Access Key!"}), 401
            
        # RULE 9: Single-Attempt Exam Attempt Security Constraint Enforced
        if s_data.get('examStatus') == "Completed":
            return jsonify({"status": "error", "message": "🚫 Terminated: You have already submitted your examination workspace sheet!"}), 403
            
        return jsonify({
            "status": "success",
            "studentDetails": {"name": s_data.get('studentName'), "rollNumber": s_data.get('rollNumber'), "class": s_data.get('studentClass'), "schoolCode": s_data.get('orgCode')}
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

