const wizardData = {
  business: {},
  feedstocks: [],
  properties: {},
  availability: {}
}
let currentStep = 1
let activePropertiesTab = 0
let activeAvailabilityTab = 0

function showStep(n) {
  document.querySelectorAll('.wizard-panel').forEach(function(p) {
    p.classList.remove('active')
  })
  document.getElementById('step-' + n).classList.add('active')
  document.querySelectorAll('.wizard-step-dot').forEach(function(dot) {
    const s = parseInt(dot.dataset.step)
    dot.classList.remove('active', 'complete')
    if (s === n) dot.classList.add('active')
    if (s < n) dot.classList.add('complete')
  })
  currentStep = n
  saveDraft()
  window.scrollTo({ top: document.getElementById('apply-wizard').offsetTop - 80, behavior: 'smooth' })
}

function saveDraft() {
  try {
    localStorage.setItem('biochar_wizard_draft', JSON.stringify({
      wizardData: wizardData,
      currentStep: currentStep,
      savedAt: new Date().toISOString()
    }));
  } catch(e) {}
}

function loadDraft() {
  try {
    var raw = localStorage.getItem('biochar_wizard_draft');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function clearDraft() {
  try { localStorage.removeItem('biochar_wizard_draft'); } catch(e) {}
}

function validateStep1() {
  const required = ['w-businessName','w-contactName','w-email','w-state','w-zipcode','w-ein','w-years','w-equipment','w-capacity']
  let valid = true
  required.forEach(function(id) {
    const el = document.getElementById(id)
    if (!el || !el.value.trim()) {
      el.style.borderColor = '#C0392B'
      valid = false
    } else {
      el.style.borderColor = ''
    }
  })
  return valid
}

function saveStep1() {
  wizardData.business = {
    businessName: document.getElementById('w-businessName').value.trim(),
    contactName: document.getElementById('w-contactName').value.trim(),
    email: document.getElementById('w-email').value.trim(),
    state: document.getElementById('w-state').value,
    zipcode: document.getElementById('w-zipcode').value.trim(),
    ein: document.getElementById('w-ein').value.trim(),
    businessWebsite: document.getElementById('w-website').value.trim(),
    yearsInOperation: document.getElementById('w-years').value,
    equipmentType: document.getElementById('w-equipment').value,
    pyroTech: document.getElementById('w-equipment').value,
    annualCapacity: document.getElementById('w-capacity').value
  }
}

function validateStep2() {
  const checked = document.querySelectorAll('input[name="feedstocks"]:checked')
  if (checked.length === 0) {
    document.getElementById('feedstock-error').style.display = 'block'
    return false
  }
  document.getElementById('feedstock-error').style.display = 'none'
  wizardData.feedstocks = Array.from(checked).map(function(c) { return c.value })
  return true
}

function buildPropertiesTabs() {
  const tabsEl = document.getElementById('properties-tabs')
  const panelsEl = document.getElementById('properties-panels')
  tabsEl.innerHTML = ''
  panelsEl.innerHTML = ''

  wizardData.feedstocks.forEach(function(feedstock, i) {
    const tab = document.createElement('button')
    tab.className = 'feedstock-tab' + (i === 0 ? ' active' : '')
    tab.textContent = feedstock
    tab.dataset.index = i
    tab.addEventListener('click', function() {
      document.querySelectorAll('#properties-tabs .feedstock-tab').forEach(function(t) { t.classList.remove('active') })
      document.querySelectorAll('#properties-panels .feedstock-tab-panel').forEach(function(p) { p.classList.remove('active') })
      tab.classList.add('active')
      document.getElementById('props-panel-' + i).classList.add('active')
      activePropertiesTab = i
    })
    tabsEl.appendChild(tab)

    if (!wizardData.properties[feedstock]) wizardData.properties[feedstock] = {}

    const panel = document.createElement('div')
    panel.className = 'feedstock-tab-panel' + (i === 0 ? ' active' : '')
    panel.id = 'props-panel-' + i
    panel.innerHTML =
      '<div class="completeness-bar">' +
        '<span style="font-size:var(--font-size-sm);color:var(--color-text-muted)">Profile completeness:</span>' +
        '<div class="completeness-track"><div class="completeness-fill" id="completeness-fill-' + i + '" style="width:0%"></div></div>' +
        '<span class="completeness-label" id="completeness-label-' + i + '">0% complete</span>' +
      '</div>' +

      '<div class="wizard-notice wizard-notice-accent" style="margin-bottom:var(--space-5)">' +
        '<span>📊</span>' +
        '<p>Listings with complete lab data appear higher in search results and receive up to 3x more buyer inquiries. If you have a lab report upload it below — buyers can download it directly from your listing.</p>' +
      '</div>' +

      '<details style="margin-bottom:var(--space-5);background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4)">' +
        '<summary style="font-size:var(--font-size-sm);font-weight:600;cursor:pointer;color:var(--color-accent)">🔬 Where do I get lab data?</summary>' +
        '<div style="margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--color-text-secondary);line-height:1.7">' +
          '<p style="margin-bottom:var(--space-2)">These labs are commonly used by US biochar producers:</p>' +
          '<ul style="margin:0;padding-left:var(--space-5);display:grid;gap:var(--space-2)">' +
            '<li><strong>A&amp;L Western Laboratories</strong> — <a href="https://www.al-labs-west.com" target="_blank" style="color:var(--color-accent)">al-labs-west.com</a> · Full biochar panel ~$80–120</li>' +
            '<li><strong>Waypoint Analytical</strong> — <a href="https://www.waypointanalytical.com" target="_blank" style="color:var(--color-accent)">waypointanalytical.com</a> · Ag-focused, fast turnaround</li>' +
            '<li><strong>Soil Control Lab</strong> — <a href="https://www.soilcontrollab.com" target="_blank" style="color:var(--color-accent)">soilcontrollab.com</a> · California-based, biochar-familiar</li>' +
            '<li><strong>Cornell Nutrient Analysis Lab</strong> — <a href="https://cnal.cals.cornell.edu" target="_blank" style="color:var(--color-accent)">cnal.cals.cornell.edu</a> · Research-grade, IBI-aligned panel</li>' +
          '</ul>' +
          '<p style="margin-top:var(--space-3);color:var(--color-text-muted)">Tip: Request a biochar-specific panel that includes carbon content, pH, surface area, ash content, EC, and particle size. Standard soil panels will not cover all fields.</p>' +
        '</div>' +
      '</details>' +

      '<div class="lab-fields-grid">' +

        '<div class="form-group">' +
          '<label for="carbon-' + i + '">Carbon content (%) <span class="required-star">*</span></label>' +
          '<p class="field-hint">Above 70% qualifies for carbon credit programs.</p>' +
          '<input type="number" id="carbon-' + i + '" min="0" max="100" step="0.1" placeholder="e.g. 75" required>' +
        '</div>' +

        '<div class="form-group">' +
          '<label for="ph-' + i + '">pH <span class="required-star">*</span></label>' +
          '<p class="field-hint">Above 7 raises soil pH. Beneficial for acidic soils.</p>' +
          '<input type="number" id="ph-' + i + '" min="0" max="14" step="0.1" placeholder="e.g. 8.2" required>' +
        '</div>' +

        '<div class="form-group">' +
          '<label for="moisture-' + i + '" class="lab-field-required">Moisture (%) <span class="required-star">*</span></label>' +
          '<p class="field-hint">Below 15% preferred for handling and storage.</p>' +
          '<input type="number" id="moisture-' + i + '" min="0" max="100" step="0.1" placeholder="e.g. 8">' +
        '</div>' +

        '<div class="form-group">' +
          '<label for="surface-' + i + '" class="lab-field-optional">Surface area (m²/g)</label>' +
          '<p class="field-hint">Above 400 is excellent for water retention.</p>' +
          '<input type="number" id="surface-' + i + '" min="0" step="1" placeholder="e.g. 420">' +
        '</div>' +

        '<div class="form-group">' +
          '<label for="particle-' + i + '" class="lab-field-optional">Particle size (mm)</label>' +
          '<p class="field-hint">1–4mm is versatile. Finer for vegetables, coarser for orchards.</p>' +
          '<input type="number" id="particle-' + i + '" min="0" step="0.1" placeholder="e.g. 2">' +
        '</div>' +

        '<div class="form-group">' +
          '<label for="ash-' + i + '" class="lab-field-optional">Ash content (%)</label>' +
          '<p class="field-hint">Below 20% indicates high-carbon biochar.</p>' +
          '<input type="number" id="ash-' + i + '" min="0" max="100" step="0.1" placeholder="e.g. 12">' +
        '</div>' +

        '<div class="form-group">' +
          '<label for="ec-' + i + '" class="lab-field-optional">Electrical conductivity (dS/m)</label>' +
          '<p class="field-hint">Below 2 is ideal for most crops.</p>' +
          '<input type="number" id="ec-' + i + '" min="0" step="0.01" placeholder="e.g. 0.8">' +
        '</div>' +

        '<div class="form-group">' +
          '<label>Lab verified</label>' +
          '<p class="field-hint">Check if values come from a certified lab report.</p>' +
          '<div class="checkbox-group">' +
            '<label><input type="checkbox" id="labverified-' + i + '"> Values are from a certified lab report</label>' +
          '</div>' +
        '</div>' +

      '</div>' +

      '<div class="lab-fields-grid">' +
        '<div class="form-group">' +
          '<label for="labreportdate-' + i + '">Lab report date <span class="required-star">*</span></label>' +
          '<input type="date" id="labreportdate-' + i + '" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="labreport-' + i + '">Upload lab report <span class="required-star">*</span></label>' +
          '<p class="field-hint">PDF, JPG, or PNG. Max 5MB.</p>' +
          '<input type="file" id="labreport-' + i + '" accept=".pdf,.jpg,.jpeg,.png">' +
          '<div id="labreport-filename-' + i + '" style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)"></div>' +
        '</div>' +
      '</div>' +

      '<div class="form-group">' +
        '<label>Certifications held for this feedstock</label>' +
        '<div class="checkbox-group" id="certs-' + i + '">' +
          '<label><input type="checkbox" value="OMRI Listed" name="cert-' + i + '"> OMRI Listed</label>' +
          '<label><input type="checkbox" value="IBI Certified" name="cert-' + i + '"> IBI Certified</label>' +
          '<label><input type="checkbox" value="California Organic" name="cert-' + i + '"> California Organic</label>' +
        '</div>' +
      '</div>' +

      '<div class="form-group">' +
        '<label for="certdocs-' + i + '">Upload certification documents</label>' +
        '<p class="field-hint">Upload OMRI, IBI, or CDFA certificate PDFs. Max 5MB per file.</p>' +
        '<input type="file" id="certdocs-' + i + '" accept=".pdf,.jpg,.jpeg,.png" multiple>' +
      '</div>'

    const allInputs = panel.querySelectorAll('input, select')
    allInputs.forEach(function(input) {
      input.addEventListener('input', function() { updateCompleteness(i, feedstock) })
      input.addEventListener('change', function() { updateCompleteness(i, feedstock) })
    })

    panelsEl.appendChild(panel)
  })
}

function updateCompleteness(index, feedstock) {
  const requiredIds = ['carbon-' + index, 'ph-' + index, 'moisture-' + index, 'labreportdate-' + index, 'labreport-' + index]
  const optionalIds = ['surface-' + index, 'particle-' + index, 'ash-' + index, 'ec-' + index]

  let filledRequired = 0
  let filledOptional = 0

  requiredIds.forEach(function(id) {
    const el = document.getElementById(id)
    if (el && el.value) filledRequired++
  })

  optionalIds.forEach(function(id) {
    const el = document.getElementById(id)
    if (el && el.value) filledOptional++
  })

  const labVerified = document.getElementById('labverified-' + index)
  if (labVerified && labVerified.checked) filledOptional++

  const total = requiredIds.length + optionalIds.length + 1
  const filled = filledRequired + filledOptional
  const pct = Math.round((filled / total) * 100)

  const fill = document.getElementById('completeness-fill-' + index)
  const label = document.getElementById('completeness-label-' + index)
  if (fill) fill.style.width = pct + '%'
  if (label) {
    label.textContent = pct + '% complete'
    label.style.color = pct === 100 ? 'var(--color-accent)' : pct >= 60 ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
  }

  if (filledRequired === requiredIds.length) {
    const tab = document.querySelector('#properties-tabs .feedstock-tab[data-index="' + index + '"]')
    if (tab) tab.classList.add('complete')
  }

  savePropertiesData(index, feedstock)
}

function savePropertiesData(index, feedstock) {
  const certInputs = document.querySelectorAll('input[name="cert-' + index + '"]:checked')
  const certs = Array.from(certInputs).map(function(c) { return c.value })
  wizardData.properties[feedstock] = {
    carbonContent: document.getElementById('carbon-' + index) ? document.getElementById('carbon-' + index).value : '',
    pH: document.getElementById('ph-' + index) ? document.getElementById('ph-' + index).value : '',
    moisture: document.getElementById('moisture-' + index) ? document.getElementById('moisture-' + index).value : '',
    surfaceArea: document.getElementById('surface-' + index) ? document.getElementById('surface-' + index).value : '',
    particleSize: document.getElementById('particle-' + index) ? document.getElementById('particle-' + index).value : '',
    ashContent: document.getElementById('ash-' + index) ? document.getElementById('ash-' + index).value : '',
    electricalConductivity: document.getElementById('ec-' + index) ? document.getElementById('ec-' + index).value : '',
    labVerified: document.getElementById('labverified-' + index) ? document.getElementById('labverified-' + index).checked : false,
    labReportDate: document.getElementById('labreportdate-' + index) ? document.getElementById('labreportdate-' + index).value : '',
    certifications: certs
  }
}

function validateStep3() {
  let valid = true
  wizardData.feedstocks.forEach(function(feedstock, i) {
    const carbon = document.getElementById('carbon-' + i)
    const ph = document.getElementById('ph-' + i)
    const moisture = document.getElementById('moisture-' + i)
    const labdate = document.getElementById('labreportdate-' + i)
    const labreport = document.getElementById('labreport-' + i)
    const missing = []
    if (!carbon || !carbon.value) missing.push('Carbon Content')
    if (!ph || !ph.value) missing.push('pH')
    if (!moisture || !moisture.value) missing.push('Moisture')
    if (!labdate || !labdate.value) missing.push('Lab Report Date')
    if (!labreport || !labreport.files || labreport.files.length === 0) missing.push('Lab Report Upload')
    if (missing.length > 0) {
      const tab = document.querySelector('#properties-tabs .feedstock-tab[data-index="' + i + '"]')
      if (tab) {
        tab.style.color = '#C0392B'
        tab.style.borderBottomColor = '#C0392B'
      }
      valid = false
    }
    savePropertiesData(i, feedstock)
  })
  if (!valid) {
    alert('Please complete all required fields for each feedstock. Tabs with missing data are highlighted in red.')
  }
  return valid
}

function buildAvailabilityTabs() {
  const tabsEl = document.getElementById('availability-tabs')
  const panelsEl = document.getElementById('availability-panels')
  tabsEl.innerHTML = ''
  panelsEl.innerHTML = ''

  wizardData.feedstocks.forEach(function(feedstock, i) {
    if (!wizardData.availability[feedstock]) wizardData.availability[feedstock] = {}

    const tab = document.createElement('button')
    tab.className = 'feedstock-tab' + (i === 0 ? ' active' : '')
    tab.textContent = feedstock
    tab.dataset.index = i
    tab.addEventListener('click', function() {
      document.querySelectorAll('#availability-tabs .feedstock-tab').forEach(function(t) { t.classList.remove('active') })
      document.querySelectorAll('#availability-panels .feedstock-tab-panel').forEach(function(p) { p.classList.remove('active') })
      tab.classList.add('active')
      document.getElementById('avail-panel-' + i).classList.add('active')
      activeAvailabilityTab = i
    })
    tabsEl.appendChild(tab)

    const panel = document.createElement('div')
    panel.className = 'feedstock-tab-panel' + (i === 0 ? ' active' : '')
    panel.id = 'avail-panel-' + i
    panel.innerHTML =
      '<div class="lab-fields-grid">' +
        '<div class="form-group">' +
          '<label for="avail-tonnes-' + i + '">Available tonnes <span class="required-star">*</span></label>' +
          '<p class="field-hint">Total volume currently available to sell.</p>' +
          '<input type="number" id="avail-tonnes-' + i + '" min="0" placeholder="e.g. 200" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="min-order-' + i + '">Minimum order (tonnes) <span class="required-star">*</span></label>' +
          '<p class="field-hint">Smallest order you will accept.</p>' +
          '<input type="number" id="min-order-' + i + '" min="0" placeholder="e.g. 10" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="price-tonne-' + i + '">Price per tonne (USD) <span class="required-star">*</span></label>' +
          '<p class="field-hint">This is your listed price. Buyers can make offers above or below this.</p>' +
          '<input type="number" id="price-tonne-' + i + '" min="0" step="0.01" placeholder="e.g. 400" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="lead-time-' + i + '">Lead time (days) <span class="required-star">*</span></label>' +
          '<p class="field-hint">How many days from order confirmation to ready for delivery or collection.</p>' +
          '<input type="number" id="lead-time-' + i + '" min="0" placeholder="e.g. 14" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="avail-from-' + i + '">Available from</label>' +
          '<input type="date" id="avail-from-' + i + '">' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="avail-until-' + i + '">Available until</label>' +
          '<input type="date" id="avail-until-' + i + '">' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Delivery methods offered <span class="required-star">*</span></label>' +
        '<div class="checkbox-group">' +
          '<label><input type="checkbox" name="delivery-' + i + '" value="Producer delivers"> Producer delivers</label>' +
          '<label><input type="checkbox" name="delivery-' + i + '" value="Buyer collects"> Buyer collects</label>' +
          '<label><input type="checkbox" name="delivery-' + i + '" value="Third party freight"> Third party freight</label>' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Regions served</label>' +
        '<div class="checkbox-group">' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Sacramento Valley"> Sacramento Valley</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="San Joaquin Valley"> San Joaquin Valley</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="North Coast"> North Coast</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Central Coast"> Central Coast</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Sierra Foothills"> Sierra Foothills</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Pacific Northwest"> Pacific Northwest</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Great Plains"> Great Plains</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Southeast"> Southeast</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Northeast"> Northeast</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Midwest"> Midwest</label>' +
          '<label><input type="checkbox" name="regions-' + i + '" value="Nationwide"> Nationwide</label>' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="hard-floor-' + i + '">Minimum acceptable price per tonne (private)</label>' +
        '<p class="field-hint">This is your hard floor — bids below this are auto-rejected. Buyers never see this number. Leave blank for no floor.</p>' +
        '<input type="number" id="hard-floor-' + i + '" min="0" step="0.01" placeholder="Optional — e.g. 320">' +
      '</div>'

    panelsEl.appendChild(panel)
  })

  wizardData.feedstocks.forEach(function(feedstock, i) {
    const panel = document.getElementById('avail-panel-' + i)
    if (!panel) return
    const inputs = panel.querySelectorAll('input, select')
    inputs.forEach(function(input) {
      input.addEventListener('input', function() { saveAvailabilityData() })
      input.addEventListener('change', function() { saveAvailabilityData() })
    })
  })
}

function saveAvailabilityData() {
  wizardData.feedstocks.forEach(function(feedstock, i) {
    const deliveryInputs = document.querySelectorAll('input[name="delivery-' + i + '"]:checked')
    const regionInputs = document.querySelectorAll('input[name="regions-' + i + '"]:checked')
    wizardData.availability[feedstock] = {
      availableTonnes: document.getElementById('avail-tonnes-' + i) ? document.getElementById('avail-tonnes-' + i).value : '',
      minOrderTonnes: document.getElementById('min-order-' + i) ? document.getElementById('min-order-' + i).value : '',
      pricePerTonne: document.getElementById('price-tonne-' + i) ? document.getElementById('price-tonne-' + i).value : '',
      leadTimeDays: document.getElementById('lead-time-' + i) ? document.getElementById('lead-time-' + i).value : '',
      availableFrom: document.getElementById('avail-from-' + i) ? document.getElementById('avail-from-' + i).value : '',
      availableUntil: document.getElementById('avail-until-' + i) ? document.getElementById('avail-until-' + i).value : '',
      hardFloor: document.getElementById('hard-floor-' + i) ? document.getElementById('hard-floor-' + i).value : '',
      deliveryMethods: Array.from(deliveryInputs).map(function(c) { return c.value }),
      regionsServed: Array.from(regionInputs).map(function(c) { return c.value })
    }
  })
}

function validateStep4() {
  saveAvailabilityData()
  let valid = true

  wizardData.feedstocks.forEach(function(feedstock, i) {
    const a = wizardData.availability[feedstock] || {}
    const tab = document.querySelector('#availability-tabs .feedstock-tab[data-index="' + i + '"]')
    const panel = document.getElementById('avail-panel-' + i)

    const missing = []
    if (!a.availableTonnes) missing.push('Available tonnes')
    if (!a.minOrderTonnes) missing.push('Minimum order tonnes')
    if (!a.pricePerTonne) missing.push('Price per tonne')
    if (!a.leadTimeDays) missing.push('Lead time days')
    if (!a.deliveryMethods || a.deliveryMethods.length === 0) missing.push('At least one delivery method')

    let errorEl = panel ? panel.querySelector('.avail-error') : null
    if (!errorEl && panel) {
      errorEl = document.createElement('p')
      errorEl.className = 'avail-error field-error'
      panel.insertBefore(errorEl, panel.firstChild)
    }

    if (missing.length > 0) {
      if (tab) {
        tab.style.color = '#C0392B'
        tab.style.borderBottomColor = '#C0392B'
      }
      if (errorEl) {
        errorEl.textContent = 'Missing required fields: ' + missing.join(', ')
        errorEl.style.display = 'block'
      }
      valid = false
    } else {
      if (tab) {
        tab.style.color = ''
        tab.style.borderBottomColor = ''
        tab.classList.add('complete')
      }
      if (errorEl) errorEl.style.display = 'none'
    }
  })

  if (!valid) {
    const firstIncomplete = wizardData.feedstocks.findIndex(function(feedstock) {
      const a = wizardData.availability[feedstock] || {}
      return !a.availableTonnes || !a.minOrderTonnes || !a.pricePerTonne || !a.leadTimeDays || !a.deliveryMethods || a.deliveryMethods.length === 0
    })
    if (firstIncomplete >= 0) {
      document.querySelectorAll('#availability-tabs .feedstock-tab').forEach(function(t) { t.classList.remove('active') })
      document.querySelectorAll('#availability-panels .feedstock-tab-panel').forEach(function(p) { p.classList.remove('active') })
      const tab = document.querySelector('#availability-tabs .feedstock-tab[data-index="' + firstIncomplete + '"]')
      const panel = document.getElementById('avail-panel-' + firstIncomplete)
      if (tab) tab.classList.add('active')
      if (panel) panel.classList.add('active')
    }
  }

  return valid
}

function buildReviewStep() {
  const summaryEl = document.getElementById('review-summary')
  const previewEl = document.getElementById('review-preview-cards')

  let summaryHTML =
    '<div class="review-section">' +
    '<h3>Business information</h3>' +
    Object.entries({
      'Business': wizardData.business.businessName,
      'Contact': wizardData.business.contactName,
      'Email': wizardData.business.email,
      'State': wizardData.business.state,
      'ZIP': wizardData.business.zipcode,
      'EIN': wizardData.business.ein,
      'Website': wizardData.business.businessWebsite || 'Not provided',
      'Equipment': wizardData.business.equipmentType,
      'Capacity': wizardData.business.annualCapacity + ' tonnes/year'
    }).map(function(entry) {
      return '<div class="review-row"><span class="review-row-label">' + entry[0] + '</span><span class="review-row-value">' + entry[1] + '</span></div>'
    }).join('') +
    '</div>' +

    '<div class="review-section">' +
    '<h3>Feedstocks (' + wizardData.feedstocks.length + ')</h3>' +
    wizardData.feedstocks.map(function(f) {
      const props = wizardData.properties[f]
      const avail = wizardData.availability[f]
      const requiredFilled = props.carbonContent && props.pH && props.moisture && props.labReportDate
      return '<div class="review-row">' +
        '<span class="review-row-label">' + f + '</span>' +
        '<span class="review-row-value" style="color:' + (requiredFilled ? 'var(--color-accent)' : '#C0392B') + '">' +
        (requiredFilled ? '✓ Required fields complete' : '⚠ Missing required fields') +
        ' · $' + (avail.pricePerTonne || '—') + '/t' +
        '</span></div>'
    }).join('') +
    '</div>'

  summaryEl.innerHTML = summaryHTML

  previewEl.innerHTML = ''
  wizardData.feedstocks.forEach(function(feedstock) {
    const props = wizardData.properties[feedstock]
    const avail = wizardData.availability[feedstock]
    const wrapper = document.createElement('div')
    wrapper.className = 'preview-card-wrapper'
    wrapper.title = 'Click to see full listing detail view'
    wrapper.innerHTML =
      '<div class="listing-card" style="border:2px solid var(--color-accent);pointer-events:none">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-3)">' +
          '<div>' +
            '<h3 style="font-size:var(--font-size-base);font-weight:var(--font-weight-bold)">' + wizardData.business.businessName + '</h3>' +
            '<p style="color:var(--color-text-muted);font-size:var(--font-size-xs)">' + wizardData.business.state + '</p>' +
          '</div>' +
          '<span class="listing-tag">' + feedstock + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3)">' +
          '<span style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);color:var(--color-accent)">$' + (avail.pricePerTonne || '—') + '<span style="font-size:var(--font-size-xs);font-weight:normal;color:var(--color-text-muted)">/tonne</span></span>' +
          '<span style="font-size:var(--font-size-sm);color:var(--color-text-muted)">' + (avail.availableTonnes || '—') + ' t available</span>' +
        '</div>' +
        (props.carbonContent || props.pH || props.surfaceArea ?
          '<div style="display:flex;gap:var(--space-2);flex-wrap:wrap">' +
          (props.carbonContent ? '<span class="scorecard-badge">' + props.carbonContent + '% C</span>' : '') +
          (props.pH ? '<span class="scorecard-badge">pH ' + props.pH + '</span>' : '') +
          (props.surfaceArea ? '<span class="scorecard-badge">' + props.surfaceArea + ' m²/g</span>' : '') +
          '</div>' : '') +
        (props.certifications && props.certifications.length > 0 ?
          '<div style="margin-top:var(--space-2);display:flex;gap:var(--space-2);flex-wrap:wrap">' +
          props.certifications.map(function(c) { return '<span class="cert-badge">' + c + '</span>' }).join('') +
          '</div>' : '') +
      '</div>'

    wrapper.addEventListener('click', function() {
      openPreviewModal(feedstock, props, avail)
    })

    const hint = document.createElement('p')
    hint.style.cssText = 'font-size:var(--font-size-xs);color:var(--color-text-muted);text-align:center;margin-top:var(--space-2)'
    hint.textContent = 'Click to preview full detail view →'
    wrapper.appendChild(hint)

    previewEl.appendChild(wrapper)
  })
}

function openPreviewModal(feedstock, props, avail) {
  let modal = document.getElementById('preview-modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'preview-modal'
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:600;display:flex;align-items:center;justify-content:center;padding:var(--space-6)'
    document.body.appendChild(modal)
  }

  modal.innerHTML =
    '<div style="background:var(--color-surface);border-radius:var(--radius-lg);max-width:680px;width:100%;max-height:90vh;overflow-y:auto;padding:var(--space-8)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-6)">' +
        '<h2 style="font-size:var(--font-size-xl)">Full listing preview — ' + feedstock + '</h2>' +
        '<button onclick="document.getElementById(\'preview-modal\').style.display=\'none\'" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--color-text-muted)">×</button>' +
      '</div>' +
      '<h3 style="margin-bottom:var(--space-2)">' + wizardData.business.businessName + '</h3>' +
      '<p style="color:var(--color-text-muted);margin-bottom:var(--space-5)">' + wizardData.business.state + '</p>' +

      '<div style="margin-bottom:var(--space-6)">' +
        '<h4 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4)">Lab scorecard</h4>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">' +
          renderScorecardRow('Carbon Content', props.carbonContent ? props.carbonContent + '%' : '—', 'Above 70% qualifies for carbon credit programs', !!props.carbonContent) +
          renderScorecardRow('pH', props.pH || '—', 'Above 7 raises soil pH, beneficial for acidic soils', !!props.pH) +
          renderScorecardRow('Moisture', props.moisture ? props.moisture + '%' : '—', 'Below 15% preferred for handling', !!props.moisture) +
          renderScorecardRow('Surface Area', props.surfaceArea ? props.surfaceArea + ' m²/g' : '—', 'Above 400 is excellent for water retention', !!props.surfaceArea) +
          renderScorecardRow('Particle Size', props.particleSize ? props.particleSize + ' mm' : '—', '1-4mm is versatile for most applications', !!props.particleSize) +
          renderScorecardRow('Ash Content', props.ashContent ? props.ashContent + '%' : '—', 'Below 20% indicates high-carbon biochar', !!props.ashContent) +
          renderScorecardRow('Electrical Conductivity', props.electricalConductivity ? props.electricalConductivity + ' dS/m' : '—', 'Below 2 ideal for most crops', !!props.electricalConductivity) +
        '</div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-5)">' +
        '<div><p style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Price per tonne</p><p style="font-size:var(--font-size-2xl);font-weight:var(--font-weight-bold);color:var(--color-accent)">$' + (avail.pricePerTonne || '—') + '</p></div>' +
        '<div><p style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Available</p><p style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold)">' + (avail.availableTonnes || '—') + ' tonnes</p></div>' +
        '<div><p style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Minimum order</p><p style="font-weight:var(--font-weight-semibold)">' + (avail.minOrderTonnes || '—') + ' tonnes</p></div>' +
        '<div><p style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Lead time</p><p style="font-weight:var(--font-weight-semibold)">' + (avail.leadTimeDays || '—') + ' days</p></div>' +
      '</div>' +

      (avail.deliveryMethods && avail.deliveryMethods.length > 0 ?
        '<div style="margin-bottom:var(--space-5)"><p style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:var(--space-2)">Delivery options</p><div style="display:flex;gap:var(--space-2);flex-wrap:wrap">' +
        avail.deliveryMethods.map(function(d) { return '<span class="listing-tag">' + d + '</span>' }).join('') +
        '</div></div>' : '') +

      (props.certifications && props.certifications.length > 0 ?
        '<div><p style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:var(--space-2)">Certifications</p><div style="display:flex;gap:var(--space-2);flex-wrap:wrap">' +
        props.certifications.map(function(c) { return '<span class="cert-badge">' + c + '</span>' }).join('') +
        '</div></div>' : '') +
    '</div>'

  modal.style.display = 'flex'
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.style.display = 'none'
  })
}

