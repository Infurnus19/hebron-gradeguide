"""
Firebase Firestore integration module for Hebron GradeGuide.
Handles persistence of leads, sales enquiries, CAD quote requests, and CAD design consultations.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger("hebron.firebase")

db = None
_initialized = False

def init_firebase():
    global db, _initialized
    if _initialized:
        return db

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        cred = None

        # 1. Check for raw JSON string in environment variable (Render / Cloud deployment)
        env_json = os.environ.get("FIREBASE_CREDENTIALS_JSON")
        if env_json:
            try:
                cred_dict = json.loads(env_json)
                cred = credentials.Certificate(cred_dict)
                logger.info("Initializing Firebase using FIREBASE_CREDENTIALS_JSON environment variable.")
            except Exception as e:
                logger.error(f"Failed to parse FIREBASE_CREDENTIALS_JSON: {e}")

        # 2. Check for file path in environment variable or local file
        if not cred:
            cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")
            if not os.path.isabs(cred_path):
                cred_path = os.path.join(os.path.dirname(__file__), cred_path)

            if os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                logger.info(f"Initializing Firebase using key file at {cred_path}.")

        if cred:
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            db = firestore.client()
            _initialized = True
            logger.info("[Firebase] Firestore client initialized successfully.")
            return db
        else:
            logger.info("[Firebase] No credentials found. Firestore logging disabled.")
            return None

    except ImportError:
        logger.warning("firebase-admin package not installed. Skipping Firestore initialization.")
        return None
    except Exception as e:
        logger.error(f"Error initializing Firebase Firestore: {e}")
        return None

def get_db():
    global db, _initialized
    if not _initialized:
        return init_firebase()
    return db

def save_sales_enquiry(data: Dict[str, Any]) -> Optional[str]:
    """Saves a sales enquiry pack into the 'sales_enquiries' Firestore collection."""
    try:
        client = get_db()
        if not client:
            return None
        doc_data = {
            **data,
            "received_at": datetime.now(timezone.utc).isoformat()
        }
        ref_id = data.get("reference_id")
        if ref_id:
            client.collection("sales_enquiries").document(ref_id).set(doc_data)
            return ref_id
        else:
            _, doc_ref = client.collection("sales_enquiries").add(doc_data)
            return doc_ref.id
    except Exception as e:
        logger.error(f"Failed to save sales enquiry to Firestore: {e}")
        return None

def save_cad_quote(data: Dict[str, Any]) -> Optional[str]:
    """Saves a CAD / 3D printing estimate into the 'cad_quotes' Firestore collection."""
    try:
        client = get_db()
        if not client:
            return None
        doc_data = {
            **data,
            "received_at": datetime.now(timezone.utc).isoformat()
        }
        ref_id = data.get("quote_reference")
        if ref_id:
            client.collection("cad_quotes").document(ref_id).set(doc_data)
            return ref_id
        else:
            _, doc_ref = client.collection("cad_quotes").add(doc_data)
            return doc_ref.id
    except Exception as e:
        logger.error(f"Failed to save CAD quote to Firestore: {e}")
        return None

def save_cad_contact(data: Dict[str, Any]) -> Optional[str]:
    """Saves a CAD Design Consultation lead into the 'cad_design_leads' Firestore collection."""
    try:
        client = get_db()
        if not client:
            return None
        doc_data = {
            **data,
            "received_at": datetime.now(timezone.utc).isoformat()
        }
        ref_id = data.get("reference_id")
        if ref_id:
            client.collection("cad_design_leads").document(ref_id).set(doc_data)
            return ref_id
        else:
            _, doc_ref = client.collection("cad_design_leads").add(doc_data)
            return doc_ref.id
    except Exception as e:
        logger.error(f"Failed to save CAD contact lead to Firestore: {e}")
        return None
