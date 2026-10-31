import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)

# Complete CORS freedom so Frontend panels can seamlessly communicate with Backend
CORS(app, origins="*")

# ==========================================================================
# 🛡️ CLOUD FIREBASE DATABASE INITIALIZATION
# ==========================================================================
db = None
try:
    if not firebase_admin._apps:
        firebase_key_json = os.environ.get('FIREBASE_CONFIG_JSON')
        if not firebase_key_json:
            raise ValueError("Firebase configuration credentials environment variable missing!")
        
        cred_dict = json.loads(firebase_key_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"❌ Firebase initialization failure: {str(e)}")

GOOGLE_SHEET_WEBHOOK_URL = os.environ.get('GOOGLE_SHEETS_WEBHOOK_URL', '')

def backup_data_to_sheets(payload_type, data_body):
    """Dispatches long-term archival data entries to external sheet storage."""
    if GOOGLE_SHEET_WEBHOOK_URL:
        try:
            requests.post(GOOGLE_SHEET_WEBHOOK_URL, json={"type": payload_type, "data": data_body}, timeout=4)
        except Exception:
            pass 

def format_school_name(name_str):
    """Enforces Space-Separated Capital Letters rule formatting."""
    if not name_str: 
        return "NVMSO Associated School"
    return ' '.join([word.capitalize() for word in name_str.split()])

# ==========================================================================
# 1. ADMIN AUTHENTICATION ENGINE
# ==========================================================================
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_authenticate():
    try:
        data = request.json or {}
        password = str(data.get('password', '')).strip()
        
        config_doc = db.collection('settings').document('portal_config').get()
        if not config_doc.exists:
            return jsonify({"status": "error", "message": "Portal configuration document missing."}), 500
            
        stored_password = str(config_doc.to_dict().get('adminPassword', '')).strip()
        if not stored_password:
            return jsonify({"status": "error", "message": "Null credentials detected within Cloud console."}), 403

        if password == stored_password:
            return jsonify({"status": "success", "message": "Master Node authentication successful."}), 200
            
        return jsonify({"status": "unauthorized", "message": "Security Reject: Administrator password mismatch."}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
                del config["adminPassword"] 
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Global structural parameters mapping not found."}), 404
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
        return jsonify({"status": "success", "message": "Master engine metrics systematically updated."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================================
# 3. STUDENT REGISTRATION PIPELINE
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
                    "message": "Registration Locked! School Coordinator has not confirmed Principal Permission NOC."
                }), 200
                
            config_doc = db.collection('settings').document('portal_config').get()
            g_cfg = config_doc.to_dict() if config_doc.exists else {}
            fee = g_cfg.get('offlineFee', 120) if org_data.get('examMode') == 'offline' else g_cfg.get('onlineFee', 100)
            
            return jsonify({
                "status": "success", 
                "schoolName": format_school_name(org_data.get('schoolName')),
                "examMode": org_data.get('examMode', 'online'), 
                "applicableFee": fee
            }), 200
        return jsonify({"status": "invalid", "message": "Organizer School Code Not Found."}), 200
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
            return jsonify({"status": "error", "message": "Malformed payload structure or properties missing."}), 400

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "duplicate", "message": "🚫 Submission Rejected: This Roll Number is already registered under this School Code."}), 400

        if payment_mode == "online":
            if not utr_number or len(utr_number) != 12 or not utr_number.isdigit() or utr_number in ["123456789012", "000000000000", "999999999999"]:
                return jsonify({"status": "fraud_blocked", "message": "🚫 Fraud Match Detected: Invalid Transaction UTR entry pattern."}), 400

        student_data = {
            "studentId": student_id,
            "orgCode": org_code,
            "rollNumber": roll_num,
            "studentName": str(data.get('studentName')).strip(),
            "studentClass": str(data.get('studentClass', '')).strip(),
            "paymentMode": payment_mode,
            "utrNumber": utr_number if payment_mode == "online" else "N/A",
            "status": "pending" if payment_mode == "online" else "verified",
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        
        student_ref.set(student_data)
        backup_data_to_sheets("student_registration", student_data)
        
        return jsonify({"status": "success", "message": "Student registration complete.", "studentId": student_id}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================================
# 4. FIX: DATA RETRIEVAL ROUTES FOR ORGANIZER & ADMIN PANELS
# ==========================================================================
@app.route('/api/organizer/students', methods=['POST'])
def get_organizer_students():
    """Fetches all registered students belonging strictly to a specific Organizer's school code."""
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        if not org_code:
            return jsonify({"status": "error", "message": "Organizer Code is required."}), 400
            
        docs = db.collection('students').where('orgCode', '==', org_code).stream()
        students_list = [doc.to_dict() for doc in docs]
        
        # Safe parsing of timestamps for JSON encoding compatibility
        for s in students_list:
            if 'timestamp' in s and s['timestamp']:
                s['timestamp'] = str(s['timestamp'])
                
        return jsonify({"status": "success", "students": students_list}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/students', methods=['GET'])
def get_all_students_for_admin():
    """Master node query engine to fetch every registered student across the portal."""
    try:
        docs = db.collection('students').stream()
        all_students = [doc.to_dict() for doc in docs]
        
        for s in all_students:
            if 'timestamp' in s and s['timestamp']:
                s['timestamp'] = str(s['timestamp'])
                