function renderScorecardRow(label, value, hint, hasValue) {
  return '<div style="background:' + (hasValue ? 'var(--color-accent-light)' : 'var(--color-bg)') + ';border-radius:var(--radius-md);padding:var(--space-3) var(--space-4)">' +
    '<p style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:2px">' + label + '</p>' +
    '<p style="font-weight:var(--font-weight-bold);font-size:var(--font-size-lg);color:' + (hasValue ? 'var(--color-accent)' : 'var(--color-text-muted)') + '">' + value + '</p>' +
    '<p style="font-size:10px;color:var(--color-text-muted);margin-top:2px">' + hint + '</p>' +
  '</div>'
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('wizard-next')) {
    const from = parseInt(e.target.dataset.from)
    if (from === 1) {
      if (!validateStep1()) return
      saveStep1()
      buildStateSelect(document.getElementById('w-state'), true)
      showStep(2)
    }
    if (from === 2) {
      if (!validateStep2()) return
      buildPropertiesTabs()
      buildAvailabilityTabs()
      showStep(3)
    }
    if (from === 3) {
      if (!validateStep3()) return
      showStep(4)
    }
    if (from === 4) {
      if (!validateStep4()) return
      buildReviewStep()
      clearDraft()
      showStep(5)
    }
  }

  if (e.target.classList.contains('wizard-back')) {
    const to = parseInt(e.target.dataset.to)
    showStep(to)
  }
})

