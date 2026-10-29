import os
import random
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
# CORS connectivity taaki aapki alag-alag frontend websites securely data bhej sakein
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ----------------==========================================
# 🔑 FIREBASE SERVICE ACCOUNT SETUP
# ----------------==========================================
# Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key
# Ek .json file download hogi. Use is folder mein rakhein aur naam badal kar 'firebase-admin-key.json' kar dein.
cred = credentials.Certificate("firebase-admin-key.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# ==========================================================
# ⚙️ MULTI-MODULE API ENDPOINTS
# ==========================================================

# --- [1. GLOBAL SETTINGS & NOTICES] ---
@app.route('/api/portal/config', methods=['GET'])
def get_global_config():
    try:
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            # 🛡️ SECURITY TRICK: Client window par admin master password leak nahi hona chahiye
            if "adminPassword" in config:
                del config["adminPassword"]
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Configuration map missing!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- [2. STUDENT PORTAL OPERATIONS] ---
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json
        org_code = data.get('orgCode', '').strip().upper()
        
        org_doc = db.collection('organizers').document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            if not org_data.get('principalApproved', False):
                return jsonify({"status": "locked", "message": "School Code is temporarily locked. Principal approval pending!"}), 200
            
            return jsonify({
                "status": "success",
                "schoolName": org_data.get('schoolName', 'NVMSO Associated School'),
                "examMode": org_data.get('examMode', 'online')
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
            return jsonify({"status": "error", "message": "This Roll Number is already registered in your school!"}), 400

        student_ref.set({
            "orgCode": org_code,
            "studentName": data.get('studentName'),
            "motherName": data.get('motherName'),
            "fatherName": data.get('fatherName'),
            "studentClass": data.get('studentClass'),
            "rollNumber": roll_num,
            "stream": data.get('stream', ''),
            "contactNumber": data.get('contactNumber'),
            "paymentMode": data.get('paymentMode'),
            "utrNumber": data.get('utrNumber', ''),
            "paymentStatus": "Pending",  # Approved only via Organizer / Admin backend
            "examStatus": "Not Started",
            "score": 0,
            "createdAt": firestore.SERVER_TIMESTAMP
        })

        # 📈 AUTOMATIC REFERRAL & COMMISSION NETWORK MULTIPLIER
        org_ref = db.collection('organizers').document(org_code)
        if org_ref.get().exists:
            org_ref.update({
                "totalRegistrations": firestore.Increment(1),
                "pendingCommission": firestore.Increment(20)  # ₹20 incentive tracking per registration
            })

        return jsonify({"status": "success", "message": "Registration Data Captured Safely!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- [3. ORGANIZER DASHBOARD OPERATIONS] ---
@app.route('/api/organizer/register', methods=['POST'])
def organizer_signup():
    try:
        data = request.json
        contact = data.get('contact', '').strip()
        password = data.get('password', '').strip()
        pin = data.get('pin', '').strip()

        if len(contact) != 10 or len(pin) != 4:
            return jsonify({"status": "error", "message": "Invalid Contact Number or 4-Digit Secret PIN!"}), 400

        existing = db.collection('organizers').where('contact', '==', contact).get()
        if len(existing) > 0:
            return jsonify({"status": "error", "message": "This Mobile Number is already registered!"}), 400

        generated_code = f"ORG{random.randint(1000, 9999)}"
        
        db.collection('organizers').document(generated_code).set({
            "orgCode": generated_code,
            "code": generated_code,
            "name": data.get('name'),
            "schoolName": data.get('schoolName'),
            "contact": contact,
            "password": password,
            "pin": pin,
            "refCode": data.get('refCode') if data.get('refCode') else None,
            "examMode": "online",
            "principalApproved": False,
            "manualSettled": False,
            "totalRegistrations": 0,
            "pendingCommission": 0,
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
        
        return jsonify({"status": "error", "message": "Invalid Organizer Code or Password!"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- [4. CENTRAL COMMAND OPERATIONS] ---
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
        return jsonify({"status": "error", "message": "Security Alert: Access Denied!"}), 403
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/add-question', methods=['POST'])
def add_new_question():
    try:
        data = request.json
        db.collection('questions').add({
            "targetClass": data.get('classRange'),
            "subject": data.get('subject'),
            "qText": data.get('questionText'),
            "optA": data.get('optionA'),
            "optB": data.get('optionB'),
            "optC": data.get('optionC'),
            "optD": data.get('optionD'),
            "correctOpt": data.get('correctOption'),
            "createdAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "message": "Question saved to database safely!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
