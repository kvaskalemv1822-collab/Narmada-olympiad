import os
import json
import random
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)

# Full Access CORS Configuration
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ==========================================================================
# 🛡️ CLOUD FIREBASE DATABASE INITIALIZATION GRID
# ==========================================================================
db = None
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
            requests.post(GOOGLE_SHEET_WEBHOOK_URL, json={"type": payload_type, "data": data_body}, timeout=4)
        except Exception:
            pass 

def format_school_name(name_str):
    """Enforces strict Space-Separated Capital Letters Rule"""
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
        
        config_doc = db.collection('settings').document('portal_config').get()
        if not config_doc.exists:
            return jsonify({"status": "cyber_attack", "message": "🚨 Security Intercept: Config document missing in Firebase console!"}), 500
            
        stored_password = str(config_doc.to_dict().get('adminPassword', '')).strip()
        
        if not stored_password:
            return jsonify({"status": "cyber_attack", "message": "🚨 Security Warning: Password string null inside Cloud Console!"}), 403

        if password == stored_password:
            return jsonify({"status": "success", "message": "Master Node Auth Success!"}), 200
            
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
                del config["adminPassword"] # Strips master admin key
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Config mapping trace missing!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_master_portal_settings():
    try:
        data = request.json or {}
        db.collection('settings').document('portal_config').set({
            "onlineFee": int(data.get('onlineFee', 100)),
            "offlineFee": int(data.get('offlineFee', 120)),
            "examDuration": int(data.get('examDuration', 30)),
            "isRegistrationOpen": bool(data.get('isRegistrationOpen', True)),
            "isExamActive": bool(data.get('isExamActive', False)),
            "isResultDeclared": bool(data.get('isResultDeclared', False)),
            "broadcastNotice": str(data.get('broadcastNotice', '')).strip()
        }, merge=True)
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
        student_name = str(data.get('studentName', '')).strip()
        student_class = str(data.get('studentClass', '')).strip()
        payment_mode = str(data.get('paymentMode', 'online')).lower()
        utr_number = str(data.get('utrNumber', '')).strip()

        if not org_code or not roll_num or not student_name or not roll_num.isdigit():
            return jsonify({"status": "cyber_attack", "message": "Security Reject: Malformed payload data vectors!"}), 400

        # DOUBLE REGISTRATION BLOCKER
        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "cyber_attack", "message": "🚫 Submission Rejected: This Roll Number is already registered under this School Code!"}), 400

        if payment_mode == "online":
            if not utr_number or len(utr_number) != 12 or not utr_number.isdigit() or utr_number in ["123456789012", "000000000000", "999999999999"]:
                return jsonify({"status": "cyber_attack", "message": "🚫 Fraud Match Detected: Invalid Transaction UTR Number!"}), 400

        # SAVE STUDENT WITH BOTH `orgCode` AND `schoolCode` TO PREVENT PANEL FILTERING MISMATCH
        student_payload = {
            "studentId": student_id,
            "orgCode": org_code,
            "schoolCode": org_code,  # Sync both key variations for Admin/Organizer filters
            "rollNumber": roll_num,
            "studentName": student_name,
            "studentClass": student_class,
            "paymentMode": payment_mode,
            "utrNumber": utr_number,
            "paymentVerified": True if payment_mode == "offline" else False,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        
        # Save Student Document
        student_ref.set(student_payload)

        # LINK TO ORGANIZER DOCUMENT SO ORGANIZER DASHBOARD INSTANTLY READS IT
        org_ref = db.collection('organizers').document(org_code)
        if org_ref.get().exists:
            org_ref.update({
                "studentCount": firestore.Increment(1),
                "totalRegistered": firestore.Increment(1)
            })

        # BACKUP TO GOOGLE SHEETS
        backup_data_to_sheets("STUDENT_REGISTRATION", student_payload)

        return jsonify({"status": "success", "message": "Registration successful!", "studentId": student_id}), 200

    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
