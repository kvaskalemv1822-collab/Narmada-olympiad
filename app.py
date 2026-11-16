from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import os

app = Flask(__name__)
CORS(app)

db = None
try:
    if not firebase_admin._apps:
        if os.path.exists('serviceAccountKey.json'):
            cred = credentials.Certificate('serviceAccountKey.json')
            firebase_admin.initialize_app(cred)
            db = firestore.client()
        else:
            firebase_admin.initialize_app()
            db = firestore.client()
    else:
        db = firestore.client()
except Exception as e:
    print(f"Firebase Init Error: {e}")

@app.route('/')
def home():
    db_status = "Connected" if db is not None else "Disconnected"
    return jsonify({"status": "active", "firebase": db_status, "system": "NVMSO 2026 Backend API"}), 200

# ==========================================
# 1. PORTAL CONFIGURATION (WITH MUTUAL EXCLUSIVITY)
# ==========================================
@app.route('/api/portal/config', methods=['GET'])
def get_portal_config():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        doc = db.collection('settings').document('portal_config').get()
        if doc.exists:
            return jsonify({"status": "success", "config": doc.to_dict()}), 200
        else:
            default_config = {
                "onlineFee": 100, "offlineFee": 120, "isRegistrationOpen": True,
                "isExamActive": False, "isResultDeclared": False,
                "broadcastNotice": "Welcome to Narmada Valley Maths & Science Olympiad 2026!", "adminUpiId": "narmada@upi"
            }
            db.collection('settings').document('portal_config').set(default_config)
            return jsonify({"status": "success", "config": default_config}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_portal_config():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        
        is_reg = bool(data.get('isRegistrationOpen', False))
        is_exam = bool(data.get('isExamActive', False))
        is_result = bool(data.get('isResultDeclared', False))
        
        # STRICT MUTUAL EXCLUSIVITY: Only one phase can be active at a time
        if is_result:
            is_reg = False
            is_exam = False
        elif is_exam:
            is_reg = False
            is_result = False
        elif is_reg:
            is_exam = False
            is_result = False

        payload = {
            "onlineFee": float(data.get('onlineFee', 100)),
            "offlineFee": float(data.get('offlineFee', 120)),
            "isRegistrationOpen": is_reg,
            "isExamActive": is_exam,
            "isResultDeclared": is_result,
            "broadcastNotice": str(data.get('broadcastNotice', '')).strip()
        }
        
        db.collection('settings').document('portal_config').set(payload, merge=True)
        return jsonify({"status": "success", "message": "Portal phase updated securely!"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 2. ADMIN AUTHENTICATION (SECURE FIREBASE CHECK)
# ==========================================
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_authenticate():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        input_pass = str(data.get('password', '')).strip()
        
        admin_doc = db.collection('settings').document('admin_auth').get()
        stored_pass = admin_doc.to_dict().get('masterPassword', 'NVMS2026Admin@#') if admin_doc.exists else "NVMS2026Admin@#"
            
        if input_pass == stored_pass:
            return jsonify({"status": "success", "message": "Authenticated"}), 200
        return jsonify({"status": "error", "message": "Invalid Master Password"}), 401
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 3. SCHOOL ORGANIZER & STUDENT APIS
# ==========================================
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        org_code = str((request.json or {}).get('orgCode', '')).strip().upper()
        doc = db.collection('organizers').document(org_code).get()
        if not doc.exists:
            for d in db.collection('organizers').stream():
                if d.id.upper() == org_code or str(d.to_dict().get('orgCode', '')).upper() == org_code:
                    doc = d
                    break
        if doc and doc.exists:
            org_data = doc.to_dict()
            return jsonify({"status": "success", "schoolName": org_data.get('schoolName', org_code), "examMode": org_data.get('examMode', 'online')}), 200
        return jsonify({"status": "error", "message": "Invalid School Organizer Code!"}), 404
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/login', methods=['POST'])
def organizer_login():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        password = str(data.get('password', '')).strip()
        doc = db.collection('organizers').document(org_code).get()
        org_data = doc.to_dict() if doc.exists else None
        if not org_data:
            for d in db.collection('organizers').stream():
                if d.id.upper() == org_code or str(d.to_dict().get('orgCode', '')).upper() == org_code:
                    org_data = d.to_dict()
                    break
        if org_data and str(org_data.get('password', '')).strip() == password:
            return jsonify({"status": "success", "data": org_data}), 200
        return jsonify({"status": "error", "message": "Invalid Credentials"}), 401
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/register', methods=['POST'])
def organizer_register():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        school_name = str(data.get('schoolName', '')).strip()
        if not school_name: return jsonify({"status": "error", "message": "School Name required"}), 400
        
        count = len(list(db.collection('organizers').stream())) + 1
        org_code = f"NVMS{300 + count}"
        payload = {
            "code": org_code, "orgCode": org_code, "name": str(data.get('name', '')).strip(),
            "schoolName": school_name, "contact": str(data.get('contact', '')).strip(),
            "password": str(data.get('password', '')).strip(), "pin": str(data.get('pin', '')).strip(),
            "refCode": str(data.get('refCode', 'NONE')).strip().upper(), "examMode": "online",
            "principalApproved": False, "manualSettled": False
        }
        db.collection('organizers').document(org_code).set(payload)
        return jsonify({"status": "success", "orgCode": org_code}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/update_profile', methods=['POST'])
def organizer_update_profile():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        update_payload = {}
        if 'examMode' in data: update_payload['examMode'] = data['examMode']
        if 'principalApproved' in data: update_payload['principalApproved'] = data['principalApproved']
        db.collection('organizers').document(org_code).set(update_payload, merge=True)
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/register', methods=['POST'])
def secure_registration():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_num = str(data.get('rollNumber', '')).strip()
        student_name = str(data.get('studentName', '')).strip()
        payment_mode = str(data.get('paymentMode', 'online')).lower()
        utr_number = str(data.get('utrNumber', '')).strip()

        if not org_code or not roll_num or not student_name or not roll_num.isdigit():
            return jsonify({"status": "error", "message": "Invalid form payload!"}), 400

        student_id = f"{org_code}_{roll_num}"
        if db.collection('students').document(student_id).get().exists:
            return jsonify({"status": "error", "message": f"🚫 Roll Number '{roll_num}' already registered!"}), 400

        if payment_mode == "online" and (not utr_number or len(utr_number) < 6):
            return jsonify({"status": "error", "message": "❌ Valid UTR number mandatory!"}), 400

        initial_status = "Pending Payment Verification" if payment_mode == "online" else "Pending Organizer Cash Approval"
        student_payload = {
            "studentId": student_id, "orgCode": org_code, "schoolCode": org_code, "rollNumber": roll_num,
            "studentName": student_name, "motherName": str(data.get('motherName', '')).strip(),
            "fatherName": str(data.get('fatherName', '')).strip(), "studentClass": str(data.get('studentClass', '')).strip(),
            "stream": str(data.get('stream', '')).strip(), "contactNumber": str(data.get('contactNumber', '')).strip(),
            "paymentMode": payment_mode, "utrNumber": utr_number or "NOT_PROVIDED", "paymentStatus": initial_status,
            "paymentVerified": False, "examCompleted": False, "score": 0, "percentage": 0, "timestamp": firestore.SERVER_TIMESTAMP
        }
        db.collection('students').document(student_id).set(student_payload)
        db.collection('organizers').document(org_code).set({"manualSettled": False}, merge=True)
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/login', methods=['POST'])
def student_login():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_number = str(data.get('rollNumber', '')).strip()
        input_password = str(data.get('password', '')).strip()

        student_doc = db.collection('students').document(f"{org_code}_{roll_number}").get()
        if not student_doc.exists: return jsonify({"status": "error", "message": "Student not found."}), 404

        s_data = student_doc.to_dict()
        if not (s_data.get('paymentStatus') == 'Approved' or s_data.get('paymentVerified') is True):
            return jsonify({"status": "error", "message": "🔒 Exam Locked! Fee pending verification."}), 403
        if s_data.get('examCompleted', False): return jsonify({"status": "error", "message": "⚠️ Exam already submitted!"}), 403

        mother_name = str(s_data.get('motherName', '')).strip()
        expected_pwd = (mother_name[:2].upper() + roll_number) if len(mother_name) >= 2 else roll_number
        if input_password != expected_pwd: return jsonify({"status": "error", "message": "Invalid password!"}), 401

        org_data = db.collection('organizers').document(org_code).get().to_dict() or {}
        s_data['schoolName'] = org_data.get('schoolName', org_code)
        s_data['examMode'] = org_data.get('examMode', 'online')
        s_data['id'] = student_doc.id
        return jsonify({"status": "success", "student": s_data}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/questions', methods=['GET'])
def get_student_questions():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        questions = [doc.to_dict() for doc in db.collection('questions').stream()]
        return jsonify({"status": "success", "questions": questions}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/submit_exam', methods=['POST'])
def submit_exam():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        student_id, answers = data.get('studentId'), data.get('answers', {})
        student_ref = db.collection('students').document(student_id)
        doc = student_ref.get()
        if not doc.exists: return jsonify({"status": "error", "message": "Student not found"}), 404

        questions_map = {q.to_dict().get('id'): q.to_dict() for q in db.collection('questions').stream()}
        score = sum(1.0 for q_id, chosen in answers.items() if q_id in questions_map and chosen and chosen.upper() == questions_map[q_id].get('correctOption', '').upper())
        total_marks = len(questions_map) if len(questions_map) > 0 else 30
        percentage = round((score / total_marks) * 100, 2) if total_marks > 0 else 0

        student_ref.update({"examCompleted": True, "answers": answers, "score": score, "totalMarks": total_marks, "percentage": percentage})
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/result', methods=['POST'])
def get_student_result():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        org_code, roll_number = str(data.get('orgCode', '')).strip().upper(), str(data.get('rollNumber', '')).strip()
        
        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists and not config_doc.to_dict().get('isResultDeclared', False):
            return jsonify({"status": "error", "message": "🔒 Result gate is locked!"}), 403

        student_doc = db.collection('students').document(f"{org_code}_{roll_number}").get()
        if not student_doc.exists: return jsonify({"status": "error", "message": "Scorecard not found."}), 404
        s_data = student_doc.to_dict()
        s_data['schoolName'] = db.collection('organizers').document(org_code).get().to_dict().get('schoolName', org_code)
        return jsonify({"status": "success", "result": s_data}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/students', methods=['POST'])
def organizer_get_students():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        org_code = str((request.json or {}).get('orgCode', '')).strip().upper()
        students = [doc.to_dict() for doc in db.collection('students').where('orgCode', '==', org_code).stream()]
        org_data = db.collection('organizers').document(org_code).get().to_dict() or {}

        verified = [s for s in students if s.get('paymentStatus') == 'Approved' or s.get('paymentVerified') is True]
        exam_mode = org_data.get('examMode', 'online').lower()
        fee_per_student = 120 if exam_mode == 'offline' else 100

        total_fees = len(verified) * fee_per_student
        direct_comm = len(verified) * 15 if exam_mode == 'offline' else total_fees * 0.15
        ref_comm = total_fees * 0.05 if (org_data.get('refCode') and org_data.get('refCode') != 'NONE') else 0
        net_payable = max(0, total_fees - direct_comm - ref_comm)

        is_settled = org_data.get('manualSettled', False)
        if is_settled: net_payable, direct_comm, ref_comm = 0, 0, 0

        return jsonify({
            "status": "success", "students": students, "adminUpiId": "narmada@upi",
            "financials": {"totalRegistrations": len(students), "verifiedRegistrations": len(verified), "totalFees": total_fees, "directCommission": direct_comm, "referralCommission": ref_comm, "netPayableToNvms": round(net_payable, 2), "isSettled": is_settled}
        }), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/approve_cash', methods=['POST'])
def organizer_approve_cash():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        db.collection('students').document((request.json or {}).get('studentId')).update({"paymentStatus": "Approved", "paymentVerified": True})
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/all_data', methods=['POST'])
def admin_get_all_data():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        return jsonify({"status": "success", "organizers": [d.to_dict() for d in db.collection('organizers').stream()], "students": [d.to_dict() for d in db.collection('students').stream()]}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/financial_requests', methods=['GET'])
def admin_get_financial_requests():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        return jsonify({"status": "success", "settlements": [d.to_dict() for d in db.collection('settlements').stream()], "payouts": []}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/manual_score_entry', methods=['POST'])
def admin_manual_score_entry():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        score, total_marks = float(data.get('score', 0)), float(data.get('totalMarks', 30))
        percentage = round((score / total_marks) * 100, 2) if total_marks > 0 else 0
        db.collection('students').document(data.get('studentId')).update({"score": score, "totalMarks": total_marks, "percentage": percentage, "manualEntry": True, "examCompleted": True})
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/submit_settlement', methods=['POST'])
def submit_settlement():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        req_id = f"{data.get('orgCode')}_{data.get('utrNumber')}"
        db.collection('settlements').document(req_id).set({"id": req_id, "orgCode": data.get('orgCode'), "utrNumber": data.get('utrNumber'), "amount": data.get('amount'), "status": "Pending"})
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_settlement', methods=['POST'])
def approve_settlement():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        if data.get('requestId'): db.collection('settlements').document(data.get('requestId')).update({"status": "Approved"})
        db.collection('organizers').document(data.get('orgCode')).update({"manualSettled": True})
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/send_query', methods=['POST'])
def send_organizer_query():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        ticket_id = f"TICKET_{data.get('orgCode')}"
        db.collection('support_tickets').document(ticket_id).set({"ticketId": ticket_id, "orgCode": data.get('orgCode'), "lastMessage": data.get('message', '')}, merge=True)
        db.collection('support_messages').add({"ticketId": ticket_id, "orgCode": data.get('orgCode'), "senderName": data.get('senderName'), "text": data.get('message', ''), "isAdmin": False, "timestamp": firestore.SERVER_TIMESTAMP})
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/query_messages', methods=['GET'])
def get_organizer_messages():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        messages = [d.to_dict() for d in db.collection('support_messages').where('ticketId', '==', f"TICKET_{request.args.get('orgCode')}").stream()]
        return jsonify({"status": "success", "messages": messages}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/queries', methods=['GET'])
def admin_get_queries():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        return jsonify({"status": "success", "queries": [d.to_dict() for d in db.collection('support_tickets').stream()]}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/query_messages', methods=['GET'])
def admin_get_query_messages():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        return jsonify({"status": "success", "messages": [d.to_dict() for d in db.collection('support_messages').where('ticketId', '==', request.args.get('ticketId')).stream()]}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/reply_query', methods=['POST'])
def admin_reply_query():
    try:
        if db is None: return jsonify({"status": "error", "message": "DB offline"}), 500
        data = request.json or {}
        db.collection('support_messages').add({"ticketId": data.get('ticketId'), "text": data.get('message', ''), "isAdmin": True, "timestamp": firestore.SERVER_TIMESTAMP})
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
