"""
FastAPI Backend for Hebron GradeGuide
Provides endpoints for:
- /api/grades: List and detail of all standard Hebron grades
- /api/recommend: Full explainable grade recommendation & trade-off engine
- /api/enquiry: Connect selection to sales / dealer enquiry pack export
- /api/natural-language-parse: AI/Rule-based parser converting user queries into structured criteria
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from fastapi.staticfiles import StaticFiles

from materials_db import HEBRON_GRADES, HEBRON_AM_MATERIALS
from recommendation_engine import RecommendationEngine
from firebase_service import (
    init_firebase,
    save_sales_enquiry,
    save_cad_quote,
    save_cad_contact,
    get_db
)

app = FastAPI(
    title="Hebron GradeGuide API",
    description="Explainable Stainless Steel & Additive Materials Selection Engine for Hebron Engineering",
    version="1.0.0"
)

@app.on_event("startup")
def startup_event():
    init_firebase()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import RedirectResponse, FileResponse, Response

frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/app", StaticFiles(directory=frontend_dir, html=True), name="frontend")

@app.get("/")
def root():
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return RedirectResponse(url="/app/index.html")

@app.get("/robots.txt")
def robots_txt():
    content = "User-agent: *\nAllow: /\nSitemap: https://hebron-gradeguide.onrender.com/sitemap.xml\n"
    return Response(content=content, media_type="text/plain")

@app.get("/sitemap.xml")
def sitemap_xml():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://hebron-gradeguide.onrender.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://hebron-gradeguide.onrender.com/app/index.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>"""
    return Response(content=xml, media_type="application/xml")


engine = RecommendationEngine(HEBRON_GRADES)

class RecommendRequest(BaseModel):
    mode: str = "guided"  # "guided" or "engineering"
    application: str = "Car"
    exposure: str = "outdoor"  # indoor, outdoor, marine, chemical, exhaust
    operating_temp_c: float = 25.0
    has_chlorides: bool = False
    has_acids: bool = False
    requires_forming: bool = True
    requires_welding: bool = True
    requires_machining: bool = False
    min_yield_mpa: float = 0.0
    min_tensile_mpa: float = 0.0
    cost_priority: int = Field(default=3, ge=1, le=5)
    corrosion_priority: int = Field(default=4, ge=1, le=5)
    strength_priority: int = Field(default=3, ge=1, le=5)
    formability_priority: int = Field(default=3, ge=1, le=5)

class SalesEnquiryRequest(BaseModel):
    customer_name: str
    company: str
    email: str
    phone: Optional[str] = ""
    selected_grade_id: str
    application: str
    quantity_tons: float
    product_form: str  # Sheet, Coil, Plate, Bar, Tube
    thickness_mm: Optional[float] = None
    notes: Optional[str] = ""

class CADQuoteRequest(BaseModel):
    client_name: str
    organization: str
    email: str
    phone: Optional[str] = ""
    service_type: str  # DfAM & Topology Optimization, Reverse Engineering, Production 3D Printing, Rapid Tooling
    material_id: str
    estimated_volume_cc: float = 50.0
    quantity_parts: int = 1
    post_processing: List[str] = []
    cad_filename: Optional[str] = "part_model.step"
class CADDesignContactRequest(BaseModel):
    client_name: str
    organization: Optional[str] = ""
    email: str
    phone: Optional[str] = ""
    design_scope: str
    timeline: str
    project_brief: str

class NLParseRequest(BaseModel):
    prompt: str

@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "Hebron GradeGuide API"}

@app.get("/api/grades")
def get_all_grades():
    return {"count": len(HEBRON_GRADES), "grades": HEBRON_GRADES}

@app.get("/api/grades/{grade_id}")
def get_grade(grade_id: str):
    for g in HEBRON_GRADES:
        if g["id"] == grade_id:
            return g
    raise HTTPException(status_code=404, detail="Grade not found")

@app.post("/api/recommend")
def recommend_grades(req: RecommendRequest):
    criteria = req.dict()
    result = engine.evaluate(criteria)
    return result

