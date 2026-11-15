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

GOOGLE_SHEET_WEBHOOK_URL = os.environ.get('GOOGLE_SHEETS_WEBHOOK_URL', '')

def backup_data_to_sheets(payload_type, data_body):
    if GOOGLE_SHEET_WEBHOOK_URL:
        try:
            requests.post(GOOGLE_SHEET_WEBHOOK_URL, json={"type": payload_type, "data": data_body}, timeout=4)
        except Exception:
            pass 

def format_school_name(name_str):
    if not name_str: 
        return "NVMSO Associated School"
    return ' '.join([word.capitalize() for word in name_str.split()])

# ==========================================
# 1. ADMIN AUTHENTICATION
# ==========================================
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_authenticate():
    try:
        data = request.json or {}
        password = str(data.get('password', '')).strip()
        config_doc = db.collection('settings').document('portal_config').get()
        if not config_doc.exists:
            return jsonify({"status": "cyber_attack", "message": "🚨 Config document missing!"}), 500
        stored_password = str(config_doc.to_dict().get('adminPassword', '')).strip()
        if password == stored_password:
            return jsonify({"status": "success", "message": "Master Node Auth Success!"}), 200
        return jsonify({"status": "cyber_attack", "message": "🚨 Admin Password Rejected!"}), 401
    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

