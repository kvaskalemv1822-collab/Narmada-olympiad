import os
import json
import random
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 🛡️ SECURE ENVIRONMENT INITIALIZATION
try:
    if not firebase_admin._apps:
        firebase_key_json = os.environ.get('FIREBASE_CONFIG_JSON')
        if not firebase_key_json:
            raise ValueError("FIREBASE_CONFIG_JSON is missing in Render settings!")
        cred_dict = json.loads(firebase_key_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"❌ Init Error: {str(e)}")

# ==========================================================
# 🟢 1. SYSTEM CONFIG & MASTER TOGGLE SWITCHES
# ==========================================================
@app.route('/api/portal/config', methods=['GET'])
def get_global_config():
    try:
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            if "adminPassword" in config:
                del config["adminPassword"]
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Missing config!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_master_portal_settings():
    try:
        data = request.json
        config_ref = db.collection('settings').document('portal_config')
        
        config_ref.set({
            "onlineFee": int(data.get('onlineFee', 100)),
            "offlineFee": int(data.get('offlineFee', 120)),
            "examDuration": int(data.get('examDuration', 30)),
            "upiId": data.get('upiId', 'narmada@upi').strip(),
            "qrImageUrl": data.get('qrImageUrl', 'Qrcode.jpg').strip(),
            "isRegistrationOpen": bool(data.get('isRegistrationOpen', True)),
            "isExamActive": bool(data.get('isExamActive', False)),
            "isResultDeclared": bool(data.get('isResultDeclared', False)),
            "broadcastNotice": data.get('broadcastNotice', '').strip()
        }, merge=True)
        
        return jsonify({"status": "success", "message": "Master settings synced successfully!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================
# 🟢 2. ORGANIZER CONFIGURATION HANDLERS
# ==========================================================
@app.route('/api/organizer/update_settings', methods=['POST'])
def update_organizer_settings():
    try:
        data = request.json
        org_code = data.get('orgCode', '').strip().upper()
        
        org_ref = db.collection('organizers').document(org_code)
        if not org_ref.get().exists:
            return jsonify({"status": "error", "message": "Organizer code not found!"}), 404
            
        org_ref.update({
            "examMode": data.get('examMode', 'online'),
            "principalApproved": bool(data.get('principalApproved', False))
        })
        return jsonify({"status": "success", "message": "Organizer settings updated on server!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/register', methods=['POST'])
def organizer_signup():
    try:
        data = request.json
        contact = data.get('contact', '').strip()
        password = data.get('password', '').strip()
        pin = data.get('pin', '').strip()

        if len(contact) != 10 or len(pin) != 4:
            return jsonify({"status": "error", "message": "Invalid credentials!"}), 400

        existing = db.collection('organizers').where('contact', '==', contact).get()
        if len(existing) > 0:
            return jsonify({"status": "error", "message": "Mobile number already registered!"}), 400

        generated_code = f"ORG{random.randint(1000, 9999)}"
        db.collection('organizers').document(generated_code).set({
            "orgCode": generated_code, "code": generated_code, "name": data.get('name'),
            "schoolName": data.get('schoolName'), "contact": contact, "password": password, "pin": pin,
            "refCode": data.get('refCode') if data.get('refCode') else None, "examMode": "online",
            "principalApproved": False, "manualSettled": False, "totalRegistrations": 0, "pendingCommission": 0,
            "registeredAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "orgCode": generated_code}), 200
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
        return jsonify({"status": "error", "message": "Invalid credentials!"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================
# 🟢 3. SECURE STUDENT ACCOUNT ENTRY
# ==========================================================
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json
        org_code = data.get('orgCode', '').strip().upper()
        
        org_doc = db.collection('organizers').document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            if not org_data.get('principalApproved', False):
                return jsonify({"status": "locked", "message": "Principal permission required!"}), 200
            return jsonify({
                "status": "success",
                "schoolName": org_data.get('schoolName'),
                "examMode": org_data.get('examMode', 'online')
            }), 200
        return jsonify({"status": "invalid"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/register', methods=['POST'])
def secure_registration():
    try:
        data = request.json
        org_code = data.get('orgCode', '').strip().upper()
        roll_num = data.get('rollNumber', '').strip()

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "error", "message": "Roll Number already registered!"}), 400

        student_ref.set({
            "orgCode": org_code, "studentName": data.get('studentName'),
            "motherName": data.get('motherName'), "fatherName": data.get('fatherName'),
            "studentClass": data.get('studentClass'), "rollNumber": roll_num,
            "stream": data.get('stream', ''), "contactNumber": data.get('contactNumber'),
            "paymentMode": data.get('paymentMode'), "utrNumber": data.get('utrNumber', ''),
            "paymentStatus": "Pending", "examStatus": "Not Started", "score": 0,
            "createdAt": firestore.SERVER_TIMESTAMP
        })

        org_ref = db.collection('organizers').document(org_code)
        if org_ref.get().exists:
            org_ref.update({
                "totalRegistrations": firestore.Increment(1),
                "pendingCommission": firestore.Increment(20)
            })
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
            return jsonify({"status": "success"}), 200
        return jsonify({"status": "error"}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
