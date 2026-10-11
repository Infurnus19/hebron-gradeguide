const API_BASE = window.location.origin.includes("http") ? `${window.location.origin}/api` : "http://127.0.0.1:8000/api";

let currentMode = "guided";
let allGrades = [];
let selectedGradeForEnquiry = null;

document.addEventListener("DOMContentLoaded", async () => {
  await fetchAllGrades();
  runEvaluation();
});

// Switch Between Guided and Engineering Modes
function setMode(mode) {
  currentMode = mode;
  document.getElementById("guidedBtn").classList.toggle("active", mode === "guided");
  document.getElementById("engBtn").classList.toggle("active", mode === "engineering");

  document.getElementById("guidedInputs").style.display = mode === "guided" ? "block" : "none";
  document.getElementById("engineeringInputs").style.display = mode === "engineering" ? "block" : "none";

  runEvaluation();
}

// Navigation Tab Switcher
function switchNav(tab, evt) {
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  if (evt && evt.target) {
    evt.target.classList.add("active");
  } else if (window.event && window.event.target) {
    window.event.target.classList.add("active");
  }

  const heroSec = document.querySelector(".hero-section");
  const modeSec = document.querySelector(".mode-container");
  const selectorGrid = document.querySelector(".main-grid");
  const compareSec = document.getElementById("compareSection");
  const amCadSec = document.getElementById("amCadSection");

  // Reset all primary views
  if (selectorGrid) selectorGrid.style.display = "none";
  if (compareSec) compareSec.style.display = "none";
  if (amCadSec) amCadSec.style.display = "none";

  if (tab === "database") {
    if (heroSec) heroSec.style.display = "none";
    if (modeSec) modeSec.style.display = "none";
    if (compareSec) compareSec.style.display = "block";
    renderMatrixTable();
    updateComparisonGraphs();
  } else if (tab === "am_cad") {
    if (heroSec) heroSec.style.display = "none";
    if (modeSec) modeSec.style.display = "none";
    if (amCadSec) amCadSec.style.display = "block";
    renderAMSection();
  } else if (tab === "enquiry") {
    if (heroSec) heroSec.style.display = "block";
    if (modeSec) modeSec.style.display = "block";
    if (selectorGrid) selectorGrid.style.display = "grid";
    openEnquiryModal();
  } else {
    // "selector" or default
    if (heroSec) heroSec.style.display = "block";
    if (modeSec) modeSec.style.display = "block";
    if (selectorGrid) selectorGrid.style.display = "grid";
  }
}

// Quick prefill for sample applications
function quickFill(app, exposure, temp) {
  document.getElementById("appInput").value = app;
  document.getElementById("exposureSelect").value = exposure;
  document.getElementById("tempInput").value = temp;

  if (exposure === "marine") {
    document.getElementById("chkChloride").checked = true;
  } else {
    document.getElementById("chkChloride").checked = false;
  }

  runEvaluation();
}

async function fetchAllGrades() {
  try {
    const res = await fetch(`${API_BASE}/grades`);
    const data = await res.json();
    allGrades = data.grades;
    populateEnquiryGradeDropdown();
    populateCompareDropdowns();
  } catch (err) {
    console.error("Backend offline, using fallback data", err);
  }
}

function populateEnquiryGradeDropdown() {
  const sel = document.getElementById("enqGrade");
  if (!sel) return;
  sel.innerHTML = "";
  allGrades.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = `${g.name} (${g.category}) - ${g.standard_designation}`;
    sel.appendChild(opt);
  });
}

