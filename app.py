import os
import json
import random
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# FIREBASE CONFIGURATION LAYER
try:
    if not firebase_admin._apps:
        firebase_key_json = os.environ.get('FIREBASE_CONFIG_JSON')
        if not firebase_key_json:
            raise ValueError("CRITICAL CYBER THREAT: FIREBASE_CONFIG_JSON missing!")
        cred_dict = json.loads(firebase_key_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"❌ Core Error: {str(e)}")

GOOGLE_SHEET_WEBHOOK_URL = os.environ.get('GOOGLE_SHEETS_WEBHOOK_URL', '')

def backup_data_to_sheets(payload_type, data_body):
    if GOOGLE_SHEET_WEBHOOK_URL:
        try:
            requests.post(GOOGLE_SHEET_WEBHOOK_URL, json={"type": payload_type, "data": data_body}, timeout=5)
        except: pass

def format_school_name(name_str):
    if not name_str: return "NVMSO Associated School"
    return ' '.join([w.capitalize() for w in name_str.split()])

# --- 1. FIREBASE CONSOLE-ONLY ADMIN AUTHENTICATION ---
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_authenticate():
    try:
        data = request.json or {}
        password = str(data.get('password', '')).strip()
        config_doc = db.collection('settings').document('portal_config').get()
        if not config_doc.exists:
            return jsonify({"status": "cyber_attack", "message": "Configuration document missing in console!"}), 500
        
        stored_password = str(config_doc.to_dict().get('adminPassword', '')).strip()
        if password == stored_password and stored_password != "":
            return jsonify({"status": "success", "message": "Authenticated!"}), 200
        return jsonify({"status": "cyber_attack", "message": "🚨 SECURITY THREAT: Invalid Master Password!"}), 401
    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

# --- 2. GLOBAL PORTAL LIFECYCLE PARAMETERS ---
@app.route('/api/portal/config', methods=['GET'])
def get_global_config():
    try:
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            if "adminPassword" in config: del config["adminPassword"]
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Config missing!"}), 404
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

# --- 3. STUDENT REGISTRATION & ANTI-FRAUD ENGINE ---
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        org_doc = db.collection('organizers').document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            if not org_data.get('principalApproved', False):
                return jsonify({"status": "locked", "message": "Registration Locked! School NOC Permission is pending."}), 200
            
            config_doc = db.collection('settings').document('portal_config').get()
            g_cfg = config_doc.to_dict() if config_doc.exists else {}
            fee = g_cfg.get('offlineFee', 120) if org_data.get('examMode') == 'offline' else g_cfg.get('onlineFee', 100)
            
            return jsonify({
                "status": "success", "schoolName": org_data.get('schoolName'),
                "examMode": org_data.get('examMode', 'online'), "applicableFee": fee
            }), 200
        return jsonify({"status": "invalid", "message": "Organizer Code Not Found!"}), 200
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
            return jsonify({"status": "cyber_attack", "message": "Security Violation: Malformed inputs!"}), 400

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "cyber_attack", "message": "🚫 Duplicate Blocked: Roll Number already registered under this School!"}), 400

        if payment_mode == "online":
            if not utr_number or len(utr_number) != 12 or not utr_number.isdigit() or utr_number in ["123456789012", "000000000000"]:
                return jsonify({"status": "cyber_attack", "message": "🚫 Fraud Match: Input Transaction UTR is Fake!"}), 400
            
            dup_utr = db.collection('students').where('utrNumber', '==', utr_number).limit(1).get()
            if len(dup_utr) > 0:
                return jsonify({"status": "cyber_attack", "message": "🚫 Single-Use Breach: UTR already utilized!"}), 400
            
            initial_status = "Approved"
            generated_password = str(random.randint(100000, 999999))
        else:
            initial_status = "Pending Coordinator Verification"
            generated_password = "HIDDEN_UNTIL_APPROVED"
            utr_number = f"CASH_{org_code}_{roll_num}"

        student_data = {
            "orgCode": org_code, "studentName": str(data.get('studentName')).strip(),
            "motherName": data.get('motherName'), "fatherName": data.get('fatherName'),
            "studentClass": data.get('studentClass'), "rollNumber": roll_num,
            "stream": data.get('stream', ''), "contactNumber": data.get('contactNumber'),
            "paymentMode": payment_mode, "utrNumber": utr_number,
            "paymentStatus": initial_status, "examStatus": "Not Started", 
            "studentPassword": generated_password, "score": 0, "createdAt": firestore.SERVER_TIMESTAMP
        }
        
        student_ref.set(student_data)
        db.collection('organizers').document(org_code).update({"totalRegistrations": firestore.Increment(1)})
        backup_data_to_sheets("STUDENT_REGISTRATION", student_data)

        return jsonify({"status": "success", "message": "Registration Saved!", "paymentStatus": initial_status}), 200
    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

# --- 4. ORGANIZER LIFE-CYCLE SYSTEM WITH 6-DIGIT PIN ---
@app.route('/api/organizer/register', methods=['POST'])
def organizer_signup():
    try:
        data = request.json or {}
        pin = str(data.get('pin', '')).strip()
        if len(pin) != 6 or not pin.isdigit():
            return jsonify({"status": "error", "message": "Organiser PIN must be exactly 6 digits long!"}), 400
            
        generated_code = f"ORG{random.randint(1000, 9999)}"
        db.collection('organizers').document(generated_code).set({
            "orgCode": generated_code, "code": generated_code, "name": data.get('name'),
            "schoolName": format_school_name(data.get('schoolName')), "contact": data.get('contact'),
            "password": data.get('password'), "pin": pin, "examMode": "online",
            "principalApproved": False, "manualSettled": False, "totalRegistrations": 0, "registeredAt": firestore.SERVER_TIMESTAMP
        })
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
            "examMode": data.get('examMode', 'online'), "principalApproved": bool(data.get('principalApproved', False))
        })
        return jsonify({"status": "success", "message": "Profile Synced!"}), 200
    except Exception as e:
