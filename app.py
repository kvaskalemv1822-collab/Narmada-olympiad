import os
import json
import random
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 🛡️ FIREBASE INITIALIZATION FROM ENV VARIABLE LOADER
try:
    if not firebase_admin._apps:
        firebase_key_json = os.environ.get('FIREBASE_CONFIG_JSON')
        if not firebase_key_json:
            raise ValueError("CRITICAL: FIREBASE_CONFIG_JSON is missing in Render settings!")
        cred_dict = json.loads(firebase_key_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"❌ Initialization Error: {str(e)}")

# --- GLOBAL CONFIG METRICS ---
@app.route('/api/portal/config', methods=['GET'])
def get_global_config():
    try:
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            if "adminPassword" in config:
                del config["adminPassword"]
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Config missing!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_master_portal_settings():
    try:
        data = request.json
        db.collection('settings').document('portal_config').update({
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
        return jsonify({"status": "success", "message": "Master parameters synced!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- STUDENT HUB PIPELINE ---
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json
        org_code = data.get('orgCode', '').strip().upper()
        org_doc = db.collection('organizers').document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            return jsonify({
                "status": "success", "schoolName": org_data.get('schoolName', 'NVMSO Associated School'),
                "examMode": org_data.get('examMode', 'online'), "principalApproved": org_data.get('principalApproved', False)
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
            return jsonify({"status": "error", "message": "Roll Number already registered!"}), 400

        # Random dynamic score assignment mock for test validation metrics
        student_ref.set({
            "orgCode": org_code, "studentName": data.get('studentName'),
            "motherName": data.get('motherName'), "fatherName": data.get('fatherName'),
            "studentClass": data.get('studentClass'), "rollNumber": roll_num,
            "stream": data.get('stream', ''), "contactNumber": data.get('contactNumber'),
            "paymentMode": data.get('paymentMode'), "utrNumber": data.get('utrNumber', ''),
            "paymentStatus": "Pending", "examStatus": "Not Started", "score": random.randint(40, 98), # Sample marks tracker
            "createdAt": firestore.SERVER_TIMESTAMP
        })

        org_ref = db.collection('organizers').document(org_code)
        if org_ref.get().exists:
            org_ref.update({
                "totalRegistrations": firestore.Increment(1),
                "pendingCommission": firestore.Increment(20)
            })
        return jsonify({"status": "success", "message": "Registered!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- ORGANIZER PORTAL ENGINE WITH FIXED PROFILE UPDATE MAPPINGS ---
@app.route('/api/organizer/register', methods=['POST'])
def organizer_signup():
    try:
        data = request.json
        contact = data.get('contact', '').strip()
        generated_code = f"ORG{random.randint(1000, 9999)}"
        db.collection('organizers').document(generated_code).set({
            "orgCode": generated_code, "code": generated_code, "name": data.get('name'),
            "schoolName": data.get('schoolName'), "contact": contact, "password": data.get('password'), "pin": data.get('pin'),
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
        doc = db.collection('organizers').document(code).get()
        if doc.exists and doc.to_dict().get('password') == data.get('password'):
            return jsonify({"status": "success", "data": doc.to_dict()}), 200
        return jsonify({"status": "error", "message": "Invalid credentials!"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# 🎯 NETWORK ERROR SOLUTIONS FIX MAPPING: Route completely matched to Javascript fetch signatures
@app.route('/api/organizer/update_profile', methods=['POST'])
def update_organizer_profile():
    try:
        data = request.json
        code = data.get('orgCode', '').strip().upper()
        db.collection('organizers').document(code).update({
            "examMode": data.get('examMode', 'online'),
            "principalApproved": bool(data.get('principalApproved', False))
        })
        return jsonify({"status": "success", "message": "Database Profile Synced Safely!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/students', methods=['POST'])
def get_organizer_students():
    try:
        data = request.json
        code = data.get('orgCode', '').strip().upper()
        docs = db.collection('students').where('orgCode', '==', code).get()
        students_list = []
        for d in docs:
            s = d.to_dict()
            s['id'] = d.id
            students_list.append(s)
        
        # 🎯 AUTOMATIC RESULT RANKING ENGINE MATRIX
        config_doc = db.collection('settings').document('portal_config').get()
        is_result_on = config_doc.exists and config_doc.to_dict().get('isResultDeclared', False)
        
        if is_result_on:
            # Sorts student records by marks score vector dynamically in descending order
            students_list.sort(key=lambda x: x.get('score', 0), reverse=True)
            for rank, s in enumerate(students_list, start=1):
                s['rank'] = rank
                # Mock percentage calculator out of maximum 100 marks vector framework
                s['percentage'] = f"{(s.get('score', 0) / 100) * 100:.1f}%"
                
        return jsonify({"status": "success", "students": students_list, "isResultDeclared": is_result_on}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/approve_payment', methods=['POST'])
def approve_student_payment():
    try:
        data = request.json
        student_id = data.get('studentId')
        db.collection('students').document(student_id).update({"paymentStatus": "Approved"})
        return jsonify({"status": "success", "message": "Payment Status Verified Live!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- QUESTION ENDPOINT ---
@app.route('/api/admin/add-question', methods=['POST'])
def add_new_question():
    try:
        data = request.json
        db.collection('questions').add({
            "targetClass": data.get('classRange'), "subject": data.get('subject'), "qText": data.get('questionText'),
            "optA": data.get('optionA'), "optB": data.get('optionB'), "optC": data.get('optionC'), "optD": data.get('optionD'),
            "correctOpt": data.get('correctOption'), "createdAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
