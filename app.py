import os
import json
import random
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

app = Flask(__name__)

# Full Access CORS Configuration for Cross-Origin Resources
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
                del config["adminPassword"]
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
        if 'examDuration' in data: update_payload['examDuration'] = int(data.get('examDuration'))
        if 'isRegistrationOpen' in data: update_payload['isRegistrationOpen'] = bool(data.get('isRegistrationOpen'))
        if 'isExamActive' in data: update_payload['isExamActive'] = bool(data.get('isExamActive'))
        if 'isResultDeclared' in data: update_payload['isResultDeclared'] = bool(data.get('isResultDeclared'))
        if 'broadcastNotice' in data: update_payload['broadcastNotice'] = str(data.get('broadcastNotice', '')).strip()

        db.collection('settings').document('portal_config').set(update_payload, merge=True)
        return jsonify({"status": "success", "message": "Master parameters synced!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================================
# 3. STUDENT REGISTRATION PIPELINE & SCHOOL VERIFICATION
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

        mother_name = str(data.get('motherName', '')).strip()
        father_name = str(data.get('fatherName', '')).strip()
        stream = str(data.get('stream', '')).strip()
        contact_number = str(data.get('contactNumber', '')).strip()

        if not org_code or not roll_num or not student_name or not roll_num.isdigit():
            return jsonify({"status": "cyber_attack", "message": "Security Reject: Malformed payload data vectors!"}), 400

        student_id = f"{org_code}_{roll_num}"
        student_ref = db.collection('students').document(student_id)
        if student_ref.get().exists:
            return jsonify({"status": "cyber_attack", "message": "🚫 Submission Rejected: This Roll Number is already registered under this School Code!"}), 400

        if payment_mode == "online":
            if not utr_number or len(utr_number) != 12 or not utr_number.isdigit() or utr_number in ["123456789012", "000000000000", "999999999999"]:
                return jsonify({"status": "cyber_attack", "message": "🚫 Fraud Match Detected: Invalid Transaction UTR Number!"}), 400
            
            existing_utr = db.collection('students').where('utrNumber', '==', utr_number).limit(1).get()
            if len(list(existing_utr)) > 0:
                return jsonify({"status": "cyber_attack", "message": "⚠️ This UTR / Transaction Reference has already been used!"}), 400

        initial_status = "Pending Admin Approval" if payment_mode == "online" else "Pending Organizer Approval"

        student_payload = {
            "studentId": student_id,
            "orgCode": org_code,
            "schoolCode": org_code,  
            "rollNumber": roll_num,
            "studentName": student_name,
            "motherName": mother_name,
            "fatherName": father_name,
            "studentClass": student_class,
            "stream": stream,
            "contactNumber": contact_number,
            "paymentMode": payment_mode,
            "utrNumber": utr_number,
            "paymentStatus": initial_status,
            "paymentVerified": False,
            "score": 0,
            "percentage": 0,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        
        student_ref.set(student_payload)

        org_ref = db.collection('organizers').document(org_code)
        if org_ref.get().exists:
            org_ref.update({
                "studentCount": firestore.Increment(1),
                "totalRegistered": firestore.Increment(1)
            })

        backup_data_to_sheets("STUDENT_REGISTRATION", student_payload)

        return jsonify({"status": "success", "message": "Registration successful!", "studentId": student_id}), 200

    except Exception as e:
        return jsonify({"status": "glitch", "message": str(e)}), 500

# ==========================================================================
# 4. ADMIN CENTRAL PANEL DATA AGGREGATION & MANAGEMENT ROUTERS
# ==========================================================================
@app.route('/api/admin/all_data', methods=['POST'])
def admin_get_all_data():
    try:
        orgs_ref = db.collection('organizers').stream()
        organizers = []
        for doc in orgs_ref:
            o_data = doc.to_dict()
            o_data['code'] = doc.id
            organizers.append(o_data)

        students_ref = db.collection('students').stream()
        students = []
        for doc in students_ref:
            s_data = doc.to_dict()
            s_data['id'] = doc.id
            students.append(s_data)

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
        settlements = []
        payouts = []
        try:
            sett_ref = db.collection('settlements').where('status', '==', 'pending').stream()
            for doc in sett_ref:
                d = doc.to_dict()
                d['id'] = doc.id
                settlements.append(d)
        except Exception:
            pass

        try:
            payout_ref = db.collection('payouts').where('status', '==', 'pending').stream()
            for doc in payout_ref:
                d = doc.to_dict()
                d['id'] = doc.id
                payouts.append(d)
        except Exception:
            pass

        return jsonify({
            "status": "success",
            "settlements": settlements,
            "payouts": payouts
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_payment', methods=['POST'])
def admin_approve_online_payment():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        if not student_id:
            return jsonify({"status": "error", "message": "Student ID missing"}), 400

        student_ref = db.collection('students').document(student_id)
        doc = student_ref.get()
        if not doc.exists:
            return jsonify({"status": "error", "message": "Student not found"}), 404

        student_ref.update({
            "paymentVerified": True,
            "paymentStatus": "Approved"
        })
        return jsonify({"status": "success", "message": "Online payment UTR approved by Admin"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/reject_payment', methods=['POST'])
def admin_reject_online_payment():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        reason = str(data.get('reason', 'Invalid UTR / Payment not received')).strip()
        
        if not student_id:
            return jsonify({"status": "error", "message": "Student ID missing"}), 400

        student_ref = db.collection('students').document(student_id)
        doc = student_ref.get()
        if not doc.exists:
            return jsonify({"status": "error", "message": "Student not found"}), 404

        student_ref.update({
            "paymentVerified": False,
            "paymentStatus": "Rejected",
            "rejectionReason": reason
        })
        return jsonify({"status": "success", "message": "Online payment UTR rejected successfully!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/reexam', methods=['POST'])
def admin_trigger_reexam():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        if student_id:
            db.collection('students').document(student_id).update({
                "examCompleted": False,
                "score": 0,
                "answers": {}
            })
            return jsonify({"status": "success", "message": "Re-exam triggered"}), 200
        return jsonify({"status": "error", "message": "Invalid student ID"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/approve_settlement', methods=['POST'])
def admin_approve_settlement():
    try:
        data = request.json or {}
        org_code = data.get('orgCode')
        req_id = data.get('requestId')
        if org_code:
            db.collection('organizers').document(org_code).update({"manualSettled": True})
        if req_id:
            db.collection('settlements').document(req_id).update({"status": "approved"})
        return jsonify({"status": "success", "message": "Settlement approved"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/complete_payout', methods=['POST'])
def admin_complete_payout():
    try:
        data = request.json or {}
        payout_id = data.get('payoutId')
        if payout_id:
            db.collection('payouts').document(payout_id).update({"status": "completed"})
        return jsonify({"status": "success", "message": "Payout completed"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================================
# 5. ORGANIZER PORTAL & STUDENT ROSTER ROUTERS
# ==========================================================================
@app.route('/api/organizer/login', methods=['POST'])
def organizer_login():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        password = str(data.get('password', '')).strip()

        if not org_code or not password:
            return jsonify({"status": "error", "message": "Missing code or password"}), 400

        org_doc = db.collection('organizers').document(org_code).get()
        if not org_doc.exists:
            return jsonify({"status": "error", "message": "Organizer not found"}), 404

        org_data = org_doc.to_dict()
        if str(org_data.get('password', '')).strip() != password:
            return jsonify({"status": "error", "message": "Invalid password"}), 401

        org_data['code'] = org_code
        if "password" in org_data:
            del org_data["password"]

        return jsonify({"status": "success", "data": org_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/register', methods=['POST'])
def organizer_register():
    try:
        data = request.json or {}
        school_name = str(data.get('schoolName', '')).strip()
        name = str(data.get('name', '')).strip()
        contact = str(data.get('contact', '')).strip()
        password = str(data.get('password', '')).strip()
        pin = str(data.get('pin', '')).strip()
        ref_code = str(data.get('refCode', '')).strip().upper()

        if not school_name or not name or not password or not contact:
            return jsonify({"status": "error", "message": "Mandatory fields missing"}), 400

        rand_num = random.randint(100, 999)
        org_code = f"NVMS{rand_num}"
        while db.collection('organizers').document(org_code).get().exists:
            rand_num = random.randint(100, 999)
            org_code = f"NVMS{rand_num}"

        org_payload = {
            "schoolName": format_school_name(school_name),
            "name": name,
            "contact": contact,
            "password": password,
            "pin": pin,
            "refCode": ref_code,
            "examMode": "online",
            "principalApproved": False,
            "manualSettled": False,
            "totalRegistrations": 0,
            "timestamp": firestore.SERVER_TIMESTAMP
        }

        db.collection('organizers').document(org_code).set(org_payload)
        backup_data_to_sheets("ORGANIZER_REGISTRATION", {"orgCode": org_code, **org_payload})

        return jsonify({"status": "success", "orgCode": org_code, "message": "Organizer registered successfully"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/update_profile', methods=['POST'])
def organizer_update_profile():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        exam_mode = str(data.get('examMode', 'online')).lower()
        principal_approved = bool(data.get('principalApproved', False))

        if not org_code:
            return jsonify({"status": "error", "message": "Org code missing"}), 400

        db.collection('organizers').document(org_code).update({
            "examMode": exam_mode,
            "principalApproved": principal_approved
        })
        return jsonify({"status": "success", "message": "Profile updated"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/students', methods=['POST'])
def organizer_get_students():
    try:
        data = request.json or {}
        org_code = str(data.get('orgCode', '')).strip().upper()
        if not org_code:
            return jsonify({"status": "error", "message": "Org Code missing"}), 400

        students = []
        seen_ids = set()
        
        for field in ['orgCode', 'schoolCode']:
            docs = db.collection('students').where(field, '==', org_code).stream()
            for doc in docs:
                if doc.id not in seen_ids:
                    seen_ids.add(doc.id)
                    s_data = doc.to_dict()
                    s_data['id'] = doc.id
                    students.append(s_data)

        org_doc = db.collection('organizers').document(org_code).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        is_settled = bool(org_data.get('manualSettled', False))

        config_doc = db.collection('settings').document('portal_config').get()
        g_cfg = config_doc.to_dict() if config_doc.exists else {}
        admin_upi = g_cfg.get('adminUpiId', 'narmada@upi')
        is_result_declared = bool(g_cfg.get('isResultDeclared', False))

        approved_students = [s for s in students if s.get('paymentStatus') == 'Approved' or s.get('paymentVerified') is True]
        total_approved_regs = len(approved_students)

        exam_mode = org_data.get('examMode', 'online')
        fee_per_student = g_cfg.get('offlineFee', 120) if exam_mode == 'offline' else g_cfg.get('onlineFee', 100)
        
        cash_approved = [s for s in approved_students if s.get('paymentMode') == 'offline']
        cash_held = len(cash_approved) * fee_per_student

        gross_fees = total_approved_regs * fee_per_student

        if exam_mode == 'offline':
            direct_comm = total_approved_regs * 15
        else:
            direct_comm = int(gross_fees * 0.15)

        ref_comm = int(gross_fees * 0.05) if org_data.get('refCode') else 0
        net_payable = cash_held - direct_comm

        financials = {
            "totalRegistrations": len(students),
            "approvedRegistrations": total_approved_regs,
            "totalFees": gross_fees,
            "cashHeld": cash_held,
            "directCommission": direct_comm,
            "referralCommission": ref_comm,
            "netPayableToNvms": max(0, net_payable)
        }

        return jsonify({
            "status": "success",
            "students": students,
            "isSettled": is_settled,
            "adminUpiId": admin_upi,
            "isResultDeclared": is_result_declared,
            "financials": financials
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/approve_cash', methods=['POST'])
def organizer_approve_cash_collection():
    try:
        data = request.json or {}
        student_id = data.get('studentId')
        org_code = str(data.get('orgCode', '')).strip().upper()

        if not student_id:
            # Fallback if orgCode is missing in body
            student_id = data.get('studentId')

        if not student_id:
            return jsonify({"status": "error", "message": "Student ID missing"}), 400

        student_ref = db.collection('students').document(student_id)
        doc = student_ref.get()
        if not doc.exists:
            return jsonify({"status": "error", "message": "Student record not found"}), 404

        student_ref.update({
            "paymentVerified": True,
            "paymentStatus": "Approved"
        })
        return jsonify({"status": "success", "message": "Cash collection approved by organizer successfully!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/submit_settlement', methods=['POST'])
def organizer_submit_settlement():
    try:
        data = request.json or {}
        org_code = data.get('orgCode')
        utr_number = data.get('utrNumber')
        amount = data.get('amount')

        if not org_code or not utr_number:
            return jsonify({"status": "error", "message": "Missing details"}), 400

        settlement_ref = db.collection('settlements').document()
        settlement_ref.set({
            "orgCode": org_code,
            "utrNumber": utr_number,
            "amount": amount,
            "status": "pending",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "message": "Settlement proof submitted"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/request_payout', methods=['POST'])
def organizer_request_payout():
    try:
        data = request.json or {}
        org_code = data.get('orgCode')
        upi_id = data.get('upiId')
        amount = data.get('amount')

        if not org_code or not upi_id:
            return jsonify({"status": "error", "message": "Missing details"}), 400

        payout_ref = db.collection('payouts').document()
        payout_ref.set({
            "orgCode": org_code,
            "upiId": upi_id,
            "amount": amount,
            "status": "pending",
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "message": "Payout requested"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ==========================================================================
# 6. SUPPORT CHAT & PHOTO/SCREENSHOT UPLOAD ENDPOINTS
# ==========================================================================
@app.route('/api/admin/queries', methods=['GET'])
def get_queries():
    try:
        queries_snapshot = db.collection('supportTickets').stream()
        queries = [{**doc.to_dict(), "ticketId": doc.id} for doc in queries_snapshot]
        return jsonify({"status": "success", "queries": queries})
    except Exception:
        return jsonify({"status": "success", "queries": []})

@app.route('/api/admin/query_messages', methods=['GET'])
def get_query_messages():
    ticket_id = request.args.get('ticketId')
    try:
        msgs_snapshot = db.collection('supportTickets').document(ticket_id).collection('messages').order_by('createdAt').stream()
        messages = [doc.to_dict() for doc in msgs_snapshot]
        return jsonify({"status": "success", "messages": messages})
    except Exception:
        return jsonify({"status": "success", "messages": []})

@app.route('/api/admin/reply_query', methods=['POST'])
def reply_query():
    data = request.json or {}
    ticket_id = data.get('ticketId')
    message = data.get('message', '')
    image_url = data.get('imageUrl', '')
    try:
        msg_payload = {
            "text": message,
            "imageUrl": image_url,
            "isAdmin": True,
            "createdAt": firestore.SERVER_TIMESTAMP
        }
        db.collection('supportTickets').document(ticket_id).collection('messages').add(msg_payload)
        db.collection('supportTickets').document(ticket_id).set({"lastMessage": message if message else "[Attachment]"}, merge=True)
        return jsonify({"status": "success", "message": "Reply sent"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/send_query', methods=['POST'])
def organizer_send_query():
    data = request.json or {}
    org_code = str(data.get('orgCode', '')).strip().upper()
    sender_name = data.get('senderName', 'Organizer')
    message = data.get('message', '').strip()
    image_url = data.get('imageUrl', '')
    
    if not org_code or (not message and not image_url):
        return jsonify({"status": "error", "message": "Missing info"}), 400

    try:
        ticket_id = f"TICKET_{org_code}"
        ticket_ref = db.collection('supportTickets').document(ticket_id)
        
        ticket_ref.set({
            "orgCode": org_code,
            "senderName": sender_name,
            "lastMessage": message if message else "[Payment Screenshot Attached]",
            "updatedAt": firestore.SERVER_TIMESTAMP
        }, merge=True)
        
        ticket_ref.collection('messages').add({
            "text": message,
            "imageUrl": image_url,
            "isAdmin": False,
            "createdAt": firestore.SERVER_TIMESTAMP
        })
        return jsonify({"status": "success", "message": "Query sent to Central Command!"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/organizer/query_messages', methods=['GET'])
def organizer_get_query_messages():
    org_code = request.args.get('orgCode', '').strip().upper()
    ticket_id = f"TICKET_{org_code}"
    try:
        msgs_snapshot = db.collection('supportTickets').document(ticket_id).collection('messages').order_by('createdAt').stream()
        messages = [doc.to_dict() for doc in msgs_snapshot]
        return jsonify({"status": "success", "messages": messages})
    except Exception:
        return jsonify({"status": "success", "messages": []})

# ==========================================================================
# 7. QUESTION BANK ADMINISTRATOR ROUTERS
# ==========================================================================
@app.route('/api/admin/add-question', methods=['POST'])
def admin_add_question():
    try:
        data = request.json or {}
        class_range = str(data.get('classRange', '')).strip()
        subject = str(data.get('subject', '')).strip()
        question_text = str(data.get('questionText', '')).strip()
        option_a = str(data.get('optionA', '')).strip()
        option_b = str(data.get('optionB', '')).strip()
        option_c = str(data.get('optionC', '')).strip()
        option_d = str(data.get('optionD', '')).strip()
        correct_option = str(data.get('correctOption', 'A')).strip()

        if not question_text or not option_a or not option_b or not option_c or not option_d:
            return jsonify({"status": "error", "message": "Question text and all 4 options are mandatory."}), 400

        question_payload = {
            "classRange": class_range,
            "subject": subject,
            "questionText": question_text,
            "optionA": option_a,
            "optionB": option_b,
            "optionC": option_c,
            "optionD": option_d,
            "correctOption": correct_option,
            "timestamp": firestore.SERVER_TIMESTAMP
        }

        db.collection('questions').add(question_payload)

        return jsonify({"status": "success", "message": "Question added successfully"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/admin/all_questions', methods=['GET'])
def admin_get_all_questions():
    try:
        questions_ref = db.collection('questions').stream()
        questions = []
        for doc in questions_ref:
            q_data = doc.to_dict()
            q_data['id'] = doc.id
            questions.append(q_data)
        return jsonify({"status": "success", "questions": questions}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
