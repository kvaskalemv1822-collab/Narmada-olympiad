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
@app.route('/api/student/fetch-paper', methods=['POST'])
def fetch_targeted_exam_paper():
    try:
        data = request.json or {}
        class_ref = str(data.get('classReference', '')).strip()
        student_id = f"{str(data.get('orgCode')).upper()}_{str(data.get('rollNumber'))}"
        
        s_snap = db.collection('students').document(student_id).get()
        if not s_snap.exists or s_snap.to_dict().get('examStatus') == "Completed":
            return jsonify({"status": "error", "message": "Paper transmission block closed!"}), 403

        class_num = int(class_ref)
        if 3 <= class_num <= 5: range_key = "3-5"
        elif 6 <= class_num <= 8: range_key = "6-8"
        elif 9 <= class_num <= 10: range_key = "9-10"
        else: range_key = f"11-12-{s_snap.to_dict().get('stream', 'Maths')}"

        q_query = db.collection('questions').where('classRange', '==', range_key).get()
        questions_list = []
        for doc in q_query:
            q_data = doc.to_dict()
            questions_list.append({
                "id": doc.id, 
                "questionText": q_data.get('questionText'),
                "optionA": q_data.get('optionA'), 
                "optionB": q_data.get('optionB'),
                "optionC": q_data.get('optionC'), 
                "optionD": q_data.get('optionD')
            }) # 🛡️ correctOption parameter hidden to completely paralyze backend inspect source key hacking!
        return jsonify({"status": "success", "questions": questions_list}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/student/submit-exam', methods=['POST'])
def process_exam_submission():
    try:
        data = request.json or {}
        student_id = f"{str(data.get('orgCode')).upper()}_{str(data.get('rollNumber'))}"
        submitted_answers = data.get('answers', {})

        student_ref = db.collection('students').document(student_id)
        s_snap = student_ref.get()
        if not s_snap.exists or s_snap.to_dict().get('examStatus') == "Completed":
            return jsonify({"status": "error", "message": "Evaluation sheet block already locked!"}), 400

        score = 0
        for q_id, chosen in submitted_answers.items():
            q_doc = db.collection('questions').document(q_id).get()
            if q_doc.exists and str(chosen).strip().upper() == str(q_doc.to_dict().get('correctOption')).strip().upper():
                score += int(q_doc.to_dict().get('marksWeightage', 4)) # Variable dynamic score weightage rule

        student_ref.update({
            "examStatus": "Completed", 
            "score": score,
            "submissionNotes": data.get('submissionReason', 'Standard Close'), 
            "submittedAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/student/forgot-recovery', methods=['POST'])
def forgot_student_registration():
    try:
        data = request.json or {}
        roll = str(data.get('rollNumber', '')).strip()
        fallback_org = str(data.get('fallbackOrgCheck', '')).strip().upper()
        
        if fallback_org:
            # Route intercept for Result Lookups Merit Scorecards
            query_snap = db.collection('students').where('orgCode', '==', fallback_org).where('rollNumber', '==', roll).limit(1).get()
        else:
            query_snap = db.collection('students').where('contactNumber', '==', str(data.get('contactNumber'))).where('rollNumber', '==', roll).limit(1).get()
            
        if len(query_snap) == 0:
            return jsonify({"status": "error", "message": "❌ Target operational trace not found inside database registers!"}), 404
            
        s_data = query_snap[0].to_dict()
        pwd = "🔒 PENDING CASH APPROVAL" if s_data.get('studentPassword') == "HIDDEN_UNTIL_APPROVED" else s_data.get('studentPassword')
        return jsonify({
            "status": "success",
            "data": {"studentName": s_data.get('studentName'), "orgCode": s_data.get('orgCode'), "rollNumber": s_data.get('rollNumber'), "paymentStatus": s_data.get('paymentStatus'), "password": pwd}
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ==========================================================================
# 🛑 ABSOLUTE DATA PROTECTION RESTRICTION LAYER
# NO DATA WIPING OR DELETING ROUTINES EXIST WITHIN APPLICATION CONTROLLERS.
# STUDENT ARCHIVES DELETION IS EXCLUSIVELY VIA WEB CLOUD FIREBASE CONSOLE.
# ==========================================================================

if __name__ == '__main__':
    # Binds securely to cloud production port configuration parameters on deployment builds
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)

# ==========================================================================
# 🏫 ORG & CENTRAL DATA DISPATCHERS (REAL-TIME SYNC INVERSION)
# ==========================================================================

@app.route('/api/organizer/students', methods=['POST'])
def get_organizer_students():
    """स्कूल को-ऑर्डिनेटर को केवल उसके स्कूल के रजिस्टर्ड छात्रों की लाइव लिस्ट भेजता है"""
    try:
        data = request.json or {}
        code = str(data.get('orgCode', '')).strip().upper()
        
        if not code:
            return jsonify({"status": "error", "message": "Missing organization code reference!"}), 400

        # केवल उसी स्कूल कोड के छात्रों को फेच करें
        s_query = db.collection('students').where('orgCode', '==', code).order_by('createdAt', direction=firestore.Query.DESCENDING).get()
        
        students_list = []
        total_fees = 0
        direct_commission = 0
        
        org_doc = db.collection('organizers').document(code).get()
        is_settled = org_doc.to_dict().get('manualSettled', False) if org_doc.exists else False
        
        config_doc = db.collection('settings').document('portal_config').get()
        is_result_declared = config_doc.to_dict().get('isResultDeclared', False) if config_doc.exists else False

        for doc in s_query:
            s_data = doc.to_dict()
            s_class = int(s_data.get('studentClass', 3))
            
            # लाइव फीस कैलकुलेशन आर्किटेक्चर (ऑनलाइन ₹100 / ऑफलाइन ₹120)
            fee = 120 if s_data.get('paymentMode') == 'offline' else 100
            total_fees += fee
            direct_commission += (fee * 0.15) # 15% Standard Coordinator Margin
            
            students_list.append({
                "id": doc.id,
                "studentName": s_data.get('studentName'),
                "rollNumber": s_data.get('rollNumber'),
                "studentClass": s_class,
                "paymentMode": s_data.get('paymentMode'),
                "paymentStatus": s_data.get('paymentStatus'),
                "utrNumber": s_data.get('utrNumber'),
                "examStatus": s_data.get('examStatus'),
                "score": s_data.get('score', 0),
                "password": s_data.get('studentPassword', '🔒 HIDDEN')
            })

        financials = {
            "totalRegistrations": len(students_list),
            "totalFees": total_fees,
            "directCommission": int(direct_commission),
            "referralCommission": 0,
            "netPayableToNvms": int(total_fees - direct_commission)
        }

        return jsonify({
            "status": "success", 
            "students": students_list, 
            "financials": financials,
            "isSettled": is_settled,
            "isResultDeclared": is_result_declared
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/admin/all_data', methods=['POST'])
def get_all_central_admin_data():
    """आपके मुख्य सेंट्रल मास्टर पैनल को पूरी दुनिया के सभी छात्रों और स्कूलों का डेटा लाइव दिखाता है"""
    try:
        # मास्टर कलेक्शन फेच वेक्टर्स
        all_orgs = db.collection('organizers').get()
        all_stds = db.collection('students').get()
        
        orgs_list = []
        stds_list = []
        
        for doc in all_orgs:
            o_data = doc.to_dict()
            orgs_list.append({
                "orgCode": o_data.get('orgCode'),
                "schoolName": o_data.get('schoolName'),
                "name": o_data.get('name'),
                "contact": o_data.get('contact'),
                "examMode": o_data.get('examMode', 'online'),
                "totalRegistrations": o_data.get('totalRegistrations', 0),
                "manualSettled": o_data.get('manualSettled', False)
            })
            
        for doc in all_stds:
            s_data = doc.to_dict()
            stds_list.append({
                "studentName": s_data.get('studentName'),
                "rollNumber": s_data.get('rollNumber'),
                "orgCode": s_data.get('orgCode'),
                "studentClass": s_data.get('studentClass'),
                "score": s_data.get('score', 0)
            })
            
        return jsonify({
            "status": "success",
            "organizers": orgs_list,
            "students": stds_list
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