# ==========================================
# 2. GLOBAL CONFIG
# ==========================================
@app.route('/api/portal/config', methods=['GET'])
def get_global_config():
    try:
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists:
            config = config_doc.to_dict()
            if "adminPassword" in config: del config["adminPassword"]
            return jsonify({"status": "success", "config": config}), 200
        return jsonify({"status": "error", "message": "Config mapping trace missing!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_master_portal_settings():
    try:
        data = request.json or {}
        update_payload = {}
        if 'onlineFee' in data: update_payload['onlineFee'] = int(data.get('onlineFee'))
        if 'offlineFee' in data: update_payload['offlineFee'] = int(data.get('offlineFee'))
        if 'isRegistrationOpen' in data: update_payload['isRegistrationOpen'] = bool(data.get('isRegistrationOpen'))
        if 'isExamActive' in data: update_payload['isExamActive'] = bool(data.get('isExamActive'))
        if 'isResultDeclared' in data: update_payload['isResultDeclared'] = bool(data.get('isResultDeclared'))
        if 'broadcastNotice' in data: update_payload['broadcastNotice'] = str(data.get('broadcastNotice', '')).strip()
        db.collection('settings').document('portal_config').set(update_payload, merge=True)
        return jsonify({"status": "success", "message": "Master parameters synced!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 3. STUDENT REGISTRATION & SINGLE-USE UTR
# ==========================================
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school_code():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        org_doc = db.collection('organizers').document(org_code).get()
        if org_doc.exists:
            org_data = org_doc.to_dict()
            if not org_data.get('principalApproved', False):
                return jsonify({"status": "locked", "message": "Registration Locked! Principal Permission NOC pending."}), 200
            config_doc = db.collection('settings').document('portal_config').get()
            g_cfg = config_doc.to_dict() if config_doc.exists else {}
            fee = g_cfg.get('offlineFee', 120) if org_data.get('examMode') == 'offline' else g_cfg.get('onlineFee', 100)
            return jsonify({"status": "success", "schoolName": org_data.get('schoolName'), "examMode": org_data.get('examMode', 'online'), "applicableFee": fee}), 200
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
            return jsonify({"status": "cyber_attack", "message": "Security Reject: Malformed payload!"}), 400

        # SINGLE-USE UTR CHECK
        if utr_number and utr_number != "NOT_PROVIDED":
            existing_utr = db.collection('students').where('utrNumber', '==', utr_number).limit(1).get()
            if len(list(existing_utr)) > 0:
                return jsonify({"status": "cyber_attack", "message": "🚫 Security Error: This UTR Transaction Number has already been used by another candidate!"}), 400

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "cyber_attack", "message": "🚫 Roll Number already registered under this school!"}), 400

        initial_status = "Approved" if payment_mode == "online" else "Pending Organizer Approval"
        student_payload = {
            "studentId": student_id,
            "orgCode": org_code,
            "schoolCode": org_code,
            "rollNumber": roll_num,
            "studentName": student_name,
            "motherName": str(data.get('motherName', '')).strip(),
            "fatherName": str(data.get('fatherName', '')).strip(),
            "studentClass": student_class,
            "stream": str(data.get('stream', '')).strip(),
            "contactNumber": str(data.get('contactNumber', '')).strip(),
            "paymentMode": payment_mode,
            "utrNumber": utr_number or "NOT_PROVIDED",
            "paymentStatus": initial_status,
            "paymentVerified": True if payment_mode == "online" else False,
            "examCompleted": False,
            "score": 0,
            "percentage": 0,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        student_ref.set(student_payload)
        backup_data_to_sheets("STUDENT_REGISTRATION", student_payload)
        return jsonify({"status": "success", "message": "Registration successful!", "studentId": student_id}), 200
    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

# ==========================================
# 4. EXAM LOGIN & SUBMISSION (FEE GATE)
# ==========================================
@app.route('/api/student/login', methods=['POST'])
def student_login():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_number = str(data.get('rollNumber', '')).strip()
        input_password = str(data.get('password', '')).strip()

        student_id = f"{org_code}_{roll_number}"
        student_doc = db.collection('students').document(student_id).get()
        if not student_doc.exists:
            return jsonify({"status": "error", "message": "Student record not found. Check School Code & Roll No."}), 404

        s_data = student_doc.to_dict()

        # STRICT FEE APPROVAL GATE
        is_paid = s_data.get('paymentStatus') == 'Approved' or s_data.get('paymentVerified') is True
        if not is_paid:
            return jsonify({"status": "error", "message": "🔒 Exam Locked! Your fee/registration is pending verification by School Organizer or Admin."}), 403

        # SINGLE-ATTEMPT LOCK
        if s_data.get('examCompleted', False):
            return jsonify({"status": "error", "message": "⚠️ You have already submitted your exam! Multiple attempts are strictly prohibited."}), 403

        mother_name = s_data.get('motherName', '').strip()
        expected_password = (mother_name[:2].upper() + roll_number) if len(mother_name) >= 2 else roll_number
        if input_password != expected_password:
            return jsonify({"status": "error", "message": "Invalid password! Format is Mother's first 2 capital letters + Roll No."}), 401

        org_doc = db.collection('organizers').document(org_code).get()
        s_data['schoolName'] = org_doc.to_dict().get('schoolName', org_code) if org_doc.exists else org_code
        s_data['id'] = student_doc.id
        return jsonify({"status": "success", "student": s_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/questions', methods=['GET'])
def student_get_questions():
    try:
        questions_ref = db.collection('questions').stream()
        questions = [{**doc.to_dict(), "id": doc.id} for doc in questions_ref]
        return jsonify({"status": "success", "questions": questions}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/submit_exam', methods=['POST'])
def student_submit_exam():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        answers = data.get('answers', {})
        student_ref = db.collection('students').document(student_id)
        doc = student_ref.get()
        if not doc.exists:
            return jsonify({"status": "error", "message": "Student not found"}), 404

        s_data = doc.to_dict()
        if s_data.get('examCompleted', False):
            return jsonify({"status": "error", "message": "Exam already submitted earlier!"}), 400

        questions_ref = db.collection('questions').stream()
        questions_map = {q.id: q.to_dict() for q in questions_ref}
        total_marks = len(questions_map) * 1  
        obtained_score = 0.0

        for q_id, selected_opt in answers.items():
            if q_id in questions_map:
                correct_opt = questions_map[q_id].get('correctOption', '').strip().upper()
                neg_marking = float(questions_map[q_id].get('negativeMarking', 0))
                if selected_opt and selected_opt.strip().upper() == correct_opt:
                    obtained_score += 1.0
                elif selected_opt and selected_opt.strip().upper() != correct_opt:
                    obtained_score -= neg_marking

        final_score = max(0.0, obtained_score)
        percentage = round((final_score / max(1, total_marks)) * 100, 2)

        student_ref.update({
            "examCompleted": True,
            "score": final_score,
            "totalMarks": total_marks,
            "percentage": percentage,
            "submittedAnswers": answers
        })
        return jsonify({"status": "success", "score": final_score, "total": total_marks, "percentage": percentage}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/result', methods=['POST'])
def student_get_result():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_number = str(data.get('rollNumber', '')).strip()
        config_doc = db.collection('settings').document('portal_config').get()
        g_cfg = config_doc.to_dict() if config_doc.exists else {}

        # RESULT DECLARATION GATE (NEET Style)
        if not g_cfg.get('isResultDeclared', False):
            return jsonify({"status": "error", "message": "🏆 Results have not been officially declared by NVMS Central Command yet!"}), 403

        student_id = f"{org_code}_{roll_number}"
        student_doc = db.collection('students').document(student_id).get()
        if not student_doc.exists:
            return jsonify({"status": "error", "message": "Student record not found."}), 404

        s_data = student_doc.to_dict()
        org_doc = db.collection('organizers').document(org_code).get()
        s_data['schoolName'] = org_doc.to_dict().get('schoolName', org_code) if org_doc.exists else org_code
        return jsonify({"status": "success", "result": s_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 5. ADMIN & MANUAL OFFLINE SCORE ENTRY
# ==========================================
@app.route('/api/admin/all_data', methods=['POST'])
def admin_get_all_data():
    try:
        orgs = [{**doc.to_dict(), "code": doc.id} for doc in db.collection('organizers').stream()]
        students = [{**doc.to_dict(), "id": doc.id} for doc in db.collection('students').stream()]
        return jsonify({"status": "success", "organizers": orgs, "students": students}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/financial_requests', methods=['GET'])
def admin_get_financial_requests():
    try:
        settlements = [{**doc.to_dict(), "id": doc.id} for doc in db.collection('settlements').where('status', '==', 'pending').stream()]
        payouts = [{**doc.to_dict(), "id": doc.id} for doc in db.collection('payouts').where('status', '==', 'pending').stream()]
        return jsonify({"status": "success", "settlements": settlements, "payouts": payouts}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_payment', methods=['POST'])
def admin_approve_online_payment():
    data = request.json or {}
    if data.get('studentId'):
        db.collection('students').document(data.get('studentId')).update({"paymentVerified": True, "paymentStatus": "Approved"})
        return jsonify({"status": "success", "message": "Payment approved"})
    return jsonify({"status": "error", "message": "Missing ID"}), 400

@app.route('/api/admin/reject_payment', methods=['POST'])
def admin_reject_online_payment():
    data = request.json or {}
    if data.get('studentId'):
        db.collection('students').document(data.get('studentId')).update({"paymentVerified": False, "paymentStatus": "Rejected", "rejectionReason": data.get('reason', 'Invalid UTR')})
        return jsonify({"status": "success", "message": "Payment rejected"})
    return jsonify({"status": "error", "message": "Missing ID"}), 400

@app.route('/api/admin/reexam', methods=['POST'])
def admin_trigger_reexam():
    data = request.json or {}
    if data.get('studentId'):
        db.collection('students').document(data.get('studentId')).update({"examCompleted": False, "score": 0, "submittedAnswers": {}})
        return jsonify({"status": "success", "message": "Re-exam triggered"})
    return jsonify({"status": "error", "message": "Missing ID"}), 400

# MANUAL OFFLINE SCORE ENTRY (NEET Style)
@app.route('/api/admin/manual_score_entry', methods=['POST'])
def admin_manual_score_entry():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        score = float(data.get('score', 0))
        total_marks = float(data.get('totalMarks', 100))
        if not student_id:
            return jsonify({"status": "error", "message": "Student ID missing"}), 400
        percentage = round((score / max(1, total_marks)) * 100, 2)
        db.collection('students').document(student_id).update({
            "examCompleted": True,
            "score": score,
            "totalMarks": total_marks,
            "percentage": percentage,
            "manualEntry": True
        })
        return jsonify({"status": "success", "message": "Manual score updated successfully!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_settlement', methods=['POST'])
def admin_approve_settlement():
    data = request.json or {}
    if data.get('orgCode'): db.collection('organizers').document(data.get('orgCode')).update({"manualSettled": True})
    if data.get('requestId'): db.collection('settlements').document(data.get('requestId')).update({"status": "approved"})
    return jsonify({"status": "success", "message": "Settlement approved"})

@app.route('/api/admin/complete_payout', methods=['POST'])
def admin_complete_payout():
    data = request.json or {}
    if data.get('payoutId'): db.collection('payouts').document(data.get('payoutId')).update({"status": "completed"})
    return jsonify({"status": "success", "message": "Payout completed"})

# ==========================================
# 6. ORGANIZER ROUTES
# ==========================================
@app.route('/api/organizer/login', methods=['POST'])
def organizer_login():
    data = request.json or {}
    org_code = str(data.get('orgCode', '')).strip().upper()
    password = str(data.get('password', '')).strip()
    org_doc = db.collection('organizers').document(org_code).get()
    if not org_doc.exists or str(org_doc.to_dict().get('password', '')).strip() != password:
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401
    org_data = org_doc.to_dict()
    org_data['code'] = org_code
    if "password" in org_data: del org_data["password"]
    return jsonify({"status": "success", "data": org_data}), 200

@app.route('/api/organizer/register', methods=['POST'])
def organizer_register():
    data = request.json or {}
    org_code = f"NVMS{random.randint(100, 999)}"
    while db.collection('organizers').document(org_code).get().exists:
        org_code = f"NVMS{random.randint(100, 999)}"

    org_payload = {
        "schoolName": format_school_name(data.get('schoolName', '')),
        "name": str(data.get('name', '')).strip(),
        "contact": str(data.get('contact', '')).strip(),
        "password": str(data.get('password', '')).strip(),
        "pin": str(data.get('pin', '')).strip(),
        "refCode": str(data.get('refCode', '')).strip().upper(),
        "examMode": "online",
        "principalApproved": False,
        "manualSettled": False,
        "totalRegistrations": 0,
        "timestamp": firestore.SERVER_TIMESTAMP
    }
    db.collection('organizers').document(org_code).set(org_payload)
    return jsonify({"status": "success", "orgCode": org_code}), 200

@app.route('/api/organizer/update_profile', methods=['POST'])
def organizer_update_profile():
    data = request.json or {}
    org_code = str(data.get('orgCode', '')).strip().upper()
    db.collection('organizers').document(org_code).update({
        "examMode": str(data.get('examMode', 'online')).lower(),
        "principalApproved": bool(data.get('principalApproved', False))
    })
    return jsonify({"status": "success", "message": "Updated"})

@app.route('/api/organizer/students', methods=['POST'])
def organizer_get_students():
    data = request.json or {}
    org_code = str(data.get('orgCode', '')).strip().upper()
    students, seen = [], set()
    for f in ['orgCode', 'schoolCode']:
        for doc in db.collection('students').where(f, '==', org_code).stream():
            if doc.id not in seen:
                seen.add(doc.id)
                sd = doc.to_dict()
                sd['id'] = doc.id
                students.append(sd)

    org_data = db.collection('organizers').document(org_code).get().to_dict() or {}
    is_settled = bool(org_data.get('manualSettled', False))
    ref_code = str(org_data.get('refCode', '')).strip()
    g_cfg = db.collection('settings').document('portal_config').get().to_dict() or {}
    
    approved = [s for s in students if s.get('paymentStatus') == 'Approved' or s.get('paymentVerified') is True]
    exam_mode = (org_data.get('examMode') or 'online').lower()
    fee = g_cfg.get('offlineFee', 120) if exam_mode == 'offline' else g_cfg.get('onlineFee', 100)
    
    cash_approved = [s for s in approved if (s.get('paymentMode') or '').lower() == 'offline']
    cash_held = len(cash_approved) * fee
    gross = len(approved) * fee

    direct_comm = len(approved) * 15 if exam_mode == 'offline' else int(gross * 0.15)
    ref_comm = int(gross * 0.05) if (ref_code and ref_code != "NONE") else 0
    net_payable = 0 if is_settled else max(0, cash_held - direct_comm)

    return jsonify({
        "status": "success", "students": students, "isSettled": is_settled,
        "adminUpiId": g_cfg.get('adminUpiId', 'narmada@upi'),
        "isResultDeclared": bool(g_cfg.get('isResultDeclared', False)),
        "financials": {
            "totalRegistrations": len(students), "approvedRegistrations": len(approved),
            "totalFees": gross, "cashHeld": cash_held, "directCommission": direct_comm,
            "referralCommission": ref_comm, "netPayableToNvms": net_payable
        }
    }), 200

@app.route('/api/organizer/approve_cash', methods=['POST'])
def organizer_approve_cash():
    data = request.json or {}
    db.collection('students').document(data.get('studentId')).update({"paymentVerified": True, "paymentStatus": "Approved"})
    return jsonify({"status": "success", "message": "Cash approved"})

@app.route('/api/organizer/submit_settlement', methods=['POST'])
def organizer_submit_settlement():
    data = request.json or {}
    db.collection('settlements').document().set({
        "orgCode": data.get('orgCode'), "utrNumber": data.get('utrNumber'),
        "amount": data.get('amount'), "status": "pending", "timestamp": firestore.SERVER_TIMESTAMP
    })
    return jsonify({"status": "success", "message": "Submitted"})

@app.route('/api/organizer/request_payout', methods=['POST'])
def organizer_request_payout():
    data = request.json or {}
    db.collection('payouts').document().set({
        "orgCode": data.get('orgCode'), "upiId": data.get('upiId'),
        "amount": data.get('amount'), "status": "pending", "timestamp": firestore.SERVER_TIMESTAMP
    })
    return jsonify({"status": "success", "message": "Requested"})

# ==========================================
# 7. CHAT & QUESTION BANK
# ==========================================
@app.route('/api/admin/queries', methods=['GET'])
def get_queries():
    queries = [{**doc.to_dict(), "ticketId": doc.id} for doc in db.collection('supportTickets').stream()]
    return jsonify({"status": "success", "queries": queries})

@app.route('/api/admin/query_messages', methods=['GET'])
def get_query_messages():
    msgs = [doc.to_dict() for doc in db.collection('supportTickets').document(request.args.get('ticketId')).collection('messages').order_by('createdAt').stream()]
    return jsonify({"status": "success", "messages": msgs})

@app.route('/api/admin/reply_query', methods=['POST'])
def reply_query():
    data = request.json or {}
    t_id = data.get('ticketId')
    msg = data.get('message', '')
    db.collection('supportTickets').document(t_id).collection('messages').add({"text": msg, "imageUrl": data.get('imageUrl', ''), "isAdmin": True, "createdAt": firestore.SERVER_TIMESTAMP})
    db.collection('supportTickets').document(t_id).set({"lastMessage": msg}, merge=True)
    return jsonify({"status": "success", "message": "Replied"})

@app.route('/api/organizer/send_query', methods=['POST'])
def organizer_send_query():
    data = request.json or {}
    org_code = str(data.get('orgCode', '')).strip().upper()
    t_id = f"TICKET_{org_code}"
    db.collection('supportTickets').document(t_id).set({"orgCode": org_code, "senderName": data.get('senderName'), "lastMessage": data.get('message', ''), "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    db.collection('supportTickets').document(t_id).collection('messages').add({"text": data.get('message', ''), "imageUrl": data.get('imageUrl', ''), "isAdmin": False, "createdAt": firestore.SERVER_TIMESTAMP})
    return jsonify({"status": "success", "message": "Sent"})

@app.route('/api/organizer/query_messages', methods=['GET'])
def organizer_get_query_messages():
    org_code = request.args.get('orgCode', '').strip().upper()
    msgs = [doc.to_dict() for doc in db.collection('supportTickets').document(f"TICKET_{org_code}").collection('messages').order_by('createdAt').stream()]
    return jsonify({"status": "success", "messages": msgs})

@app.route('/api/admin/add-question', methods=['POST'])
def admin_add_question():
    data = request.json or {}
    db.collection('questions').add({
        "classRange": str(data.get('classRange', '')), "subject": str(data.get('subject', '')),
        "negativeMarking": float(data.get('negativeMarking', 0)), "questionText": str(data.get('questionText', '')),
        "optionA": str(data.get('optionA', '')), "optionB": str(data.get('optionB', '')),
        "optionC": str(data.get('optionC', '')), "optionD": str(data.get('optionD', '')),
        "correctOption": str(data.get('correctOption', 'A')), "timestamp": firestore.SERVER_TIMESTAMP
    })
    return jsonify({"status": "success", "message": "Question added"})

@app.route('/api/admin/all_questions', methods=['GET'])
def admin_get_all_questions():
    questions = [{**doc.to_dict(), "id": doc.id} for doc in db.collection('questions').stream()]
    return jsonify({"status": "success", "questions": questions})

@app.route('/api/admin/delete-question', methods=['POST'])
def admin_delete_question():
    data = request.json or {}
    if data.get('questionId'):
        db.collection('questions').document(data.get('questionId')).delete()
        return jsonify({"status": "success", "message": "Question deleted"})
    return jsonify({"status": "error", "message": "Missing ID"}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
