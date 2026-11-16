from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import os

app = Flask(__name__)
CORS(app)

# Initialize Firebase Admin
if not firebase_admin._apps:
    try:
        if os.path.exists('serviceAccountKey.json'):
            cred = credentials.Certificate('serviceAccountKey.json')
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
    except Exception as e:
        print(f"Firebase Init Warning: {e}")

db = firestore.client() if firebase_admin._apps else None

def backup_data_to_sheets(action_type, data):
    pass

@app.route('/')
def home():
    return jsonify({"status": "active", "system": "NVMSO 2026 Backend API is running securely."}), 200

# ==========================================
# 1. PORTAL CONFIGURATION & PHASES
# ==========================================
@app.route('/api/portal/config', methods=['GET'])
def get_portal_config():
    try:
        doc = db.collection('settings').document('portal_config').get()
        if doc.exists:
            return jsonify({"status": "success", "config": doc.to_dict()}), 200
        else:
            default_config = {
                "onlineFee": 100,
                "offlineFee": 120,
                "isRegistrationOpen": True,
                "isExamActive": False,
                "isResultDeclared": False,
                "broadcastNotice": "Welcome to Narmada Valley Maths & Science Olympiad 2026!",
                "adminUpiId": "narmada@upi"
            }
            db.collection('settings').document('portal_config').set(default_config)
            return jsonify({"status": "success", "config": default_config}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/update_config', methods=['POST'])
def update_portal_config():
    try:
        data = request.json or {}
        db.collection('settings').document('portal_config').set(data, merge=True)
        return jsonify({"status": "success", "message": "Portal configuration updated successfully."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 2. ADMIN AUTHENTICATION
# ==========================================
@app.route('/api/admin/authenticate', methods=['POST'])
def admin_authenticate():
    try:
        data = request.json or {}
        password = data.get('password', '')
        if password == "NVMS2026Admin@#":
            return jsonify({"status": "success", "message": "Authenticated"}), 200
        return jsonify({"status": "error", "message": "Invalid Password"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 3. SCHOOL ORGANIZER VERIFICATION & REGISTRATION
# ==========================================
@app.route('/api/student/verify-school', methods=['POST'])
def verify_school():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        doc = db.collection('organizers').document(org_code).get()
        if doc.exists:
            org_data = doc.to_dict()
            return jsonify({
                "status": "success",
                "schoolName": org_data.get('schoolName', org_code),
                "examMode": org_data.get('examMode', 'online')
            }), 200
        return jsonify({"status": "error", "message": "Invalid School Organizer Code!"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/login', methods=['POST'])
def organizer_login():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        password = str(data.get('password', '')).strip()
        doc = db.collection('organizers').document(org_code).get()
        if doc.exists:
            org_data = doc.to_dict()
            if org_data.get('password') == password:
                return jsonify({"status": "success", "data": org_data}), 200
        return jsonify({"status": "error", "message": "Invalid Organizer Credentials"}), 401
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/register', methods=['POST'])
def organizer_register():
    try:
        data = request.json or {}
        school_name = str(data.get('schoolName', '')).strip()
        contact = str(data.get('contact', '')).strip()
        if not school_name:
            return jsonify({"status": "error", "message": "School Name is required"}), 400
        
        count = len(list(db.collection('organizers').stream())) + 1
        org_code = f"NVMS{300 + count}"

        payload = {
            "code": org_code,
            "orgCode": org_code,
            "name": data.get('name', ''),
            "schoolName": school_name,
            "contact": contact,
            "password": data.get('password', ''),
            "pin": data.get('pin', ''),
            "refCode": data.get('refCode', 'NONE'),
            "examMode": "online",
            "principalApproved": False,
            "manualSettled": False
        }
        db.collection('organizers').document(org_code).set(payload)
        return jsonify({"status": "success", "orgCode": org_code}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/update_profile', methods=['POST'])
def organizer_update_profile():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        update_payload = {}
        if 'examMode' in data:
            update_payload['examMode'] = data['examMode']
        if 'principalApproved' in data:
            update_payload['principalApproved'] = data['principalApproved']
        
        db.collection('organizers').document(org_code).set(update_payload, merge=True)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 4. SECURE STUDENT REGISTRATION
# ==========================================
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
            return jsonify({"status": "error", "message": "Invalid or incomplete registration form payload!"}), 400

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({
                "status": "error", 
                "message": f"🚫 Registration Blocked: Roll Number '{roll_num}' is already registered under School Code '{org_code}'!"
            }), 400

        if payment_mode == "online":
            if not utr_number or utr_number == "NOT_PROVIDED" or len(utr_number) < 6:
                return jsonify({
                    "status": "error", 
                    "message": "❌ Online Payment Error: Valid UTR / Transaction Reference Number is mandatory!"
                }), 400

            existing_utr = db.collection('students').where('utrNumber', '==', utr_number).limit(1).get()
            if len(list(existing_utr)) > 0:
                return jsonify({
                    "status": "error", 
                    "message": "🚫 Security Error: This UTR Transaction Number has already been used!"
                }), 400

        initial_status = "Pending Payment Verification" if payment_mode == "online" else "Pending Organizer Cash Approval"

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
            "paymentVerified": False,
            "examCompleted": False,
            "score": 0,
            "percentage": 0,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        
        student_ref.set(student_payload)
        
        # New registration added -> Reset organizer settlement flag so fresh dues/commissions calculate correctly
        db.collection('organizers').document(org_code).set({"manualSettled": False}, merge=True)
        
        return jsonify({
            "status": "success", 
            "message": "Registration submitted successfully!"
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 5. STUDENT LOGIN & EXAM SUBMISSION
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
            return jsonify({"status": "error", "message": "Student record not found."}), 404

        s_data = student_doc.to_dict()

        is_paid = s_data.get('paymentStatus') == 'Approved' or s_data.get('paymentVerified') is True
        if not is_paid:
            return jsonify({"status": "error", "message": "🔒 Exam Locked! Fee pending verification."}), 403

        if s_data.get('examCompleted', False):
            return jsonify({"status": "error", "message": "⚠️ Exam already submitted!"}), 403

        mother_name = s_data.get('motherName', '').strip()
        expected_password = (mother_name[:2].upper() + roll_number) if len(mother_name) >= 2 else roll_number
        if input_password != expected_password:
            return jsonify({"status": "error", "message": "Invalid password!"}), 401

        org_doc = db.collection('organizers').document(org_code).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        s_data['schoolName'] = org_data.get('schoolName', org_code)
        s_data['examMode'] = org_data.get('examMode', 'online')
        s_data['id'] = student_doc.id
        return jsonify({"status": "success", "student": s_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/questions', methods=['GET'])
def get_student_questions():
    try:
        docs = db.collection('questions').stream()
        questions = [doc.to_dict() for doc in docs]
        return jsonify({"status": "success", "questions": questions}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/submit_exam', methods=['POST'])
def submit_exam():
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
            return jsonify({"status": "error", "message": "Exam already submitted"}), 400

        q_docs = db.collection('questions').stream()
        questions_map = {q.to_dict().get('id'): q.to_dict() for q in q_docs}

        score = 0.0
        total_questions = len(answers) if len(answers) > 0 else len(questions_map)
        
        for q_id, chosen_opt in answers.items():
            if q_id in questions_map:
                correct_opt = questions_map[q_id].get('correctOption')
                if chosen_opt and chosen_opt.upper() == correct_opt.upper():
                    score += 1.0

        total_marks = len(questions_map) if len(questions_map) > 0 else 30
        percentage = round((score / total_marks) * 100, 2) if total_marks > 0 else 0

        student_ref.update({
            "examCompleted": True,
            "answers": answers,
            "score": score,
            "totalMarks": total_marks,
            "percentage": percentage
        })

        return jsonify({"status": "success", "message": "Exam submitted successfully."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/student/result', methods=['POST'])
def get_student_result():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        roll_number = str(data.get('rollNumber', '')).strip()

        config_doc = db.collection('settings').document('portal_config').get()
        if config_doc.exists and not config_doc.to_dict().get('isResultDeclared', False):
            return jsonify({"status": "error", "message": "🔒 Result gate is locked!"}), 403

        student_id = f"{org_code}_{roll_number}"
        doc = db.collection('students').document(student_id).get()
        if not doc.exists:
            return jsonify({"status": "error", "message": "Student scorecard not found."}), 404

        s_data = doc.to_dict()
        org_doc = db.collection('organizers').document(org_code).get()
        s_data['schoolName'] = org_doc.to_dict().get('schoolName', org_code) if org_doc.exists else org_code

        return jsonify({"status": "success", "result": s_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 6. ORGANIZER DASHBOARD API (WITH ZERO-BALANCE RESET)
# ==========================================
@app.route('/api/organizer/students', methods=['POST'])
def organizer_get_students():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        
        docs = db.collection('students').where('orgCode', '==', org_code).stream()
        students = [doc.to_dict() for doc in docs]

        org_doc = db.collection('organizers').document(org_code).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}

        verified_students = [s for s in students if s.get('paymentStatus') == 'Approved' or s.get('paymentVerified') is True]
        exam_mode = org_data.get('examMode', 'online').lower()
        fee_per_student = 120 if exam_mode == 'offline' else 100

        total_regs = len(verified_students)
        total_fees = total_regs * fee_per_student
        direct_comm = total_regs * 15 if exam_mode == 'offline' else total_fees * 0.15
        
        has_ref = bool(org_data.get('refCode') and org_data.get('refCode') != 'NONE')
        ref_comm = total_fees * 0.05 if has_ref else 0
        net_payable = max(0, total_fees - direct_comm - ref_comm)

        # ZERO-BALANCE SETTLEMENT LOGIC: IF ADMIN APPROVED SETTLEMENT, RESET BALANCES TO 0
        is_settled = org_data.get('manualSettled', False)
        if is_settled:
            net_payable = 0
            direct_comm = 0
            ref_comm = 0

        financials = {
            "totalRegistrations": len(students),
            "verifiedRegistrations": total_regs,
            "totalFees": total_fees,
            "directCommission": direct_comm,
            "referralCommission": ref_comm,
            "netPayableToNvms": round(net_payable, 2),
            "isSettled": is_settled
        }

        return jsonify({
            "status": "success",
            "students": students,
            "financials": financials,
            "adminUpiId": "narmada@upi"
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/approve_cash', methods=['POST'])
def organizer_approve_cash():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        db.collection('students').document(student_id).update({
            "paymentStatus": "Approved",
            "paymentVerified": True
        })
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 7. ADMIN MANAGEMENT & MANUAL SCORE ENTRY
# ==========================================
@app.route('/api/admin/all_data', methods=['POST'])
def admin_get_all_data():
    try:
        org_docs = db.collection('organizers').stream()
        organizers = [doc.to_dict() for doc in org_docs]

        std_docs = db.collection('students').stream()
        students = [doc.to_dict() for doc in std_docs]

        return jsonify({
            "status": "success",
            "organizers": organizers,
            "students": students
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/financial_requests', methods=['GET'])
def admin_get_financial_requests():
    try:
        docs = db.collection('settlements').stream()
        settlements = [doc.to_dict() for doc in docs]
        return jsonify({"status": "success", "settlements": settlements, "payouts": []}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_payment', methods=['POST'])
def admin_approve_payment():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        db.collection('students').document(student_id).update({
            "paymentStatus": "Approved",
            "paymentVerified": True
        })
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/manual_score_entry', methods=['POST'])
def admin_manual_score_entry():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        score = float(data.get('score', 0))
        total_marks = float(data.get('totalMarks', 30))
        percentage = round((score / total_marks) * 100, 2) if total_marks > 0 else 0

        db.collection('students').document(student_id).update({
            "score": score,
            "totalMarks": total_marks,
            "percentage": percentage,
            "manualEntry": True,
            "examCompleted": True
        })
        return jsonify({"status": "success", "message": "Manual score saved successfully."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/reexam', methods=['POST'])
def admin_reexam():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        db.collection('students').document(student_id).update({
            "examCompleted": False,
            "score": 0,
            "percentage": 0
        })
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================
# 8. SUPPORT CHAT & SETTLEMENTS (ZERO-BALANCE APPROVAL)
# ==========================================
@app.route('/api/organizer/submit_settlement', methods=['POST'])
def submit_settlement():
    try:
        data = request.json or {}
        org_code = data.get('orgCode')
        utr = data.get('utrNumber')
        amount = data.get('amount')
        
        req_id = f"{org_code}_{utr}"
        payload = {
            "id": req_id,
            "orgCode": org_code,
            "utrNumber": utr,
            "amount": amount,
            "status": "Pending"
        }
        db.collection('settlements').document(req_id).set(payload)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_settlement', methods=['POST'])
def approve_settlement():
    try:
        data = request.json or {}
        org_code = data.get('orgCode')
        req_id = data.get('requestId')
        
        if req_id:
            db.collection('settlements').document(req_id).update({"status": "Approved"})
        
        # SET `manualSettled = True` SO BALANCES RESET TO ₹0
        db.collection('organizers').document(org_code).update({"manualSettled": True})
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/send_query', methods=['POST'])
def send_organizer_query():
    try:
        data = request.json or {}
        org_code = data.get('orgCode')
        msg = data.get('message', '')
        
        ticket_id = f"TICKET_{org_code}"
        msg_payload = {
            "ticketId": ticket_id,
            "orgCode": org_code,
            "senderName": data.get('senderName', org_code),
            "text": msg,
            "isAdmin": False,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        db.collection('support_tickets').document(ticket_id).set({"ticketId": ticket_id, "orgCode": org_code, "lastMessage": msg}, merge=True)
        db.collection('support_messages').add(msg_payload)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/query_messages', methods=['GET'])
def get_organizer_messages():
    try:
        org_code = request.args.get('orgCode')
        ticket_id = f"TICKET_{org_code}"
        docs = db.collection('support_messages').where('ticketId', '==', ticket_id).stream()
        messages = [d.to_dict() for d in docs]
        return jsonify({"status": "success", "messages": messages}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/queries', methods=['GET'])
def admin_get_queries():
    try:
        docs = db.collection('support_tickets').stream()
        queries = [d.to_dict() for d in docs]
        return jsonify({"status": "success", "queries": queries}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/query_messages', methods=['GET'])
def admin_get_query_messages():
    try:
        ticket_id = request.args.get('ticketId')
        docs = db.collection('support_messages').where('ticketId', '==', ticket_id).stream()
        messages = [d.to_dict() for d in docs]
        return jsonify({"status": "success", "messages": messages}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/reply_query', methods=['POST'])
def admin_reply_query():
    try:
        data = request.json or {}
        ticket_id = data.get('ticketId')
        msg = data.get('message', '')
        
        msg_payload = {
            "ticketId": ticket_id,
            "text": msg,
            "isAdmin": True,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        db.collection('support_messages').add(msg_payload)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