// Natural language understanding trigger
async function analyzeNaturalLanguage() {
  const prompt = document.getElementById("appInput").value;
  try {
    const res = await fetch(`${API_BASE}/natural-language-parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const parsed = await res.json();
    
    document.getElementById("exposureSelect").value = parsed.exposure;
    document.getElementById("tempInput").value = parsed.operating_temp_c;
    document.getElementById("chkChloride").checked = parsed.has_chlorides;
    document.getElementById("chkAcid").checked = parsed.has_acids;
    document.getElementById("prioCost").value = parsed.cost_priority;
    document.getElementById("prioCorrosion").value = parsed.corrosion_priority;

    runEvaluation();
  } catch (err) {
    console.error("NLP error", err);
    runEvaluation();
  }
}

// Core Evaluation & Recommendation Trigger
async function runEvaluation() {
  // Update priority value badges
  const prioCorr = parseInt(document.getElementById("prioCorrosion").value);
  const prioCost = parseInt(document.getElementById("prioCost").value);
  const prioStrength = parseInt(document.getElementById("prioStrength").value);

  document.getElementById("valCorrosion").textContent = prioCorr;
  document.getElementById("valCost").textContent = prioCost;
  document.getElementById("valStrength").textContent = prioStrength;

  let payload = {
    mode: currentMode,
    cost_priority: prioCost,
    corrosion_priority: prioCorr,
    strength_priority: prioStrength
  };

  if (currentMode === "guided") {
    payload.application = document.getElementById("appInput").value || "General Engineering";
    payload.exposure = document.getElementById("exposureSelect").value;
    payload.operating_temp_c = parseFloat(document.getElementById("tempInput").value) || 25;
    payload.has_chlorides = document.getElementById("chkChloride").checked;
    payload.has_acids = document.getElementById("chkAcid").checked;
    payload.requires_forming = document.getElementById("chkForming").checked;
    payload.requires_welding = document.getElementById("chkWelding").checked;
  } else {
    payload.application = "Precision Engineering Spec";
    payload.min_yield_mpa = parseFloat(document.getElementById("minYieldInput").value) || 0;
    payload.min_tensile_mpa = parseFloat(document.getElementById("minTensileInput").value) || 0;
    payload.operating_temp_c = parseFloat(document.getElementById("engTempInput").value) || 25;
    payload.exposure = "outdoor";
  }

  try {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    renderRecommendations(result);
  } catch (err) {
    console.error("Evaluation request error:", err);
  }
}

// Render Top 3 Shortlist & Trade-Offs
function renderRecommendations(result) {
  const container = document.getElementById("recommendationCards");
  container.innerHTML = "";

  const status = document.getElementById("statusSummary");
  status.textContent = `${result.all_eligible_count} suitable matches identified (${result.excluded_count} excluded)`;

  if (result.top_recommendations.length === 0) {
    container.innerHTML = `
      <div class="card" style="border-left: 4px solid var(--accent-red);">
        <h3>No Direct Standard Grade Qualifies</h3>
        <p style="color: var(--text-muted); margin-top: 0.5rem;">The combination of operating temperature, mechanical strength, and corrosive attack exceeds standard catalog parameters. We recommend an <strong>Expert Review</strong> with Hebron Technical Engineering.</p>
        <button class="btn btn-outline" style="margin-top: 1rem;" onclick="openEnquiryModal()">Request Custom Metallurgy Consultation</button>
      </div>
    `;
    return;
  }

  result.top_recommendations.forEach((item, index) => {
    const grade = item.grade;
    const isTop = index === 0;

    const card = document.createElement("div");
    card.className = `grade-card ${isTop ? "top-rank" : ""}`;

    card.innerHTML = `
      <div class="grade-card-top">
        <div class="grade-title-group">
          <span class="grade-rank-badge">#0${index + 1}</span>
          <h3 class="grade-title">${grade.name}</h3>
          <span class="grade-standard">${grade.standard_designation}</span>
        </div>
        <span class="grade-category-tag">${grade.category}</span>
      </div>

      <p class="grade-desc">${grade.description}</p>

      <div class="spec-grid">
        <div class="spec-cell">
          <div class="spec-label">Corrosion</div>
          <div class="spec-val highlight-green">${grade.corrosion_resistance}</div>
        </div>
        <div class="spec-cell">
          <div class="spec-label">Formability</div>
          <div class="spec-val">${grade.formability}</div>
        </div>
        <div class="spec-cell">
          <div class="spec-label">Weldability</div>
          <div class="spec-val">${grade.weldability}</div>
        </div>
        <div class="spec-cell">
          <div class="spec-label">Cost Band</div>
          <div class="spec-val">${grade.cost_band}</div>
        </div>
      </div>

      <div class="grade-rationale">
        <strong>Why selected:</strong> ${item.reasons_selected.join(" ")}
      </div>

      <div class="grade-actions">
        <div class="limitations-text">
          ⚠️ <strong>Operational Limit:</strong> ${grade.limitations}
        </div>
        <button class="btn btn-primary" onclick="selectForEnquiry('${grade.id}')">Select Grade</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Render Dynamic Trade-offs
  const tradeBox = document.getElementById("dynamicTradeOffs");
  tradeBox.innerHTML = "";
  if (result.trade_offs && result.trade_offs.length > 0) {
    result.trade_offs.forEach(t => {
      const p = document.createElement("p");
      p.innerHTML = `<strong>${t.comparison}:</strong> ${t.detail}`;
      tradeBox.appendChild(p);
    });
  } else {
    tradeBox.innerHTML = "<p>Standard single grade dominantly matches the stated environment.</p>";
  }

  // Render Excluded Breakdown
  document.getElementById("excludedCount").textContent = result.excluded_count;
  const excList = document.getElementById("excludedList");
  excList.innerHTML = "";
  result.excluded_grades.forEach(item => {
    const d = document.createElement("div");
    d.className = "excluded-item";
    d.innerHTML = `
      <strong>${item.grade.name} (${item.grade.standard_designation})</strong>
      <ul>
        ${item.reasons.map(r => `<li>${r}</li>`).join("")}
      </ul>
    `;
    excList.appendChild(d);
  });
}

let stressStrainChartInstance = null;
let radarChartInstance = null;

// Initialize & populate compare grade selectors
function populateCompareDropdowns() {
  const selA = document.getElementById("compareGradeA");
  const selB = document.getElementById("compareGradeB");
  if (!selA || !selB || allGrades.length === 0) return;

  selA.innerHTML = "";
  selB.innerHTML = "";

  allGrades.forEach(g => {
    const optA = document.createElement("option");
    optA.value = g.id;
    optA.textContent = `${g.name} (${g.category}) - PREN ${g.pren}`;
    selA.appendChild(optA);

    const optB = document.createElement("option");
    optB.value = g.id;
    optB.textContent = `${g.name} (${g.category}) - PREN ${g.pren}`;
    selB.appendChild(optB);
  });

  // Default to Hebron 304 vs Hebron 316L (or 2205)
  if (allGrades.length >= 2) {
    selA.value = "hebron-304";
    selB.value = "hebron-316l";
  }
}

// Generate Stress-Strain Data Points using Ramberg-Osgood Formulation
function generateStressStrainCurve(grade) {
  // Elastic Modulus E ≈ 200,000 MPa for Stainless Steel
  const E = 195000;
  const Rp02 = grade.yield_strength_mpa;
  const Rm = grade.tensile_strength_mpa;
  const totalElongation = (grade.elongation_pct || 40) / 100.0;
  
  // Ramberg-Osgood exponent n (Austenitic ~ 6-8, Duplex ~ 8-10, Ferritic ~ 12-16)
  let n = 7;
  if (grade.category === "Ferritic") n = 14;
  else if (grade.category === "Duplex") n = 9;
  else if (grade.category === "Martensitic") n = 12;

  const points = [];
  const steps = 40;
  const maxStress = Rm;

  for (let i = 0; i <= steps; i++) {
    const stress = (maxStress * i) / steps;
    // epsilon = sigma / E + 0.002 * (sigma / Rp02)^n
    let plasticStrain = 0.002 * Math.pow(stress / Rp02, n);
    // limit strain to rupture
    if (plasticStrain > totalElongation) {
      plasticStrain = totalElongation;
    }
    const totalStrain = (stress / E) + plasticStrain;
    points.push({
      x: parseFloat((totalStrain * 100).toFixed(2)), // Strain in %
      y: Math.round(stress) // Stress in MPa
    });
  }

  // Ensure fracture point terminates at elongation
  points.push({
    x: grade.elongation_pct,
    y: Math.round(Rm * 0.95)
  });

  return points;
}

// Convert qualitative ratings to radar scale (0 to 100)
function getGradeRadarMetrics(g) {
  const corrMap = { "Low": 25, "Moderate": 50, "High": 75, "Very High": 90, "Extreme": 100 };
  const formMap = { "Poor": 20, "Fair": 40, "Moderate": 60, "Good": 80, "Excellent": 100 };
  const costMap = { "Low": 95, "Medium": 70, "High": 45, "Premium": 25 }; // Economy rating

  return [
    Math.min(100, Math.round((g.yield_strength_mpa / 550) * 100)), // Strength
    corrMap[g.corrosion_resistance] || 50,                         // Corrosion Resistance
    Math.min(100, Math.round((g.max_service_temp_c / 1150) * 100)),// Thermal Capability
    formMap[g.formability] || 60,                                  // Formability
    costMap[g.cost_band] || 50                                     // Economic Advantage
  ];
}

// Update Comparison Graphs & Metrics
function updateComparisonGraphs() {
  const idA = document.getElementById("compareGradeA").value;
  const idB = document.getElementById("compareGradeB").value;

  const gradeA = allGrades.find(g => g.id === idA) || allGrades[0];
  const gradeB = allGrades.find(g => g.id === idB) || allGrades[1];

  // Render Side-by-Side Spec Summary
  const metricsBox = document.getElementById("compareMetricsGrid");
  if (metricsBox) {
    metricsBox.innerHTML = `
      <div class="compare-spec-card card-a">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h3 style="color: #38bdf8; font-size: 1.25rem;">${gradeA.name}</h3>
          <span style="font-size: 0.8rem; color: var(--text-dim);">${gradeA.category}</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.35rem 0;">${gradeA.standard_designation}</p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 0.75rem; text-align: center;">
          <div style="background: var(--bg-card); padding: 0.4rem; border-radius: 4px;">
            <div style="font-size: 0.7rem; color: var(--text-dim);">Yield Strength</div>
            <div style="font-weight: 700; color: #fff;">${gradeA.yield_strength_mpa} MPa</div>
          </div>
          <div style="background: var(--bg-card); padding: 0.4rem; border-radius: 4px;">
            <div style="font-size: 0.7rem; color: var(--text-dim);">Tensile (Rm)</div>
            <div style="font-weight: 700; color: #fff;">${gradeA.tensile_strength_mpa} MPa</div>
          </div>
          <div style="background: var(--bg-card); padding: 0.4rem; border-radius: 4px;">
            <div style="font-size: 0.7rem; color: var(--text-dim);">Elongation</div>
            <div style="font-weight: 700; color: #fff;">${gradeA.elongation_pct}%</div>
          </div>
        </div>
      </div>

      <div class="compare-spec-card card-b">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h3 style="color: #f97316; font-size: 1.25rem;">${gradeB.name}</h3>
          <span style="font-size: 0.8rem; color: var(--text-dim);">${gradeB.category}</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.35rem 0;">${gradeB.standard_designation}</p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 0.75rem; text-align: center;">
          <div style="background: var(--bg-card); padding: 0.4rem; border-radius: 4px;">
            <div style="font-size: 0.7rem; color: var(--text-dim);">Yield Strength</div>
            <div style="font-weight: 700; color: #fff;">${gradeB.yield_strength_mpa} MPa</div>
          </div>
          <div style="background: var(--bg-card); padding: 0.4rem; border-radius: 4px;">
            <div style="font-size: 0.7rem; color: var(--text-dim);">Tensile (Rm)</div>
            <div style="font-weight: 700; color: #fff;">${gradeB.tensile_strength_mpa} MPa</div>
          </div>
          <div style="background: var(--bg-card); padding: 0.4rem; border-radius: 4px;">
            <div style="font-size: 0.7rem; color: var(--text-dim);">Elongation</div>
            <div style="font-weight: 700; color: #fff;">${gradeB.elongation_pct}%</div>
          </div>
        </div>
      </div>
    `;
  }

  // 1. Render Stress-Strain Line Chart
  const ctxSS = document.getElementById("stressStrainChart").getContext("2d");
  const curveA = generateStressStrainCurve(gradeA);
  const curveB = generateStressStrainCurve(gradeB);

  if (stressStrainChartInstance) {
    stressStrainChartInstance.destroy();
  }

  stressStrainChartInstance = new Chart(ctxSS, {
    type: 'line',
    data: {
      datasets: [
        {
          label: `${gradeA.name} (Yield: ${gradeA.yield_strength_mpa} MPa, UTS: ${gradeA.tensile_strength_mpa} MPa)`,
          data: curveA,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          fill: false
        },
        {
          label: `${gradeB.name} (Yield: ${gradeB.yield_strength_mpa} MPa, UTS: ${gradeB.tensile_strength_mpa} MPa)`,
          data: curveB,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.25,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Engineering Strain ε (%)',
            color: '#94a3b8'
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          title: {
            display: true,
            text: 'Engineering Stress σ (MPa)',
            color: '#94a3b8'
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label.split(' ')[0]}: ${ctx.parsed.y} MPa @ ${ctx.parsed.x}% strain`
          }
        }
      }
    }
  });

  // 2. Render Radar Comparison Chart
  const ctxRadar = document.getElementById("radarChart").getContext("2d");
  const radarA = getGradeRadarMetrics(gradeA);
  const radarB = getGradeRadarMetrics(gradeB);

  if (radarChartInstance) {
    radarChartInstance.destroy();
  }

  radarChartInstance = new Chart(ctxRadar, {
    type: 'radar',
    data: {
      labels: ['Mechanical Strength', 'Corrosion Defense', 'Thermal Limit', 'Formability', 'Economic Advantage'],
      datasets: [
        {
          label: gradeA.name,
          data: radarA,
          backgroundColor: 'rgba(56, 189, 248, 0.25)',
          borderColor: '#38bdf8',
          pointBackgroundColor: '#38bdf8',
          borderWidth: 2
        },
        {
          label: gradeB.name,
          data: radarB,
          backgroundColor: 'rgba(249, 115, 22, 0.25)',
          borderColor: '#f97316',
          pointBackgroundColor: '#f97316',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          pointLabels: {
            color: '#cbd5e1',
            font: { size: 11, weight: '600' }
          },
          ticks: { display: false, maxTicksLimit: 5 },
          suggestedMin: 0,
          suggestedMax: 100
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

// Render Grade Matrix Table
function renderMatrixTable() {
  const tbody = document.getElementById("matrixTableBody");
  tbody.innerHTML = "";
  allGrades.forEach(g => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${g.name}</strong></td>
      <td>${g.category}</td>
      <td>${g.yield_strength_mpa}</td>
      <td>${g.tensile_strength_mpa}</td>
      <td>${g.max_service_temp_c}°C</td>
      <td><strong>${g.pren}</strong></td>
      <td>${g.corrosion_resistance}</td>
      <td>${g.formability}</td>
      <td>${g.cost_band}</td>
      <td><span style="font-family: monospace; font-size: 0.78rem;">${g.test_standards}</span></td>
      <td>
        <button class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="setComparisonPair('${g.id}')">Compare</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setComparisonPair(gradeId) {
  const selB = document.getElementById("compareGradeB");
  if (selB) {
    selB.value = gradeId;
    updateComparisonGraphs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}


// Sales Enquiry Handling
function openEnquiryModal() {
  document.getElementById("enquiryModal").classList.add("show");
  document.getElementById("enquiryForm").style.display = "block";
  document.getElementById("enquirySuccess").style.display = "none";
}

function closeEnquiryModal() {
  document.getElementById("enquiryModal").classList.remove("show");
}

function selectForEnquiry(gradeId) {
  document.getElementById("enqGrade").value = gradeId;
  openEnquiryModal();
}

async function submitEnquiry(e) {
  e.preventDefault();
  const payload = {
    customer_name: document.getElementById("enqName").value,
    company: document.getElementById("enqCompany").value,
    email: document.getElementById("enqEmail").value,
    phone: document.getElementById("enqPhone").value,
    selected_grade_id: document.getElementById("enqGrade").value,
    application: document.getElementById("appInput").value || "Fabrication",
    product_form: document.getElementById("enqForm").value,
    quantity_tons: parseFloat(document.getElementById("enqQty").value) || 5,
    thickness_mm: parseFloat(document.getElementById("enqThickness").value) || null,
    notes: document.getElementById("enqNotes").value
  };

  try {
    const res = await fetch(`${API_BASE}/enquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    document.getElementById("enquiryForm").style.display = "none";
    const succ = document.getElementById("enquirySuccess");
    succ.style.display = "block";
    document.getElementById("enquiryRefText").textContent = `Dossier Reference ID: ${data.reference_id} has been transmitted to ${data.commercial_channel}.`;
    document.getElementById("enquiryDetailsJson").textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    alert("Error sending enquiry: " + err.message);
  }
}

// ==========================================
// 3D PRINTING & CAD SERVICES CONTROLLER
// ==========================================
let allAMMaterials = [];
let currentUploadedCAD = "impeller_bracket_rev2.step";

async function fetchAMMaterials() {
  try {
    const res = await fetch(`${API_BASE}/am-materials`);
    const data = await res.json();
    allAMMaterials = data.materials;
    populateAMDropdown();
  } catch (err) {
    console.error("Error fetching AM materials:", err);
  }
}

function populateAMDropdown() {
  const sel = document.getElementById("amMaterialSelect");
  if (!sel || allAMMaterials.length === 0) return;
  sel.innerHTML = "";
  allAMMaterials.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.category}) - $${m.indicative_cost_per_cc}/cc`;
    sel.appendChild(opt);
  });
  if (allAMMaterials.length > 0) {
    sel.value = allAMMaterials[0].id;
    updateAMMaterialSpotlight(allAMMaterials[0]);
  }
}

function onAMMaterialChange() {
  const selId = document.getElementById("amMaterialSelect").value;
  const mat = allAMMaterials.find(m => m.id === selId);
  if (mat) {
    updateAMMaterialSpotlight(mat);
    recalculateAMQuote();
  }
}

function updateAMMaterialSpotlight(mat) {
  const spotlight = document.getElementById("amMaterialSpotlight");
  if (!spotlight) return;

  spotlight.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
      <div>
        <span class="am-tech-badge">${mat.technology}</span>
        <h3 style="color: #fff; font-size: 1.25rem;">${mat.name}</h3>
      </div>
      <span style="font-family: var(--font-mono); font-size: 0.85rem; color: #a855f7;">${mat.standard_designation}</span>
    </div>
    <p style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.85rem;">${mat.description}</p>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; background: var(--bg-primary); padding: 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center; margin-bottom: 0.85rem;">
      <div>
        <div style="font-size: 0.7rem; color: var(--text-dim);">Yield (HT)</div>
        <div style="font-weight: 700; color: #fff;">${mat.heat_treated_yield_mpa} MPa</div>
      </div>
      <div>
        <div style="font-size: 0.7rem; color: var(--text-dim);">Tensile</div>
        <div style="font-weight: 700; color: #fff;">${mat.tensile_strength_mpa} MPa</div>
      </div>
      <div>
        <div style="font-size: 0.7rem; color: var(--text-dim);">Density</div>
        <div style="font-weight: 700; color: #fff;">${mat.density_g_cm3} g/cc</div>
      </div>
      <div>
        <div style="font-size: 0.7rem; color: var(--text-dim);">Min Wall</div>
        <div style="font-weight: 700; color: #fff;">${mat.min_wall_thickness_mm} mm</div>
      </div>
    </div>

    <div style="font-size: 0.8rem; color: var(--text-muted);">
      <strong>Post-processing pathways:</strong> ${mat.post_processing.join(", ")}
    </div>
  `;
}

function renderAMSection() {
  if (allAMMaterials.length === 0) {
    fetchAMMaterials().then(() => {
      renderAMCardsGrid();
      recalculateAMQuote();
    });
  } else {
    renderAMCardsGrid();
    recalculateAMQuote();
  }
}

function renderAMCardsGrid() {
  const container = document.getElementById("amMaterialsCardsGrid");
  if (!container || allAMMaterials.length === 0) return;
  container.innerHTML = "";

  allAMMaterials.forEach(m => {
    const card = document.createElement("div");
    card.className = "am-mat-card";
    card.innerHTML = `
      <div>
        <span class="am-tech-badge">${m.technology}</span>
        <h4 style="font-size: 1.05rem; color: #fff; margin-bottom: 0.25rem;">${m.name}</h4>
        <span style="font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 0.5rem;">${m.standard_designation}</span>
        <p style="font-size: 0.82rem; color: #94a3b8; line-height: 1.4; margin-bottom: 0.75rem;">${m.description}</p>
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.65rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
          <span style="color: var(--text-dim);">Rate: <strong>$${m.indicative_cost_per_cc}/cc</strong></span>
          <span style="color: #c084fc;">Lead Time: <strong>${m.lead_time_days}</strong></span>
        </div>
        <button class="btn btn-outline btn-block" style="font-size: 0.8rem; padding: 0.4rem;" onclick="selectAMMaterialForQuote('${m.id}')">Select for CAD Quote</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function selectAMMaterialForQuote(matId) {
  const sel = document.getElementById("amMaterialSelect");
  if (sel) {
    sel.value = matId;
    onAMMaterialChange();
    document.querySelector(".am-grid").scrollIntoView({ behavior: 'smooth' });
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  currentUploadedCAD = file.name;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

  document.getElementById("dropzoneText").style.display = "none";
  const badge = document.getElementById("fileLoadedBadge");
  badge.style.display = "inline-block";
  document.getElementById("loadedFileName").textContent = file.name;
  document.getElementById("loadedFileSize").textContent = `${sizeMB} MB`;

  document.getElementById("cadModalFileName").value = file.name;
}

function recalculateAMQuote() {
  const selId = document.getElementById("amMaterialSelect").value;
  const mat = allAMMaterials.find(m => m.id === selId) || allAMMaterials[0];
  if (!mat) return;

  const vol = parseFloat(document.getElementById("amVolumeInput").value) || 20;
  const qty = parseInt(document.getElementById("amQtyInput").value) || 1;

  let postProcSurcharge = 0;
  if (document.getElementById("chkHIP").checked) postProcSurcharge += 35;
  if (document.getElementById("chkStressRelief").checked) postProcSurcharge += 15;
  if (document.getElementById("chkCNCPost").checked) postProcSurcharge += 45;
  if (document.getElementById("chkSurfacePolish").checked) postProcSurcharge += 10;

  const unitCost = (vol * mat.indicative_cost_per_cc) + postProcSurcharge;
  const setupFee = 45.0;
  const total = Math.round(((unitCost * qty) + setupFee) * 100) / 100;
  const perPart = Math.round((total / qty) * 100) / 100;

  document.getElementById("amTotalEst").textContent = `$${total.toFixed(2)}`;
  document.getElementById("amUnitBreakdown").textContent = `$${perPart.toFixed(2)} / part • Lead time: ${mat.lead_time_days}`;
}

// CAD Quote Modal Actions
function openCADQuoteModal() {
  document.getElementById("cadQuoteModal").classList.add("show");
  document.getElementById("cadQuoteForm").style.display = "block";
  document.getElementById("cadQuoteSuccess").style.display = "none";
  document.getElementById("cadModalFileName").value = currentUploadedCAD;
}

function closeCADQuoteModal() {
  document.getElementById("cadQuoteModal").classList.remove("show");
}

async function submitCADQuote(e) {
  e.preventDefault();
  const selId = document.getElementById("amMaterialSelect").value;
  const postProcList = [];
  if (document.getElementById("chkHIP").checked) postProcList.push("Hot Isostatic Pressing (HIP)");
  if (document.getElementById("chkStressRelief").checked) postProcList.push("Stress-Relief Anneal");
  if (document.getElementById("chkCNCPost").checked) postProcList.push("CNC Mating Surface Machining");
  if (document.getElementById("chkSurfacePolish").checked) postProcList.push("Bead Blasting / Polishing");

  const payload = {
    client_name: document.getElementById("cadClientName").value,
    organization: document.getElementById("cadOrg").value,
    email: document.getElementById("cadEmail").value,
    phone: document.getElementById("cadPhone").value,
    service_type: document.getElementById("cadServiceType").value,
    material_id: selId,
    estimated_volume_cc: parseFloat(document.getElementById("amVolumeInput").value) || 20,
    quantity_parts: parseInt(document.getElementById("amQtyInput").value) || 1,
    post_processing: postProcList,
    cad_filename: currentUploadedCAD,
    notes: document.getElementById("cadNotes").value
  };

  try {
    const res = await fetch(`${API_BASE}/cad-quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    document.getElementById("cadQuoteForm").style.display = "none";
    const succ = document.getElementById("cadQuoteSuccess");
    succ.style.display = "block";
    document.getElementById("cadQuoteRefText").textContent = `Dossier Reference ID: ${data.quote_reference} generated for ${data.service_division}.`;
    document.getElementById("cadQuoteDetailsJson").textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    alert("Error submitting CAD quote: " + err.message);
  }
}

// CAD Design & Modeling Contact Actions
function openCADContactModal() {
  const modal = document.getElementById("cadContactModal");
  if (!modal) return;
  modal.classList.add("show");
  document.getElementById("cadContactForm").style.display = "block";
  document.getElementById("cadContactSuccess").style.display = "none";
}

function closeCADContactModal() {
  const modal = document.getElementById("cadContactModal");
  if (modal) modal.classList.remove("show");
}

async function submitCADContact(e) {
  e.preventDefault();
  const payload = {
    client_name: document.getElementById("contactClientName").value,
    organization: document.getElementById("contactOrg").value,
    email: document.getElementById("contactEmail").value,
    phone: document.getElementById("contactPhone").value,
    design_scope: document.getElementById("contactDesignScope").value,
    timeline: document.getElementById("contactTimeline").value,
    project_brief: document.getElementById("contactBrief").value
  };

  try {
    const res = await fetch(`${API_BASE}/cad-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    document.getElementById("cadContactForm").style.display = "none";
    const succ = document.getElementById("cadContactSuccess");
    succ.style.display = "block";
    document.getElementById("cadContactRefText").textContent = `Inquiry Reference ID: ${data.reference_id} created for ${data.service_division}.`;
    document.getElementById("cadContactDetailsJson").textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    alert("Error sending CAD consultation request: " + err.message);
  }
}
