// Pikaday supersedes the old makeDateSelect/getDateSelectValue handoff rule for wizard dates.
function renderDateInput(id, placeholder) {
  return '<input type="text" id="' + id + '" class="date-picker-input" placeholder="' + (placeholder || 'Select date') + '" readonly style="width:100%;height:42px;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:0 var(--space-3);font-size:var(--font-size-sm);font-family:inherit;background:var(--color-surface);cursor:pointer">';
}

function initDatePicker(id, options) {
  var input = document.getElementById(id);
  if (!input || input.dataset.pikadayBound === 'true') return;
  input.dataset.pikadayBound = 'true';
  if (typeof Pikaday !== 'function') return;
  var pickerOptions = options || {};
  new Pikaday({
    field: input,
    format: 'YYYY-MM-DD',
    minDate: pickerOptions.minDate || new Date(),
    maxDate: pickerOptions.maxDate || null,
    onSelect: function(date) {
      input.value = this.toString();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

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

function loadPriceSuggestion(index, feedstockType) {
  var el = document.getElementById('price-suggestion-' + index);
  if (!el) return;
  var MARKET_RANGES = {
    'Almond Shell':    { min: 320, max: 480, median: 390 },
    'Walnut Shell':    { min: 300, max: 460, median: 370 },
    'Wood Chip':       { min: 280, max: 430, median: 350 },
    'Forest Residue':  { min: 260, max: 400, median: 330 },
    'Rice Husk':       { min: 240, max: 380, median: 310 },
    'Corn Stover':     { min: 220, max: 360, median: 290 }
  };
  var range = MARKET_RANGES[feedstockType];
  var saved = wizardData.properties[feedstockType] || {};
  var carbonValue = parseFloat(saved.carbonContent || (document.getElementById('carbon-' + index) || {}).value);
  var surfaceValue = parseFloat(saved.surfaceArea || (document.getElementById('surface-' + index) || {}).value);
  var moistureValue = parseFloat(saved.moisture || (document.getElementById('moisture-' + index) || {}).value);
  var labVerified = !!(saved.labVerified || (document.getElementById('labverified-' + index) && document.getElementById('labverified-' + index).checked));
  var certs = Array.isArray(saved.certifications) ? saved.certifications.slice() : [];
  if (!certs.length) {
    certs = Array.from(document.querySelectorAll('input[name="cert-' + index + '"]:checked')).map(function(c) { return c.value; });
  }

  function renderAdjusted(baseMedian) {
    var hasScorecard = !Number.isNaN(carbonValue) || !Number.isNaN(surfaceValue) || !Number.isNaN(moistureValue) || labVerified || certs.length;
    if (!hasScorecard) {
      el.innerHTML =
        '📊 <strong>Base market range:</strong> $' + range.min + '–$' + range.max + '/t' +
        '<br><span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Complete material properties to see a quality-adjusted suggestion.</span>';
      el.style.color = 'var(--color-accent)';
      return;
    }

    var multiplier = 0;
    if (!Number.isNaN(carbonValue)) {
      if (carbonValue > 75) multiplier += 0.08;
      else if (carbonValue < 60) multiplier -= 0.08;
    }
    if (!Number.isNaN(surfaceValue)) {
      if (surfaceValue > 200) multiplier += 0.06;
      else if (surfaceValue < 100) multiplier -= 0.05;
    }
    if (!Number.isNaN(moistureValue)) {
      if (moistureValue < 8) multiplier += 0.04;
      else if (moistureValue > 15) multiplier -= 0.06;
    }
    if (labVerified) multiplier += 0.05;
    if (certs.indexOf('OMRI Listed') !== -1 || certs.indexOf('IBI Certified') !== -1) multiplier += 0.10;

    var adjustedMedian = baseMedian * (1 + multiplier);
    var suggestedLow = Math.round(adjustedMedian * 0.85);
    var suggestedHigh = Math.round(adjustedMedian * 1.15);
    var pct = Math.round(multiplier * 100);
    var pctLabel = (pct >= 0 ? '+' : '') + pct + '%';

    el.innerHTML =
      '📊 <strong>Base market range:</strong> $' + range.min + '–$' + range.max + '/t' +
      '<br><strong>Suggested range for this material:</strong> $' + suggestedLow + '–$' + suggestedHigh + '/t' +
      '<br><strong>Quality adjustment:</strong> ' + pctLabel;
    el.style.color = 'var(--color-accent)';
  }

  if (!range) {
    db.collection('transactions')
      .where('feedstock', '==', feedstockType)
      .where('status', '==', 'Complete')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
      .then(function(snap) {
        if (snap.empty) return;
        var prices = [];
        snap.forEach(function(d) { if (d.data().pricePerTonne) prices.push(d.data().pricePerTonne); });
        if (!prices.length) return;
        var sorted = prices.slice().sort(function(a,b){return a-b;});
        var median = sorted[Math.floor(sorted.length/2)];
        range = {
          min: Math.round(median * 0.85),
          max: Math.round(median * 1.15),
          median: median
        };
        renderAdjusted(median);
      }).catch(function(){});
    return;
  }
  renderAdjusted(range.median);
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

function isLikelyScreenshot(file) {
  if (!file) return false;
  var type = String(file.type || '').toLowerCase();
  if (type !== 'image/png' && type !== 'image/jpeg') return false;
  var name = String(file.name || '');
  return /screenshot|screen shot|screen_shot/i.test(name) || /^IMG_\d+/i.test(name);
}

function setUploadWarning(inputId, message) {
  var el = document.getElementById(inputId + '-warning');
  if (!el) return;
  el.textContent = message || '';
  el.style.display = message ? 'block' : 'none';
}

function setUploadFilename(inputId, message) {
  var el = document.getElementById(inputId + '-filename');
  if (!el) return;
  el.textContent = message || '';
}

function bindDocumentInput(inputId) {
  var input = document.getElementById(inputId);
  if (!input || input.dataset.bound === 'true') return;
  input.dataset.bound = 'true';
  input.addEventListener('change', function () {
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) {
      setUploadWarning(inputId, '');
      setUploadFilename(inputId, '');
      return;
    }
    var invalid = files.find(isLikelyScreenshot);
    if (invalid) {
      input.value = '';
      setUploadFilename(inputId, '');
      setUploadWarning(inputId, 'This looks like a screenshot — please upload the original document file (PDF preferred).');
      return;
    }
    setUploadWarning(inputId, '');
    setUploadFilename(inputId, files.length === 1 ? files[0].name : (files.length + ' files selected'));
  });
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
          renderDateInput('labreportdate-' + i, 'YYYY-MM-DD') +
        '</div>' +
        '<div class="form-group">' +
          '<label for="labreport-' + i + '">Upload lab report <span class="required-star">*</span></label>' +
          '<p class="field-hint">PDF, JPG, or PNG. Max 5MB.</p>' +
          '<input type="file" id="labreport-' + i + '" accept=".pdf,.jpg,.jpeg,.png" multiple>' +
          '<div id="labreport-filename-' + i + '" style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)"></div>' +
          '<div id="labreport-' + i + '-warning" class="upload-inline-warning" style="display:none"></div>' +
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
        '<div id="certdocs-' + i + '-filename" style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)"></div>' +
        '<div id="certdocs-' + i + '-warning" class="upload-inline-warning" style="display:none"></div>' +
      '</div>'

    const allInputs = panel.querySelectorAll('input, select')
    allInputs.forEach(function(input) {
      input.addEventListener('input', function() { updateCompleteness(i, feedstock) })
      input.addEventListener('change', function() { updateCompleteness(i, feedstock) })
    })

    panelsEl.appendChild(panel)
    bindDocumentInput('labreport-' + i)
    bindDocumentInput('certdocs-' + i)
    initDatePicker('labreportdate-' + i, { minDate: new Date('2015-01-01T00:00:00') })
  })
}

function updateCompleteness(index, feedstock) {
  const requiredIds = ['carbon-' + index, 'ph-' + index, 'moisture-' + index]
  const optionalIds = ['surface-' + index, 'particle-' + index, 'ash-' + index, 'ec-' + index]

  let filledRequired = 0
  let filledOptional = 0

  requiredIds.forEach(function(id) {
    const el = document.getElementById(id)
    if (!el) return
    if (el.type === 'file') {
      if (el.files && el.files.length > 0) filledRequired++
    } else if (el.tagName === 'SELECT' || el.tagName === 'INPUT') {
      if (el.value && el.value.trim() !== '') filledRequired++
    } else {
      if (el.value) filledRequired++
    }
  })

  optionalIds.forEach(function(id) {
    const el = document.getElementById(id)
    if (el && el.value) filledOptional++
  })

  var labDateInput = document.getElementById('labreportdate-' + index)
  var labDateVal = labDateInput ? labDateInput.value : ''
  if (labDateVal) filledOptional++

  var labFileEl = document.getElementById('labreport-' + index)
  if (labFileEl && labFileEl.files && labFileEl.files.length > 0) filledOptional++

  const labVerified = document.getElementById('labverified-' + index)
  if (labVerified && labVerified.checked) filledOptional++

  const total = requiredIds.length + optionalIds.length + 3
  const filled = filledRequired + filledOptional
  const pct = Math.min(100, Math.round((filled / total) * 100))

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
          '<div id="price-suggestion-' + i + '" style="margin-top:var(--space-2);font-size:var(--font-size-xs);color:var(--color-text-muted)"></div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="hard-floor-' + i + '">Negotiation floor</label>' +
          '<p class="field-hint">The lowest price you\'ll accept — bids below this are automatically rejected. This amount is never shown to buyers.</p>' +
          '<input type="number" id="hard-floor-' + i + '" min="0" step="0.01" placeholder="Optional — e.g. 320">' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="lead-time-' + i + '">Lead time (days) <span class="required-star">*</span></label>' +
          '<p class="field-hint">How many days from order confirmation to ready for delivery or collection.</p>' +
          '<input type="number" id="lead-time-' + i + '" min="0" placeholder="e.g. 14" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="avail-from-' + i + '">Available from</label>' +
          renderDateInput('avail-from-' + i, 'YYYY-MM-DD') +
        '</div>' +
        '<div class="form-group">' +
          '<label for="avail-until-' + i + '">Available until</label>' +
          renderDateInput('avail-until-' + i, 'YYYY-MM-DD') +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label>Delivery methods offered <span class="required-star">*</span></label>' +
        '<div class="checkbox-group">' +
          '<label><input type="checkbox" name="delivery-' + i + '" value="Producer delivers"> Producer delivers</label>' +
          '<label><input type="checkbox" name="delivery-' + i + '" value="Buyer collects"> Buyer collects</label>' +
          '<label><input type="checkbox" name="delivery-' + i + '" value="Third party freight"> Third party freight</label>' +
        '</div>' +
      '</div>'

    setTimeout(function() { loadPriceSuggestion(i, feedstock); }, 100);
    panelsEl.appendChild(panel)
    initDatePicker('avail-from-' + i, { minDate: new Date() })
    initDatePicker('avail-until-' + i, { minDate: new Date() })
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
    wizardData.availability[feedstock] = {
      availableTonnes: document.getElementById('avail-tonnes-' + i) ? document.getElementById('avail-tonnes-' + i).value : '',
      minOrderTonnes: document.getElementById('min-order-' + i) ? document.getElementById('min-order-' + i).value : '',
      pricePerTonne: document.getElementById('price-tonne-' + i) ? document.getElementById('price-tonne-' + i).value : '',
      leadTimeDays: document.getElementById('lead-time-' + i) ? document.getElementById('lead-time-' + i).value : '',
      availableFrom: document.getElementById('avail-from-' + i) ? document.getElementById('avail-from-' + i).value : '',
      availableUntil: document.getElementById('avail-until-' + i) ? document.getElementById('avail-until-' + i).value : '',
      hardFloor: document.getElementById('hard-floor-' + i) ? document.getElementById('hard-floor-' + i).value : '',
      deliveryMethods: Array.from(deliveryInputs).map(function(c) { return c.value })
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
    '<h3>Business profile</h3>' +
    Object.entries({
      'Business': wizardData.business.businessName,
      'Email': wizardData.business.email,
      'State': wizardData.business.state,
      'ZIP': wizardData.business.zipcode,
      'EIN': wizardData.business.ein,
      'Website': wizardData.business.businessWebsite || 'Not provided',
      'Equipment': wizardData.business.equipmentType,
      'Capacity': wizardData.business.annualCapacity ? wizardData.business.annualCapacity + ' tonnes/year' : '—',
      'Optimal sourcing radius': wizardData.business.optimalRadius === 'none' || !wizardData.business.optimalRadius ? 'No preference' : wizardData.business.optimalRadius + ' miles'
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
    var previewListing = {
      id: 'preview-' + feedstock.replace(/\s+/g, '-').toLowerCase(),
      feedstock: feedstock,
      producerName: wizardData.business.businessName || 'Your business',
      state: wizardData.business.state || '',
      county: wizardData.business.state || '',
      pricePerTonne: avail.pricePerTonne || '—',
      availableTonnes: avail.availableTonnes || '—',
      minOrderTonnes: avail.minOrderTonnes || '—',
      availableFrom: avail.availableFrom || null,
      availableUntil: avail.availableUntil || null,
      leadTimeDays: avail.leadTimeDays || null,
      scorecard: {
        carbonContent: parseFloat(props.carbonContent) || 0,
        ashContent: parseFloat(props.ashContent) || 0,
        electricalConductivity: parseFloat(props.electricalConductivity) || 0
      },
      certifications: props.certifications || [],
      photos: getPreviewPhotos()
    };

    const wrapper = document.createElement('div')
    wrapper.className = 'preview-card-wrapper'
    wrapper.title = 'Click to see full listing detail view'
    if (typeof window.listingCardHtml === 'function') {
      wrapper.innerHTML = window.listingCardHtml(previewListing, null, '', { expanded: false, includeCompare: true });
      wrapper.querySelectorAll('.compare-corner input').forEach(function(i) { i.disabled = true; });
      var cardLink = wrapper.querySelector('a');
      if (cardLink) cardLink.style.pointerEvents = 'none';
    } else {
      wrapper.innerHTML = '<div class="listing-card" style="border:2px solid var(--color-accent);pointer-events:none;padding:var(--space-5)"><h3>' + previewListing.producerName + '</h3><p>' + feedstock + '</p></div>';
    }

    wrapper.addEventListener('click', function() {
      openPreviewModal(feedstock, props, avail, previewListing)
    })

    const hint = document.createElement('p')
    hint.style.cssText = 'font-size:var(--font-size-xs);color:var(--color-text-muted);text-align:center;margin-top:var(--space-2)'
    hint.textContent = 'Click to preview full detail view →'
    wrapper.appendChild(hint)

    previewEl.appendChild(wrapper)
  })
}

function openPreviewModal(feedstock, props, avail, previewListing) {
  let modal = document.getElementById('preview-modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'preview-modal'
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:600;display:flex;align-items:center;justify-content:center;padding:var(--space-6)'
    document.body.appendChild(modal)
  }

  var listing = Object.assign({}, previewListing, {
    feedstock: feedstock,
    pricePerTonne: avail.pricePerTonne || '—',
    availableTonnes: avail.availableTonnes || '—',
    minOrderTonnes: avail.minOrderTonnes || '—',
    availableFrom: avail.availableFrom || null,
    availableUntil: avail.availableUntil || null,
    leadTimeDays: avail.leadTimeDays || 0,
    description: avail.description || '',
    scorecard: {
      carbonContent: parseFloat(props.carbonContent) || 0,
      pH: parseFloat(props.pH) || 0,
      surfaceArea: parseFloat(props.surfaceArea) || 0,
      particleSize: props.particleSize || '',
      moisture: parseFloat(props.moisture) || 0,
      ashContent: parseFloat(props.ashContent) || 0,
      electricalConductivity: parseFloat(props.electricalConductivity) || 0,
      labVerified: !!props.labVerified
    },
    certifications: props.certifications || [],
    suitableFor: props.suitableFor || [],
    transactionsCompleted: 0,
    averageRating: null
  });

  modal.innerHTML =
    '<div style="background:var(--color-surface);border-radius:var(--radius-lg);max-width:980px;width:100%;max-height:90vh;overflow-y:auto;padding:var(--space-6)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5)">' +
        '<h2 style="font-size:var(--font-size-xl)">Full listing preview — ' + feedstock + '</h2>' +
        '<button onclick="document.getElementById(\'preview-modal\').style.display=\'none\'" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--color-text-muted)">×</button>' +
      '</div>' +
      renderListingPreview(listing) +
    '</div>'

  modal.style.display = 'flex'
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.style.display = 'none'
  })
}

function getPreviewPhotos() {
  if (!sellerPhotoFiles.length) return [];
  return sellerPhotoFiles.map(function(file) { return URL.createObjectURL(file); });
}

function formatPreviewDate(dateStr) {
  var date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr || '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderListingPreview(listing) {
  var suitableTags = (Array.isArray(listing.suitableFor) ? listing.suitableFor : [])
    .map(function (item) { return '<span class="suitable-tag">' + item + '</span>'; })
    .join('');
  var headerClass = 'listing-header';
  var headerStyle = '';
  if (listing.photos && listing.photos.length) {
    headerClass += ' has-hero';
    headerStyle = ' style="background-image:url(' + listing.photos[0] + ')"';
  }
  var photoStrip = '';
  if (listing.photos && listing.photos.length) {
    photoStrip = '<div class="listing-photo-strip">' +
      listing.photos.map(function(p) { return '<a href="' + p + '" target="_blank" rel="noopener"><img src="' + p + '" alt="Listing photo"></a>'; }).join('') +
      '</div>';
  }
  var leadTimeDays = Number(listing.leadTimeDays) || 0;
  var leadTimeText =
    leadTimeDays === 0
      ? '<span class="availability-lead ready">Ready to ship</span>'
      : '<span class="availability-lead wait">' + Math.ceil(leadTimeDays / 7) + '-week lead time</span>';
  var verificationClass = listing.scorecard.labVerified ? 'verified' : 'self';
  var verificationText = listing.scorecard.labVerified ? 'Lab Verified' : 'Self Reported';
  return '<div class="listing-shell">' +
    '<section class="' + headerClass + '"' + headerStyle + '>' +
      '<h1>' + listing.producerName + '</h1>' +
      '<p class="listing-location">' + (listing.state || '') + '</p>' +
      '<div class="listing-top-meta"><span class="feedstock-tag">' + listing.feedstock + '</span></div>' +
      '<div class="headline-row">' +
        '<span class="headline-price">$' + listing.pricePerTonne + '</span><span class="headline-unit">/tonne</span>' +
        '<span class="headline-detail">' + listing.availableTonnes + ' t available &nbsp;·&nbsp; Min order: ' + listing.minOrderTonnes + ' t</span>' +
      '</div>' +
      '<div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:var(--space-2)">' +
        (listing.availableFrom ? formatPreviewDate(listing.availableFrom) : 'Available now') +
        (listing.availableUntil ? ' — ' + formatPreviewDate(listing.availableUntil) : '') +
      '</div>' +
      '<p class="rating-line">No transactions yet' +
        '<span style="margin-left:12px;color:' + (listing.certifications && listing.certifications.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)') + ';font-weight:500">' +
        (listing.certifications && listing.certifications.length > 0 ? '✓ Certified' : 'Not certified') +
        '</span></p>' +
      photoStrip +
      '<div id="top-card-actions"></div>' +
      '<div id="complete-loop-banner"></div>' +
    '</section>' +
    '<section class="scorecard-section">' +
      '<div class="section-title-row"><h2>Lab Scorecard</h2><span class="verify-badge ' + verificationClass + '">' + verificationText + '</span></div>' +
      '<div class="scorecard-grid">' +
        '<article class="scorecard-item"><p class="scorecard-value">' + (listing.scorecard.carbonContent || 0).toFixed(1) + '%</p><p class="scorecard-label">Carbon Content</p><p class="scorecard-note">Higher is better. Above 70% indicates stable long-term sequestration.</p></article>' +
        '<article class="scorecard-item"><p class="scorecard-value">' + (listing.scorecard.pH || 0).toFixed(1) + '</p><p class="scorecard-label">pH</p><p class="scorecard-note">Values above 7 raise soil pH — beneficial for acidic soils.</p></article>' +
        '<article class="scorecard-item"><p class="scorecard-value">' + (listing.scorecard.surfaceArea || 0) + ' m²/g</p><p class="scorecard-label">Surface Area</p><p class="scorecard-note">Higher surface area means better water and nutrient retention.</p></article>' +
        '<article class="scorecard-item"><p class="scorecard-value">' + (listing.scorecard.particleSize || '—') + '</p><p class="scorecard-label">Particle Size</p><p class="scorecard-note">Smaller particles blend more easily. Larger particles improve drainage.</p></article>' +
        '<article class="scorecard-item"><p class="scorecard-value">' + (listing.scorecard.moisture || 0).toFixed(1) + '%</p><p class="scorecard-label">Moisture</p><p class="scorecard-note">Lower is better for storage and transport.</p></article>' +
        '<article class="scorecard-item"><p class="scorecard-value">' + (listing.scorecard.ashContent || 0).toFixed(1) + '%</p><p class="scorecard-label">Ash Content</p><p class="scorecard-note">Mineral residue from feedstock. High ash reduces stable carbon proportion.</p></article>' +
        '<article class="scorecard-item"><p class="scorecard-value">' + (listing.scorecard.electricalConductivity || 0).toFixed(1) + ' dS/m</p><p class="scorecard-label">Electrical Conductivity</p><p class="scorecard-note">Below 2 dS/m is ideal for most crops.</p></article>' +
      '</div>' +
    '</section>' +
    '<section class="scorecard-section" style="margin-top:var(--space-6)">' +
      '<h2 class="section-title">Delivered Cost Estimate</h2>' +
      '<div id="dc-setup">' +
        '<div style="display:flex;flex-wrap:wrap;gap:var(--space-4);margin-bottom:var(--space-4);align-items:flex-end">' +
          '<div><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Your ZIP Code</label>' +
          '<input type="text" maxlength="5" placeholder="e.g. 94103" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:6px"></div>' +
          '<div><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Volume (tonnes)</label>' +
          '<input type="number" min="1" value="' + listing.minOrderTonnes + '" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:6px"></div>' +
          '<div><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Application Rate (tons/acre)</label>' +
          '<input type="number" min="0" step="0.1" value="1" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:6px"></div>' +
          '<div style="flex:1;min-width:220px"><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Spreading Cost: $<span>60</span>/tonne</label>' +
          '<input type="range" min="40" max="80" value="60" style="width:100%"></div>' +
          '<button class="btn btn-primary" type="button">Calculate</button>' +
        '</div>' +
      '</div>' +
    '</section>' +
    '<section class="description-section">' +
      '<h2>About this material</h2>' +
      '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4)">' +
      suitableTags +
      '</div>' +
      '<p style="color:var(--color-text-secondary);line-height:1.7">' + (listing.description || '') + '</p>' +
    '</section>' +
    '<section class="availability-section">' +
      '<div class="availability-card">' +
        '<div><div class="availability-label">Lead time</div><div class="availability-value">' + leadTimeText + '</div></div>' +
        '<div><div class="availability-label">Delivery options</div><div class="availability-tags">' +
        (avail.deliveryMethods || []).map(function(d) { return '<span>' + d + '</span>'; }).join('') +
        '</div></div>' +
      '</div>' +
    '</section>' +
  '</div>';
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('wizard-next')) {
    const from = parseInt(e.target.dataset.from)
    if (from === 1) {
      if (!validateStep2()) return
      buildPropertiesTabs()
      buildAvailabilityTabs()
      showStep(2)
    }
    if (from === 2) {
      if (!validateStep3()) return
      showStep(3)
    }
    if (from === 3) {
      if (!validateStep4()) return
      buildReviewStep()
      clearDraft()
      showStep(4)
    }
  }

  if (e.target.classList.contains('wizard-back')) {
    const to = parseInt(e.target.dataset.to)
    showStep(to)
  }
})

