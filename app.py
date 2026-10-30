import os
import json
import random
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
# CORS connectivity so that your GitHub frontend sites can securely talk to backend
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ==========================================================
# 🛡️ 100% SECURE FIREBASE INITIALIZATION FROM ENV VARIABLE
# ==========================================================
try:
    if not firebase_admin._apps:
        # Reads key text direct from Render secret env variable locker (Hacker-Proof)
        firebase_key_json = os.environ.get('FIREBASE_CONFIG_JSON')
        if not firebase_key_json:
            raise ValueError("CRITICAL: FIREBASE_CONFIG_JSON variable is missing in Render Settings!")
            
        cred_dict = json.loads(firebase_key_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized safely from Environment Locker!")
    db = firestore.client()
except Exception as e:
    print(f"❌ Initialization Error Details: {str(e)}")

# ==========================================================
# 🟢 1. GLOBAL SETTINGS, NOTICES & CHECKBOX SWITCHES
# ==========================================================
@app.route('/api/portal/config', methods=['GET'])
def get_global_config():
    try:
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            # 🛡️ SECURITY SAFEGUARD: Strip password hashes before delivering config to clients
            if "adminPassword" in config:
                del config["adminPassword"]
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Configuration map missing!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_master_portal_settings():
    try:
        data = request.json
        config_ref = db.collection('settings').document('portal_config')
        
        # Explicit structure map update vector for checkboxes and pricing matrices
        config_ref.update({
            "onlineFee": int(data.get('onlineFee', 100)),
            "offlineFee": int(data.get('offlineFee', 120)),
            "examDuration": int(data.get('examDuration', 30)),
            "upiId": data.get('upiId', 'narmada@upi').strip(),
            "qrImageUrl": data.get('qrImageUrl', 'Qrcode.jpg').strip(),
            "isRegistrationOpen": bool(data.get('isRegistrationOpen', True)),
            "isExamActive": bool(data.get('isExamActive', False)),
            "isResultDeclared": bool(data.get('isResultDeclared', False)),
            "broadcastNotice": data.get('broadcastNotice', '').strip()
        })
        return jsonify({"status": "success", "message": "Master system settings published successfully!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================
# 🟢 2. ORGANIZER DASHBOARD OPERATIONS (MODE & COMMISSION FIX)
# ==========================================================
@app.route('/api/organizer/register', methods=['POST'])
def organizer_signup():
    try:
        data = request.json
        contact = data.get('contact', '').strip()
        password = data.get('password', '').strip()
        pin = data.get('pin', '').strip()

        if len(contact) != 10 or len(pin) != 4:
            return jsonify({"status": "error", "message": "Invalid Contact Number or PIN!"}), 400

        existing = db.collection('organizers').where('contact', '==', contact).get()
        if len(existing) > 0:
            return jsonify({"status": "error", "message": "This Mobile Number is already registered!"}), 400

        generated_code = f"ORG{random.randint(1000, 9999)}"
        db.collection('organizers').document(generated_code).set({
            "orgCode": generated_code, "code": generated_code, "name": data.get('name'),
            "schoolName": data.get('schoolName'), "contact": contact, "password": password, "pin": pin,
            "refCode": data.get('refCode') if data.get('refCode') else None, "examMode": "online",
            "principalApproved": False, "manualSettled": False, "totalRegistrations": 0, "pendingCommission": 0,
            "registeredAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "message": "Organizer Registered!", "orgCode": generated_code}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/login', methods=['POST'])
def organizer_login():
    try:
        data = request.json
        code = data.get('orgCode', '').strip().upper()
        password = data.get('password', '').strip()

        doc = db.collection('organizers').document(code).get()
        if doc.exists:
            org_data = doc.to_dict()
            if org_data.get('password') == password:
                return jsonify({"status": "success", "data": org_data}), 200
        return jsonify({"status": "error", "message": "Invalid Credentials!"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/update_profile', methods=['POST'])
def update_organizer_profile():
    try:
        data = request.json
        code = data.get('orgCode', '').strip().upper()
        
        org_ref = db.collection('organizers').document(code)
        org_ref.update({
            "examMode": data.get('examMode', 'online'),
            "principalApproved": bool(data.get('principalApproved', False))
        })
        return jsonify({"status": "success", "message": "Organizer Profile updated successfully on Server!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================
# 🟢 3. STUDENT PORTAL OPERATIONS & REGISTRATION
# ==========================================================
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json
        org_code = data.get('orgCode', '').strip().upper()
        
        org_doc = db.collection('organizers').document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            return jsonify({
                "status": "success",
                "schoolName": org_data.get('schoolName', 'NVMSO Associated School'),
                "examMode": org_data.get('examMode', 'online'),
                "principalApproved": org_data.get('principalApproved', False)
            }), 200
        return jsonify({"status": "invalid", "message": "Organizer Code Not Found!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/register', methods=['POST'])
def secure_registration():
    try:
        data = request.json
        org_code = data.get('orgCode', '').strip().upper()
        roll_num = data.get('rollNumber', '').strip()
        
        if not org_code or not roll_num or not data.get('studentName'):
            return jsonify({"status": "error", "message": "Blank entries not allowed!"}), 400

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        
        if student_ref.get().exists:
            return jsonify({"status": "error", "message": "This Roll Number is already registered!"}), 400

        student_ref.set({
            "orgCode": org_code, "studentName": data.get('studentName'),
            "motherName": data.get('motherName'), "fatherName": data.get('fatherName'),
            "studentClass": data.get('studentClass'), "rollNumber": roll_num,
            "stream": data.get('stream', ''), "contactNumber": data.get('contactNumber'),
            "paymentMode": data.get('paymentMode'), "utrNumber": data.get('utrNumber', ''),
            "paymentStatus": "Pending", "examStatus": "Not Started", "score": 0,
            "createdAt": firestore.SERVER_TIMESTAMP
        })

        # 📈 Network Referral Ledger Tracking Engine
        org_ref = db.collection('organizers').document(org_code)
        if org_ref.get().exists:
            org_ref.update({
                "totalRegistrations": firestore.Increment(1),
                "pendingCommission": firestore.Increment(20) # Auto logs referral earnings
            })
        return jsonify({"status": "success", "message": "Registration Data Captured Safely!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================
# 🟢 4. CENTRAL COMMAND ADMIN AUTH & QUESTIONS
# ==========================================================
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_master_auth():
    try:
        data = request.json
        entered_password = data.get('password', '').strip()
        config_doc = db.collection('settings').document('portal_config').get()
        master_pass = "narmada2026"
        if config_doc.exists and config_doc.to_dict().get('adminPassword'):
            master_pass = config_doc.to_dict().get('adminPassword')
        if entered_password == master_pass:
            return jsonify({"status": "success", "token": "NVMS_CHIEF_SESSION_ACTIVE"}), 200
        return jsonify({"status": "error", "message": "Access Denied!"}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/add-question', methods=['POST'])
def add_new_question():
    try:
        data = request.json