async function prefillWizard() {
  if (!window.currentUser) return
  try {
    const doc = await db.collection('users').doc(window.currentUser.uid).get()
    if (!doc.exists) return
    const p = doc.data()
    const fields = {
      'w-businessName': p.businessName,
      'w-contactName': p.name,
      'w-email': p.email,
      'w-zipcode': p.zipcode,
      'w-ein': p.ein,
      'w-website': p.businessWebsite
    }
    Object.entries(fields).forEach(function(entry) {
      const el = document.getElementById(entry[0])
      if (el && entry[1]) el.value = entry[1]
    })
    if (p.state) {
      const stateSelect = document.getElementById('w-state')
      if (stateSelect) stateSelect.value = p.state
    }
    const equipmentEl = document.getElementById('w-equipment')
    if (equipmentEl && p.pyroTech) equipmentEl.value = p.pyroTech
  } catch(e) {}
}

var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
var CLOUDINARY_PRESET = 'biochar_certs';
var sellerPhotoFiles = [];

document.addEventListener('DOMContentLoaded', function() {
  var photoInput = document.getElementById('seller-photo-input');
  var previews = document.getElementById('seller-photo-previews');
  if (photoInput) {
    photoInput.addEventListener('change', function(e) {
      var files = Array.prototype.slice.call(e.target.files, 0, 5);
      sellerPhotoFiles = files;
      if (previews) {
        previews.innerHTML = '';
        files.forEach(function(file) {
          var url = URL.createObjectURL(file);
          var img = document.createElement('img');
          img.src = url;
          img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--color-border)';
          previews.appendChild(img);
        });
      }
    });
  }
});