function prefillWizard(profile, user) {
  if (!profile) return;
  wizardData.business = {
    businessName: profile.businessName || '',
    contactName: profile.name || '',
    email: profile.email || (user && user.email) || '',
    state: profile.state || '',
    zipcode: profile.zipcode || '',
    optimalRadius: profile.optimalRadius || '',
    ein: profile.ein || '',
    businessWebsite: profile.businessWebsite || '',
    equipmentType: profile.equipmentType || profile.pyroTech || '',
    pyroTech: profile.pyroTech || profile.equipmentType || '',
    annualCapacity: profile.annualCapacity || ''
  };
}

var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
var CLOUDINARY_RAW_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/raw/upload';
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
  var toggleBtn = document.getElementById('feedstock-toggle-all');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      var boxes = Array.prototype.slice.call(document.querySelectorAll('input[name="feedstocks"]'));
      var allChecked = boxes.length && boxes.every(function(b) { return b.checked; });
      boxes.forEach(function(b) { b.checked = !allChecked; });
      toggleBtn.textContent = allChecked ? 'Select all' : 'Deselect all';
    });
  }
  var draft = loadDraft();
  var banner = document.getElementById('draft-resume-banner');
  var hasRealContent = draft && draft.wizardData &&
    draft.wizardData.feedstocks && draft.wizardData.feedstocks.length > 0;
  if (hasRealContent && banner) {
    var savedAt = draft.savedAt ? new Date(draft.savedAt).toLocaleDateString() : '';
    var savedAtEl = document.getElementById('draft-saved-at');
    if (savedAtEl) savedAtEl.textContent = savedAt ? '· saved ' + savedAt : '';
    banner.style.display = 'flex';
    document.getElementById('draft-resume-btn').addEventListener('click', function() {
      Object.assign(wizardData, draft.wizardData);
      banner.style.display = 'none';
      if (wizardData.feedstocks && wizardData.feedstocks.length) {
        wizardData.feedstocks.forEach(function(feedstock, i) {
          var checkbox = document.querySelector('input[name="feedstocks"][value="' + feedstock + '"]');
          if (checkbox) checkbox.checked = true;
        });
        buildPropertiesTabs();
        buildAvailabilityTabs();
        var step = draft.currentStep || 1;
        if (step >= 2) {
          wizardData.feedstocks.forEach(function(feedstock, i) {
            var props = wizardData.properties[feedstock] || {};
            var fields = ['carbon','ph','moisture','surface','particle','ash','ec'];
            fields.forEach(function(f) {
              var el = document.getElementById(f + '-' + i);
              if (el && props[f !== 'carbon' ? (f === 'ph' ? 'pH' : f === 'ec' ? 'electricalConductivity' : f === 'surface' ? 'surfaceArea' : f === 'particle' ? 'particleSize' : f === 'ash' ? 'ashContent' : f) : 'carbonContent'] !== undefined) {
                el.value = props[f !== 'carbon' ? (f === 'ph' ? 'pH' : f === 'ec' ? 'electricalConductivity' : f === 'surface' ? 'surfaceArea' : f === 'particle' ? 'particleSize' : f === 'ash' ? 'ashContent' : f) : 'carbonContent'] || '';
              }
            });
            var labVerified = document.getElementById('labverified-' + i);
            if (labVerified && props.labVerified) labVerified.checked = true;
            var labReportDate = document.getElementById('labreportdate-' + i);
            if (labReportDate && props.labReportDate) labReportDate.value = props.labReportDate;
            var avail = wizardData.availability[feedstock] || {};
            var availFrom = document.getElementById('avail-from-' + i);
            var availUntil = document.getElementById('avail-until-' + i);
            if (availFrom && avail.availableFrom) availFrom.value = avail.availableFrom;
            if (availUntil && avail.availableUntil) availUntil.value = avail.availableUntil;
          });
        }
      }
      showStep(draft.currentStep || 1);
    });
    document.getElementById('draft-discard-btn').addEventListener('click', function() {
      clearDraft();
      banner.style.display = 'none';
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

function getInputFiles(id) {
  var input = document.getElementById(id);
  return input && input.files ? Array.prototype.slice.call(input.files) : [];
}

function uploadDocumentFilesSequential(files) {
  var urls = [];
  return files.reduce(function (chain, file) {
    return chain.then(function () {
      var fd = new FormData();
      var name = String(file.name || '').toLowerCase();
      var isPdf = file.type === 'application/pdf' || /\.pdf$/.test(name);
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_PRESET);
      return fetch(isPdf ? CLOUDINARY_RAW_UPLOAD_URL : CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.secure_url) urls.push(d.secure_url);
        })
        .catch(function () {});
    });
  }, Promise.resolve()).then(function () {
    return urls;
  });
}