@app.post("/api/natural-language-parse")
def parse_natural_language(req: NLParseRequest):
    """
    Parses user natural language descriptions into structured engineering criteria.
    Extracts application, temperature, environment, forming/welding needs.
    """
    text = req.prompt.lower()
    
    # Defaults
    app_detected = "General Engineering"
    exposure = "indoor"
    operating_temp = 25.0
    has_chlorides = False
    has_acids = False
    requires_forming = True
    requires_welding = True
    cost_prio = 3
    corr_prio = 3

    if "car" in text or "automotive" in text or "vehicle" in text:
        app_detected = "Automotive Component"
        exposure = "outdoor"
        corr_prio = 4
    elif "exhaust" in text or "muffler" in text or "silencer" in text:
        app_detected = "Exhaust System"
        exposure = "exhaust"
        operating_temp = 650.0
        corr_prio = 3
    elif "marine" in text or "boat" in text or "coastal" in text or "sea" in text or "ocean" in text or "salt" in text:
        app_detected = "Marine / Coastal Structure"
        exposure = "marine"
        has_chlorides = True
        corr_prio = 5
    elif "chemical" in text or "acid" in text or "reactor" in text or "pharma" in text:
        app_detected = "Chemical / Process Equipment"
        exposure = "chemical"
        has_acids = True
        corr_prio = 5
    elif "kitchen" in text or "cutlery" in text or "appliance" in text:
        app_detected = "Appliance / Kitchenware"
        exposure = "indoor"
        corr_prio = 3
    elif "bridge" in text or "heavy structural" in text or "high load" in text:
        app_detected = "Heavy Civil Infrastructure"
        exposure = "outdoor"
        corr_prio = 4

    # Temperature scanning
    import re
    temp_match = re.search(r'(\d+)\s*(?:°c|c|deg|degrees)', text)
    if temp_match:
        operating_temp = float(temp_match.group(1))

    if "cheap" in text or "low cost" in text or "budget" in text or "economical" in text:
        cost_prio = 5
    elif "premium" in text or "critical" in text or "no budget limit" in text:
        cost_prio = 1

    return {
        "mode": "guided",
        "application": app_detected,
        "exposure": exposure,
        "operating_temp_c": operating_temp,
        "has_chlorides": has_chlorides,
        "has_acids": has_acids,
        "requires_forming": requires_forming,
        "requires_welding": requires_welding,
        "requires_machining": False,
        "cost_priority": cost_prio,
        "corrosion_priority": corr_prio,
        "extracted_explanation": f"Detected application '{app_detected}' with exposure condition '{exposure}' and estimated continuous operating temperature of {operating_temp}°C."
    }

@app.post("/api/enquiry")
def create_sales_enquiry(enquiry: SalesEnquiryRequest):
    # Match grade details
    grade = next((g for g in HEBRON_GRADES if g["id"] == enquiry.selected_grade_id), None)
    if not grade:
        raise HTTPException(status_code=400, detail="Invalid grade specified")

    reference_id = f"HEB-ENQ-2026-{abs(hash(enquiry.customer_name + enquiry.company)) % 100000:05d}"
    
    enquiry_pack = {
        "reference_id": reference_id,
        "status": "QUALIFIED_LEAD_DISPATCHED",
        "commercial_channel": "Hebron Direct Technical Sales & Regional Dealer Network",
        "customer": {
            "name": enquiry.customer_name,
            "company": enquiry.company,
            "email": enquiry.email,
            "phone": enquiry.phone
        },
        "material_specification": {
            "grade_id": grade["id"],
            "grade_name": grade["name"],
            "standard_designation": grade["standard_designation"],
            "category": grade["category"],
            "product_form": enquiry.product_form,
            "thickness_mm": enquiry.thickness_mm,
            "quantity_tons": enquiry.quantity_tons,
            "indicative_relative_cost_factor": grade["indicative_relative_cost"]
        },
        "engineering_context": {
            "application": enquiry.application,
            "test_standards": grade["test_standards"],
            "customer_notes": enquiry.notes
        },
        "next_steps": [
            "Regional sales engineer assigned within 2 business hours.",
            "Mill test certificate (MTC 3.1) and live pricing schedule dispatched to email.",
            "Sample dispatch or technical clarification scheduled."
        ]
    }
    # Persist lead to Firestore
    save_sales_enquiry(enquiry_pack)
    return enquiry_pack

@app.get("/api/am-materials")
def get_am_materials():
    """Retrieve full catalog of 3D printing and additive manufacturing materials."""
    return {"count": len(HEBRON_AM_MATERIALS), "materials": HEBRON_AM_MATERIALS}