function uploadSellerPhotos() {
  if (!sellerPhotoFiles.length) return Promise.resolve([]);
  var promises = sellerPhotoFiles.map(function(file) {
    var fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_PRESET);
    return fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd })
      .then(function(r) { return r.json(); })
      .then(function(d) { return d.secure_url || null; })
      .catch(function() { return null; });
  });
  return Promise.all(promises);
}

auth.onAuthStateChanged(function(user) {
  if (user) prefillWizard()
})

document.addEventListener('DOMContentLoaded', function() {
  var draft = loadDraft();
  var banner = document.getElementById('draft-resume-banner');
  if (draft && draft.wizardData && banner) {
    var savedAt = draft.savedAt ? new Date(draft.savedAt).toLocaleDateString() : '';
    var savedAtEl = document.getElementById('draft-saved-at');
    if (savedAtEl) savedAtEl.textContent = savedAt ? '· saved ' + savedAt : '';
    banner.style.display = 'flex';

    document.getElementById('draft-resume-btn').addEventListener('click', function() {
      Object.assign(wizardData, draft.wizardData);
      banner.style.display = 'none';
      showStep(draft.currentStep || 1);
    });

    document.getElementById('draft-discard-btn').addEventListener('click', function() {
      clearDraft();
      banner.style.display = 'none';
    });
  }
});