window.AuthState.onReady(function(user, profile) {
  if (user && profile) prefillWizard(profile, user);
})


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
  return Promise.all(wizardData.feedstocks.map(function(feedstock, index) {
    return Promise.all([
      uploadDocumentFilesSequential(getInputFiles('labreport-' + index)),
      uploadDocumentFilesSequential(getInputFiles('certdocs-' + index))
    ]).then(function(results) {
      return { feedstock: feedstock, labReportUrls: results[0] || [], certDocUrls: results[1] || [] };
    });
  })).then(function(docUploads) {
  const listings = []
  wizardData.feedstocks.forEach(function(feedstock, index) {
    const props = wizardData.properties[feedstock] || {}
    const avail = wizardData.availability[feedstock] || {}
    const docData = docUploads[index] || { labReportUrls: [], certDocUrls: [] }
    listings.push({
      producerUID: window.currentUser.uid,
      producerName: wizardData.business.businessName,
      contactName: wizardData.business.contactName,
      contactEmail: wizardData.business.email,
      state: wizardData.business.state,
      zipcode: wizardData.business.zipcode,
      producerZip: wizardData.business.zipcode,
      optimalRadius: wizardData.business.optimalRadius || null,
      ein: wizardData.business.ein,
      businessWebsite: wizardData.business.businessWebsite,
      equipmentType: wizardData.business.equipmentType,
      pyroTech: wizardData.business.pyroTech || wizardData.business.equipmentType,
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
      labReportUrls: docData.labReportUrls,
      certDocUrls: docData.certDocUrls,
      pricePerTonne: parseFloat(avail.pricePerTonne) || null,
      availableTonnes: parseFloat(avail.availableTonnes) || null,
      minOrderTonnes: parseFloat(avail.minOrderTonnes) || null,
      availableFrom: avail.availableFrom || null,
      availableUntil: avail.availableUntil || null,
      leadTimeDays: parseFloat(avail.leadTimeDays) || null,
      deliveryMethods: avail.deliveryMethods || [],
      description: avail.description || '',
      photos: photoUrls.filter(Boolean),
      status: 'active',
      verified: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
  })

  const promises = listings.map(function(listing) {
    return db.collection('listings').add(listing)
  })

  Promise.all(promises)
    .then(function() {
      clearDraft()
      window.location.href = 'seller.html?submitted=true'
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
})
