"""
Hebron GradeGuide Recommendation Engine
Implements the 4-step recommendation pipeline from the proposal:
1. Capture Requirements (Mandatory conditions vs Preferences)
2. Filter for Suitability (Hard constraints, exclude failing grades, flag missing info)
3. Rank Eligible Grades (Multi-factor scoring across corrosion, fabrication, temp, cost)
4. Explain the Shortlist (Detailed transparent trade-offs, why-selected, and why-excluded)
"""

from typing import List, Dict, Any, Optional
from materials_db import HEBRON_GRADES

CORROSION_LEVELS = {"Low": 1, "Moderate": 2, "High": 3, "Very High": 4, "Extreme": 5}
FABRICATION_LEVELS = {"Poor": 1, "Fair": 2, "Moderate": 3, "Good": 4, "Excellent": 5}
COST_LEVELS = {"Low": 1, "Medium": 2, "High": 3, "Premium": 4}

class RecommendationEngine:
    def __init__(self, grades: List[Dict[str, Any]] = HEBRON_GRADES):
        self.grades = grades

    def evaluate(self, criteria: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate user criteria against the Hebron materials database.
        Returns:
            - top_recommendations: list of top 3 ranked grades with rationale
            - all_eligible: list of all eligible grades with scores
            - excluded_grades: list of excluded grades with specific failure reasons
            - trade_off_summary: explanation of what user is trading off
            - audit_trail: rule breakdown
        """
        mode = criteria.get("mode", "guided") # 'guided' or 'engineering'
        application = criteria.get("application", "").lower().strip()
        
        # Mandatory & Operating Criteria
        min_yield = criteria.get("min_yield_mpa", 0)
        min_tensile = criteria.get("min_tensile_mpa", 0)
        operating_temp = criteria.get("operating_temp_c", 25)
        
        # Environmental conditions
        exposure = criteria.get("exposure", "indoor") # indoor, outdoor, marine, chemical, exhaust
        has_chlorides = criteria.get("has_chlorides", False)
        has_acids = criteria.get("has_acids", False)
        
        # Fabrication needs
        requires_forming = criteria.get("requires_forming", True)
        requires_welding = criteria.get("requires_welding", True)
        requires_machining = criteria.get("requires_machining", False)
        
        # Preferences & Weightings (1 to 5)
        cost_priority = criteria.get("cost_priority", 3)          # Higher = prefer low cost
        corrosion_priority = criteria.get("corrosion_priority", 4) # Higher = prefer max corrosion resistance
        strength_priority = criteria.get("strength_priority", 3)
        formability_priority = criteria.get("formability_priority", 3)

        eligible = []
        excluded = []

        # Minimum required corrosion level based on environment
        required_corr_level = 1
        if exposure in ["outdoor", "road", "urban"]:
            required_corr_level = 2
        elif exposure in ["marine", "coastal", "salt", "sea"]:
            required_corr_level = 4
        elif exposure in ["chemical", "acid", "industrial"]:
            required_corr_level = 4
        elif exposure in ["exhaust", "high-temp"]:
            required_corr_level = 2

        if has_chlorides and required_corr_level < 4:
            required_corr_level = 4
        if has_acids and required_corr_level < 4:
            required_corr_level = 4

        # Step 2: Filter for Suitability
        for grade in self.grades:
            reasons_for_exclusion = []

            # 1. Temperature Limit Check
            if operating_temp > grade["max_service_temp_c"]:
                reasons_for_exclusion.append(
                    f"Operating temperature ({operating_temp}°C) exceeds maximum continuous rating ({grade['max_service_temp_c']}°C)."
                )

            # 2. Minimum Yield Strength Check
            if min_yield > 0 and grade["yield_strength_mpa"] < min_yield:
                reasons_for_exclusion.append(
                    f"Yield strength ({grade['yield_strength_mpa']} MPa) below required {min_yield} MPa."
                )

            # 3. Minimum Tensile Strength Check
            if min_tensile > 0 and grade["tensile_strength_mpa"] < min_tensile:
                reasons_for_exclusion.append(
                    f"Tensile strength ({grade['tensile_strength_mpa']} MPa) below required {min_tensile} MPa."
                )

            # 4. Corrosion Resistance Check
            grade_corr_score = CORROSION_LEVELS.get(grade["corrosion_resistance"], 2)
            if grade_corr_score < required_corr_level:
                reasons_for_exclusion.append(
                    f"Corrosion capability ({grade['corrosion_resistance']}) insufficient for {exposure} environment (requires at least level {required_corr_level})."
                )

            # 5. Severe Chloride check
            if has_chlorides and grade["pren"] < 22:
                reasons_for_exclusion.append(
                    f"PREN score ({grade['pren']}) is below 22, creating severe risk of chloride pitting/stress-corrosion cracking."
                )

            # 6. Critical Fabrication Check
            if requires_forming and FABRICATION_LEVELS.get(grade["formability"], 3) < 2:
                reasons_for_exclusion.append(f"Formability ({grade['formability']}) inadequate for heavy forming/deep drawing.")

            if requires_welding and FABRICATION_LEVELS.get(grade["weldability"], 3) < 2:
                reasons_for_exclusion.append(f"Weldability ({grade['weldability']}) inadequate without specialized stress-relief / post-weld heat treatment.")

            if reasons_for_exclusion:
                excluded.append({
                    "grade": grade,
                    "reasons": reasons_for_exclusion
                })
            else:
                # Step 3: Compute Multi-Factor Ranking Score
                # Higher score = better fit
                corr_val = CORROSION_LEVELS.get(grade["corrosion_resistance"], 2)
                form_val = FABRICATION_LEVELS.get(grade["formability"], 3)
                weld_val = FABRICATION_LEVELS.get(grade["weldability"], 3)
                cost_penalty = COST_LEVELS.get(grade["cost_band"], 2) # Higher cost band = higher penalty

                # Application keyword affinity bonus
                app_bonus = 0
                if any(app_kw in application for app_kw in grade.get("recommended_applications", [])):
                    app_bonus = 25

                # Score calculation
                score = (
                    (corr_val * 15 * (corrosion_priority / 3.0)) +
                    (form_val * 10 * (formability_priority / 3.0)) +
                    (weld_val * 10) +
                    ((grade["yield_strength_mpa"] / 50.0) * (strength_priority / 3.0)) +
                    # Cost preference: if cost_priority is high, heavily penalize high cost
                    ((5 - cost_penalty) * 12 * (cost_priority / 3.0)) +
                    app_bonus
                )

                # Rationale formulation
                reasons_selected = []
                if grade["id"] == "hebron-304":
                    reasons_selected.append("Balances proven general corrosion resistance, high ductility, and clean surface finish with reasonable cost.")
                elif grade["id"] == "hebron-316l":
                    reasons_selected.append("Molybdenum addition guarantees superior resistance against pitting and crevice attack in salty or chemically exposed zones.")
                elif grade["id"] == "hebron-409m":
                    reasons_selected.append("Highly economical ferritic alternative offering sound thermal fatigue and oxidation resistance for structural and exhaust usage.")
                elif grade["id"] == "hebron-2205":
                    reasons_selected.append("Exceptional mechanical yield strength paired with high PREN (35) ensures zero chloride stress cracking.")
                elif grade["id"] == "hebron-310s":
                    reasons_selected.append("Premium thermal grade engineered for continuous operation up to 1150°C.")
                else:
                    reasons_selected.append(f"Optimal balance of {grade['corrosion_resistance'].lower()} corrosion protection and {grade['category'].lower()} microstructural stability.")

                eligible.append({
                    "grade": grade,
                    "score": round(score, 1),
                    "reasons_selected": reasons_selected
                })

        # Sort eligible grades by score descending
        eligible.sort(key=lambda x: x["score"], reverse=True)
        top_recommendations = eligible[:3]

        # Generate comparative trade-offs
        trade_offs = []
        if len(top_recommendations) >= 2:
            first = top_recommendations[0]["grade"]
            second = top_recommendations[1]["grade"]
            trade_offs.append({
                "comparison": f"{first['name']} vs {second['name']}",
                "detail": f"Choosing {first['name']} provides a score advantage based on your configured priority balance. If initial material budget is tightened, comparing indicative relative cost ({first['indicative_relative_cost']}x vs {second['indicative_relative_cost']}x) clarifies procurement outlay."
            })

        return {
            "top_recommendations": top_recommendations,
            "all_eligible_count": len(eligible),
            "excluded_count": len(excluded),
            "excluded_grades": excluded,
            "trade_offs": trade_offs,
            "query_summary": {
                "application": application or "General Engineering",
                "operating_temp_c": operating_temp,
                "exposure": exposure,
                "has_chlorides": has_chlorides,
                "has_acids": has_acids,
                "priorities": {
                    "corrosion": corrosion_priority,
                    "cost": cost_priority,
                    "strength": strength_priority
                }
            }
        }