document.addEventListener('click', function(e) {
  if (e.target.id !== 'wizard-submit-btn') return

  const agreeAccuracy = document.getElementById('agree-accuracy')
  const agreeCommission = document.getElementById('agree-commission')
  const errorEl = document.getElementById('submit-error')

  if (!agreeAccuracy || !agreeAccuracy.checked) {
    errorEl.textContent = 'Please confirm that all information is accurate.'
    errorEl.style.display = 'block'
    return
  }
  if (!agreeCommission || !agreeCommission.checked) {
    errorEl.textContent = 'Please confirm you understand the commission structure.'
    errorEl.style.display = 'block'
    return
  }
  errorEl.style.display = 'none'

  if (!window.currentUser) {
    errorEl.textContent = 'You must be logged in to submit a listing.'
    errorEl.style.display = 'block'
    return
  }

  const btn = document.getElementById('wizard-submit-btn')
  btn.disabled = true
  btn.textContent = 'Submitting…'

  uploadSellerPhotos().then(function(photoUrls) {
  const listings = []
  wizardData.feedstocks.forEach(function(feedstock) {
    const props = wizardData.properties[feedstock] || {}
    const avail = wizardData.availability[feedstock] || {}
    listings.push({
      producerUID: window.currentUser.uid,
      producerName: wizardData.business.businessName,
      contactName: wizardData.business.contactName,
      contactEmail: wizardData.business.email,
      state: wizardData.business.state,
      zipcode: wizardData.business.zipcode,
      ein: wizardData.business.ein,
      businessWebsite: wizardData.business.businessWebsite,
      yearsInOperation: wizardData.business.yearsInOperation,
      equipmentType: wizardData.business.equipmentType,
      pyroTech: wizardData.business.equipmentType,
      annualCapacity: wizardData.business.annualCapacity,
      feedstock: feedstock,
      scorecard: {
        carbonContent: parseFloat(props.carbonContent) || null,
        pH: parseFloat(props.pH) || null,
        moisture: parseFloat(props.moisture) || null,
        surfaceArea: parseFloat(props.surfaceArea) || null,
        particleSize: props.particleSize || null,
        ashContent: parseFloat(props.ashContent) || null,
        electricalConductivity: parseFloat(props.electricalConductivity) || null,
        labVerified: !!props.labVerified
      },
      certifications: props.certifications || [],
      pricePerTonne: parseFloat(avail.pricePerTonne) || null,
      availableTonnes: parseFloat(avail.availableTonnes) || null,
      minOrderTonnes: parseFloat(avail.minOrderTonnes) || null,
      availableFrom: avail.availableFrom || null,
      availableUntil: avail.availableUntil || null,
      leadTimeDays: parseFloat(avail.leadTimeDays) || null,
      deliveryMethods: avail.deliveryMethods || [],
      description: avail.description || '',
      photos: photoUrls.filter(Boolean),
      status: 'pending_review',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
  })

  const promises = listings.map(function(listing) {
    return db.collection('listings').add(listing)
  })

  Promise.all(promises)
    .then(function() {
      showStep(5)
      const inner = document.querySelector('#step-5 .wizard-panel-inner')
      if (inner) {
        inner.innerHTML =
          '<div style="text-align:center;padding:var(--space-12) 0">' +
            '<div style="font-size:3rem">✅</div>' +
            '<h2 style="font-size:var(--font-size-2xl);font-weight:700;margin-top:var(--space-4)">Application submitted!</h2>' +
            '<p style="color:var(--color-text-secondary);margin-top:var(--space-2)">Your listing is under review. We\\'ll notify you at ' + wizardData.business.email + ' within 2 business days.</p>' +
            '<div style="margin-top:var(--space-6);display:flex;gap:var(--space-4);justify-content:center">' +
              '<a href="seller.html" class="btn btn-secondary">List another product</a>' +
              '<a href="buyer.html" class="btn btn-primary">Browse marketplace</a>' +
            '</div>' +
          '</div>'
      }
    })
    .catch(function(err) {
      console.error(err)
      errorEl.textContent = 'Submission failed: ' + (err.message || 'Please try again.')
      errorEl.style.display = 'block'
      btn.disabled = false
      btn.textContent = 'Submit application'
    })
  }) // end uploadSellerPhotos
})

document.addEventListener('DOMContentLoaded', function() {
  const stateEl = document.getElementById('w-state')
  if (stateEl && typeof buildStateSelect === 'function') buildStateSelect(stateEl, true)
})
