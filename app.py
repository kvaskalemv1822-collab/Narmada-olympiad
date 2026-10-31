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

# --- ADMIN AUTHENTICATION ROUTE (SECURE FIREBASE CHECK) ---
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_authenticate():
    try:
        data = request.json or {}
        password = str(data.get('password', '')).strip()
        
        config_doc = db.collection('settings').document('portal_config').get()
        stored_password = "admin123" # Default fallback
        if config_doc.exists:
            cfg_data = config_doc.to_dict()
            stored_password = str(cfg_data.get('adminPassword', 'admin123')).strip()
            
        if password == stored_password:
            return jsonify({"status": "success", "message": "Authenticated!"}), 200
        return jsonify({"status": "error", "message": "Invalid Password!"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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

# --- STUDENT HUB PIPELINE ---
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
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
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_num = str(data.get('rollNumber', '')).strip()
        
        if not org_code or not roll_num or not data.get('studentName'):
            return jsonify({"status": "error", "message": "Blank entries not allowed!"}), 400

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
            "paymentStatus": "Pending", "examStatus": "Not Started", "score": random.randint(40, 98),
            "createdAt": firestore.SERVER_TIMESTAMP
        })

        org_ref = db.collection('organizers').document(org_code)
        if org_ref.get().exists:
            org_ref.update({
                "totalRegistrations": firestore.Increment(1)
            })
        return jsonify({"status": "success", "message": "Registered!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- ORGANIZER PORTAL ENGINE ---
@app.route('/api/organizer/register', methods=['POST'])
def organizer_signup():
    try:
        data = request.json or {}
        raw_school = str(data.get('schoolName', '')).strip()
        formatted_school = ' '.join([w.capitalize() for w in raw_school.split()]) if raw_school else "Associated School"
        
        contact = str(data.get('contact', '')).strip()
        generated_code = f"ORG{random.randint(1000, 9999)}"
        db.collection('organizers').document(generated_code).set({
            "orgCode": generated_code, "code": generated_code, "name": data.get('name'),
            "schoolName": formatted_school, "contact": contact, "password": data.get('password'), "pin": data.get('pin'),
            "refCode": str(data.get('refCode', '')).strip().upper() if data.get('refCode') else None, "examMode": "online",
            "principalApproved": False, "manualSettled": False, "totalRegistrations": 0,
            "registeredAt": firestore.SERVER_TIMESTAMP
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
            "examMode": data.get('examMode', 'online'),
            "principalApproved": bool(data.get('principalApproved', False))
        })
        return jsonify({"status": "success", "message": "Database Profile Synced Safely!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/students', methods=['POST'])
def get_organizer_students():
    try:
        data = request.json or {}
        code = str(data.get('orgCode', '')).strip().upper()
        
        org_doc = db.collection('organizers').document(code).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        ref_code = org_data.get('refCode')
        is_manually_settled = org_data.get('manualSettled', False)
        
        docs = db.collection('students').where('orgCode', '==', code).get()
        students_list = []
        total_fees_collected = 0
        online_count = 0
        offline_count = 0
        
        config_doc = db.collection('settings').document('portal_config').get()
        portal_cfg = config_doc.to_dict() if config_doc.exists else {}
        online_fee = portal_cfg.get('onlineFee', 100)
        offline_fee = portal_cfg.get('offlineFee', 120)
        admin_upi = portal_cfg.get('upiId', 'narmada@upi')
        
        for d in docs:
            s = d.to_dict()
            s['id'] = d.id
            students_list.append(s)
            
            p_mode = s.get('paymentMode', 'online')
            if p_mode == 'offline':
                total_fees_collected += offline_fee
                offline_count += 1
            else:
                total_fees_collected += online_fee
                online_count += 1
        
        direct_commission = total_fees_collected * 0.15
        
        referral_commission = 0
        if ref_code:
            ref_docs = db.collection('students').where('orgCode', '==', ref_code).get()
            ref_total_fees = sum([offline_fee if st.to_dict().get('paymentMode') == 'offline' else online_fee for st in ref_docs])
            referral_commission = ref_total_fees * 0.05

        net_payable_to_nvms = total_fees_collected - direct_commission

        is_result_on = portal_cfg.get('isResultDeclared', False)
        if is_result_on:
            students_list.sort(key=lambda x: x.get('score', 0), reverse=True)
            for rank, s in enumerate(students_list, start=1):
                s['rank'] = rank
                s['percentage'] = f"{(s.get('score', 0) / 100) * 100:.1f}%"
                
        return jsonify({
            "status": "success",
            "students": students_list,
            "isResultDeclared": is_result_on,
            "isSettled": is_manually_settled,
            "adminUpiId": admin_upi,
            "financials": {
                "totalRegistrations": len(students_list),
                "onlineCount": online_count,
                "offlineCount": offline_count,
                "totalFees": total_fees_collected,
                "directCommission": round(direct_commission, 2),
                "referralCommission": round(referral_commission, 2),
                "netPayableToNvms": round(net_payable_to_nvms, 2)
            }
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/approve_payment', methods=['POST'])
def approve_student_payment():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        db.collection('students').document(student_id).update({"paymentStatus": "Approved"})
        return jsonify({"status": "success", "message": "Payment Status Verified Live!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/submit_settlement', methods=['POST'])
def submit_settlement():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        utr = str(data.get('utrNumber', '')).strip()
        amount = data.get('amount', 0)
        
        db.collection('settlement_requests').add({
            "orgCode": org_code,
            "utrNumber": utr,
            "amount": amount,
            "status": "Pending Verification",
            "submittedAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "message": "Settlement payment proof submitted!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/request_payout', methods=['POST'])
def request_commission_payout():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        upi_id = str(data.get('upiId', '')).strip()
        amount = data.get('amount', 0)
        
        if not org_code or not upi_id or amount <= 0:
            return jsonify({"status": "error", "message": "Invalid payout details!"}), 400
            
        org_doc = db.collection('organizers').document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            if not org_data.get('manualSettled', False):
                return jsonify({"status": "error", "message": "Settlement Blocked: Please pay net amount to NVMS first!"}), 400

        db.collection('payout_requests').add({
            "orgCode": org_code,
            "upiId": upi_id,
            "amount": amount,
            "status": "Pending",
            "requestedAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "message": "Payout request sent successfully!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- ADMIN COMMAND & FINANCIAL REQUESTS ROUTES ---
@app.route('/api/admin/all_data', methods=['POST'])
def get_admin_all_data():
    try:
        org_docs = db.collection('organizers').get()
        organizers = [o.to_dict() for o in org_docs]
        
        stud_docs = db.collection('students').get()
        students = []
        for d in stud_docs:
            s = d.to_dict()
            s['id'] = d.id
            students.append(s)
            
        return jsonify({"status": "success", "organizers": organizers, "students": students}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/reexam', methods=['POST'])
def admin_trigger_reexam():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        db.collection('students').document(student_id).update({
            "examStatus": "Not Started",
            "score": 0
        })
        return jsonify({"status": "success", "message": "Re-exam triggered!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/financial_requests', methods=['GET'])
def get_admin_financial_requests():
    try:
        settle_docs = db.collection('settlement_requests').where('status', '==', 'Pending Verification').get()
        settlements = []
        for d in settle_docs:
            item = d.to_dict()
            item['id'] = d.id
            settlements.append(item)
            
        payout_docs = db.collection('payout_requests').where('status', '==', 'Pending').get()
        payouts = []
        for d in payout_docs:
            item = d.to_dict()
            item['id'] = d.id
            payouts.append(item)
            
        return jsonify({"status": "success", "settlements": settlements, "payouts": payouts}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_settlement', methods=['POST'])
def approve_settlement_proof():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        req_id = data.get('requestId')
        
        db.collection('organizers').document(org_code).update({"manualSettled": True})
        db.collection('settlement_requests').document(req_id).update({"status": "Verified"})
        
        return jsonify({"status": "success", "message": "Settlement approved and payouts unlocked!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/complete_payout', methods=['POST'])
def complete_commission_payout():
    try:
        data = request.json or {}
        payout_id = data.get('payoutId')
        db.collection('payout_requests').document(payout_id).update({"status": "Completed"})
        return jsonify({"status": "success", "message": "Payout marked as completed!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