@app.post("/api/cad-quote")
def create_cad_quote(quote: CADQuoteRequest):
    """
    Generate instant estimation dossier for CAD & Additive Manufacturing Services.
    Computes volumetric cost, machine setup, post-processing surcharge, and lead time.
    """
    mat = next((m for m in HEBRON_AM_MATERIALS if m["id"] == quote.material_id), None)
    if not mat:
        raise HTTPException(status_code=400, detail="Invalid AM material specified")

    ref_id = f"HEB-AM-CAD-2026-{abs(hash(quote.client_name + quote.organization + mat['id'])) % 100000:05d}"
    
    # Calculate baseline indicative pricing
    unit_mat_cost = quote.estimated_volume_cc * mat["indicative_cost_per_cc"]
    setup_fee = 45.0  # File slicing, machine calibration, laser prep
    post_proc_fee = len(quote.post_processing) * 25.0
    total_est = round((unit_mat_cost + post_proc_fee) * quote.quantity_parts + setup_fee, 2)

    quote_pack = {
        "quote_reference": ref_id,
        "status": "CAD_DfAM_REVIEW_QUEUED",
        "service_division": "Hebron Additive Engineering & CAD Solutions",
        "client": {
            "name": quote.client_name,
            "organization": quote.organization,
            "email": quote.email,
            "phone": quote.phone
        },
        "cad_spec": {
            "filename": quote.cad_filename,
            "service_type": quote.service_type,
            "material_name": mat["name"],
            "technology": mat["technology"],
            "quantity_parts": quote.quantity_parts,
            "estimated_volume_cc": quote.estimated_volume_cc,
            "post_processing_requested": quote.post_processing,
            "layer_resolution": mat["layer_thickness_um"],
            "lead_time": mat["lead_time_days"]
        },
        "commercial_estimate": {
            "unit_indicative_cost_usd": round(unit_mat_cost + post_proc_fee, 2),
            "estimated_total_usd": total_est,
            "notes": "Subject to formal DfAM geometry validation (wall thickness, support structures)."
        },
        "next_steps": [
            "DfAM specialist assigned to inspect geometry for overhangs and wall thickness.",
            "Automated slice analysis and final binding quotation dispatched to email.",
            "Material test specimen (tensile coupon) available upon production request."
        ]
    }
    # Persist lead to Firestore
    save_cad_quote(quote_pack)
    return quote_pack

@app.post("/api/cad-contact")
def create_cad_contact(contact: CADDesignContactRequest):
    """
    Handles paid CAD Design & Engineering Consultation requests.
    Directly routes requirements to the CAD designer for review & pricing.
    """
    ref_id = f"HEB-CAD-DES-2026-{abs(hash(contact.client_name + contact.email)) % 100000:05d}"
    
    contact_pack = {
        "reference_id": ref_id,
        "status": "DESIGN_CONSULTATION_LOGGED",
        "service_division": "Hebron Bespoke CAD Design & Engineering Modeling",
        "client": {
            "name": contact.client_name,
            "organization": contact.organization,
            "email": contact.email,
            "phone": contact.phone
        },
        "design_scope": contact.design_scope,
        "timeline": contact.timeline,
        "project_brief": contact.project_brief,
        "commercial_note": "A senior CAD engineer will review your brief and send a detailed design scope proposal with fixed or hourly pricing within 4 business hours.",
        "next_steps": [
            "Project review by specialized CAD modeling engineer.",
            "Detailed milestone plan (concept sketches -> 3D model -> 2D engineering drawings) and invoice sent to your email.",
            "Direct Slack / WhatsApp / Zoom collaboration link provided upon project commencement."
        ]
    }
    # Persist lead to Firestore
    save_cad_contact(contact_pack)
    return contact_pack

@app.get("/api/admin/submissions-summary")
def get_submissions_summary():
    """
    Returns summary stats of submissions from Firestore.
    """
    client = get_db()
    if not client:
        return {"status": "firestore_not_configured", "counts": {"sales_enquiries": 0, "cad_quotes": 0, "cad_design_leads": 0}}
    try:
        def count_collection(name: str):
            docs = client.collection(name).limit(50).stream()
            return len(list(docs))

        return {
            "status": "connected",
            "counts": {
                "sales_enquiries": count_collection("sales_enquiries"),
                "cad_quotes": count_collection("cad_quotes"),
                "cad_design_leads": count_collection("cad_design_leads")
            }
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
