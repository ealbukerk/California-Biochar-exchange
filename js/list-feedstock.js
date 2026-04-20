(function () {
  'use strict';

  var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
  var CLOUDINARY_RAW_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/raw/upload';
  var CLOUDINARY_PRESET = 'biochar_certs';

  var BIOMASS_LABELS = {
    orchard_prunings: 'Orchard Prunings', almond_shells: 'Almond Shells',
    pistachio_shells: 'Pistachio Shells', walnut_shells: 'Walnut Shells',
    corn_stover: 'Corn Stover', rice_husks: 'Rice Husks',
    forestry_slash: 'Forestry Slash', logging_residue: 'Logging Residue',
    thinning_material: 'Thinning Material', clean_wood_waste: 'Clean Wood Waste',
    construction_wood: 'Construction Wood', tree_service_chips: 'Tree Service Chips'
  };

  var SUPPLIER_LABELS = {
    farmer: 'Farmer', sawmill: 'Sawmill', forestry_operator: 'Forestry Operator',
    tree_service: 'Tree Service', recycler: 'Recycler'
  };

  var MOISTURE_LABELS = {
    under_20: 'Under 20%', '20_30': '20–30%', '30_40': '30–40%', over_40: 'Over 40%'
  };

  var CONTAMINATION_LABELS = {
    certified_clean: '✓ Certified clean',
    clean: 'Clean',
    possible_soil: 'Possible soil contact',
    bark_included: 'Bark / organic matter',
    some_soil: 'Some soil contamination',
    possible_treated: 'Possible treated wood',
    mixed_debris: 'Mixed debris',
    unknown: 'Unknown / unverified'
  };

  var PARTICLE_LABELS = {
    fine_dust: 'Fine dust / powder (<5mm)',
    fine_chips: 'Fine chips (5–25mm)',
    chipped: 'Chipped (25–75mm)',
    shredded: 'Shredded / mulched',
    coarse_chunks: 'Coarse chunks (75–150mm)',
    whole_limbs: 'Whole limbs (150mm+)',
    baled: 'Baled',
    mixed: 'Mixed / unsorted'
  };

  var LOADING_LABELS = {
    pile: 'Pile', baled: 'Baled', loose: 'Loose', stacked: 'Stacked'
  };

  var currentStep = 1;
  var photoFiles = [];
  var verificationFiles = [];

  function val(id) { return document.getElementById(id).value.trim(); }
  function checked(id) { return document.getElementById(id).checked; }

  function initHarvestPicker() {
    var input = document.getElementById('f-harvest-date');
    if (!input || input.dataset.pikadayBound === 'true') return;
    input.dataset.pikadayBound = 'true';
    if (typeof Pikaday !== 'function') return;
    new Pikaday({
      field: input,
      format: 'YYYY-MM-DD',
      minDate: new Date(),
      onSelect: function() {
        input.value = this.toString();
      }
    });
  }

  function isLikelyScreenshot(file) {
    if (!file) return false;
    var type = String(file.type || '').toLowerCase();
    if (type !== 'image/png' && type !== 'image/jpeg') return false;
    var name = String(file.name || '');
    return /screenshot|screen shot|screen_shot/i.test(name) || /^IMG_\d+/i.test(name);
  }

  function setVerificationWarning(message) {
    var warning = document.getElementById('verification-input-warning');
    if (!warning) return;
    warning.textContent = message || '';
    warning.style.display = message ? 'block' : 'none';
  }

  function goToStep(n) {
    document.querySelectorAll('.wizard-panel').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('fs-step-' + n).classList.add('active');
    document.querySelectorAll('.wizard-step-dot').forEach(function (dot) {
      var s = Number(dot.getAttribute('data-step'));
      dot.classList.remove('active', 'complete');
      if (s === n) dot.classList.add('active');
      if (s < n) dot.classList.add('complete');
    });
    currentStep = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateStep1() {
    var biomassChecked = Array.prototype.slice.call(document.querySelectorAll('input[name=\"f-biomass-types\"]:checked'));
    if (!biomassChecked.length) {
      console.warn('Feedstock wizard validation failed: no biomass types selected');
      alert('Please select at least one biomass type.');
      return false;
    }
    var required = ['f-supplier-type', 'f-zip', 'f-quantity', 'f-min-pickup', 'f-price'];
    for (var i = 0; i < required.length; i++) {
      if (!val(required[i])) {
        console.warn('Feedstock wizard validation failed: missing ' + required[i]);
        document.getElementById(required[i]).focus();
        document.getElementById(required[i]).style.borderColor = '#cc4444';
        setTimeout(function (id) { document.getElementById(id).style.borderColor = ''; }, 2000, required[i]);
        return false;
      }
    }
    return true;
  }

  function validateStep2() {
  var required = ['f-particle-size', 'f-contamination-debris', 'f-contamination-ash', 'f-contamination-chemical', 'f-contamination-other', 'f-moisture', 'f-age', 'f-loading'];
    for (var i = 0; i < required.length; i++) {
      if (!val(required[i])) {
        console.warn('Feedstock wizard validation failed: missing ' + required[i]);
        document.getElementById(required[i]).focus();
        document.getElementById(required[i]).style.borderColor = '#cc4444';
        setTimeout(function (id) { document.getElementById(id).style.borderColor = ''; }, 2000, required[i]);
        return false;
      }
    }
    return true;
  }

  function buildReviewSummary() {
    var rows = [
      ['Biomass types', Array.prototype.slice.call(document.querySelectorAll('input[name=\"f-biomass-types\"]:checked')).map(function(el) { return BIOMASS_LABELS[el.value] || el.value; }).join(', ') || '—'],
      ['Supplier type', SUPPLIER_LABELS[val('f-supplier-type')] || val('f-supplier-type')],
      ['ZIP code', val('f-zip')],
      ['Quantity', val('f-quantity') + ' tons'],
      ['Min pickup', val('f-min-pickup') + ' tons'],
      ['Price', '$' + val('f-price') + '/ton'],
      ['Particle size', PARTICLE_LABELS[val('f-particle-size')] || val('f-particle-size')],
      ['Physical debris', 'Score ' + (val('f-contamination-debris') || '—') + '/5'],
      ['Soil / ash', 'Score ' + (val('f-contamination-ash') || '—') + '/5'],
      ['Chemical risk', 'Score ' + (val('f-contamination-chemical') || '—') + '/5'],
      ['Other contamination', 'Score ' + (val('f-contamination-other') || '—') + '/5'],
      ['Moisture', MOISTURE_LABELS[val('f-moisture')] || val('f-moisture')],
      ['Age', val('f-age').replace(/_/g, ' ')],
      ['Loading', LOADING_LABELS[val('f-loading')] || val('f-loading')],
      ['Availability', val('f-availability') || '—'],
      ['Photos', photoFiles.length ? photoFiles.length + ' photo(s) attached' : 'None'],
      ['Verification docs', verificationFiles.length ? verificationFiles.length + ' document(s) attached' : 'None']
    ];
    var html = '<div class="review-card-title">Listing Summary</div>';
    rows.forEach(function (r) {
      html += '<div class="review-row"><span class="review-label">' + r[0] + '</span><span class="review-val">' + r[1] + '</span></div>';
    });
    document.getElementById('review-summary').innerHTML = html;
  }

  function handlePhotoSelect(files) {
    photoFiles = Array.prototype.slice.call(files, 0, 5);
    var previews = document.getElementById('photo-previews');
    previews.innerHTML = '';
    photoFiles.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'photo-preview';
        previews.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  function uploadPhotos() {
    if (!photoFiles.length) return Promise.resolve([]);
    var promises = photoFiles.map(function (file) {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_PRESET);
      return fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) { return d.secure_url || ''; });
    });
    return Promise.all(promises);
  }

  function handleVerificationSelect(files) {
    var incoming = Array.prototype.slice.call(files, 0, 5);
    if (incoming.find(isLikelyScreenshot)) {
      verificationFiles = [];
      setVerificationWarning('This looks like a screenshot — please upload the original document file (PDF preferred).');
      return false;
    }
    setVerificationWarning('');
    verificationFiles = incoming;
    var previews = document.getElementById('verification-previews');
    previews.innerHTML = '';
    verificationFiles.forEach(function (file) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;font-size:12px;color:var(--color-text-muted)';
      item.textContent = file.name;
      previews.appendChild(item);
    });
    return true;
  }

  function uploadVerificationDocs() {
    if (!verificationFiles.length) return Promise.resolve([]);
    var urls = [];
    return verificationFiles.reduce(function (chain, file) {
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
          });
      });
    }, Promise.resolve()).then(function () {
      return urls;
    });
  }

  function submitListing(user) {
    if (!val('f-name') || !val('f-company') || !val('f-email')) {
      alert('Please fill in your name, company, and email.');
      return;
    }
    if (!document.getElementById('f-terms').checked) {
      alert('Please confirm you have read and agree to the terms.');
      return;
    }
    var btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Publishing…';

    Promise.all([uploadPhotos(), uploadVerificationDocs()]).then(function (results) {
      var photoUrls = results[0] || [];
      var verificationUrls = results[1] || [];
      var listing = {
        supplierUID: user.uid,
        supplierName: val('f-name'),
        company: val('f-company'),
        contactEmail: val('f-email'),
        phone: val('f-phone'),
        supplierType: val('f-supplier-type'),
        biomassTypes: Array.prototype.slice.call(document.querySelectorAll('input[name=\"f-biomass-types\"]:checked')).map(function(el) { return el.value; }),
        biomassType: Array.prototype.slice.call(document.querySelectorAll('input[name=\"f-biomass-types\"]:checked')).map(function(el) { return el.value; })[0] || '',
        particleSize: val('f-particle-size'),
        contaminationDebris: val('f-contamination-debris'),
        contaminationAsh: val('f-contamination-ash'),
        contaminationChemical: val('f-contamination-chemical'),
        contaminationOther: val('f-contamination-other'),
        contaminationRisk: [val('f-contamination-debris'), val('f-contamination-ash'), val('f-contamination-chemical'), val('f-contamination-other')].filter(Boolean).length > 0
          ? 'scored'
          : 'unknown',
        ageOfMaterial: val('f-age'),
        moistureContent: val('f-moisture'),
        loadingType: val('f-loading'),
        estimatedQuantityTons: Number(val('f-quantity')),
        minimumPickupTons: Number(val('f-min-pickup')),
        pricePerTon: Number(val('f-price')),
        negotiable: checked('f-negotiable'),
        locationZip: val('f-zip'),
        availableFrom: val('f-harvest-date'),
        availableUntil: '',
        harvestDate: val('f-harvest-date'),
        availabilityWindow: val('f-availability'),
        notes: val('f-notes'),
        photos: photoUrls.filter(Boolean),
        verificationDocs: verificationUrls.filter(Boolean),
        supplierVerified: verificationUrls.filter(Boolean).length > 0,
        status: 'active',
        verified: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      return firebase.firestore().collection('feedstock_listings').add(listing);
    }).then(function () {
      document.getElementById('wizard-wrap').style.display = 'none';
      document.getElementById('success-state').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (err) {
      console.error(err);
      alert('Submission failed. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Publish Listing';
    });
  }

  function init() {
    initHarvestPicker();
    var toggleBtn = document.getElementById('f-biomass-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var boxes = Array.prototype.slice.call(document.querySelectorAll('input[name="f-biomass-types"]'));
        var allChecked = boxes.length && boxes.every(function (b) { return b.checked; });
        boxes.forEach(function (b) { b.checked = !allChecked; });
        toggleBtn.textContent = allChecked ? 'Select all' : 'Deselect all';
      });
    }
    document.getElementById('next-1').addEventListener('click', function () {
      if (validateStep1()) goToStep(2);
    });
    document.getElementById('back-2').addEventListener('click', function () { goToStep(1); });
    document.getElementById('next-2').addEventListener('click', function () {
      if (validateStep2()) { buildReviewSummary(); goToStep(3); }
    });
    document.getElementById('back-3').addEventListener('click', function () { goToStep(2); });
    document.getElementById('submit-btn').addEventListener('click', function () {
      if (!window.AuthState || !window.AuthState.user) {
        document.getElementById('wizard-wrap').style.display = 'none';
        document.getElementById('auth-gate').style.display = 'block';
        return;
      }
      submitListing(window.AuthState.user);
    });

    document.getElementById('photo-input').addEventListener('change', function (e) {
      handlePhotoSelect(e.target.files);
    });
    var verificationInput = document.getElementById('verification-input');
    if (verificationInput) {
      verificationInput.addEventListener('change', function (e) {
        if (handleVerificationSelect(e.target.files) === false) {
          e.target.value = '';
          document.getElementById('verification-previews').innerHTML = '';
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.AuthState.onReady(function(user, profile) {
    if (!user) {
      document.getElementById('wizard-wrap').style.display = 'none';
      document.getElementById('auth-gate').style.display = 'block';
      return;
    }
    document.getElementById('wizard-wrap').style.display = 'block';
    document.getElementById('auth-gate').style.display = 'none';
    if (user && profile) {
      var nameEl = document.getElementById('f-name');
      var companyEl = document.getElementById('f-company');
      var emailEl = document.getElementById('f-email');
      var zipEl = document.getElementById('f-zip');
      var supplierTypeEl = document.getElementById('f-supplier-type');
      if (nameEl && profile.name) nameEl.value = profile.name;
      if (companyEl && profile.businessName) companyEl.value = profile.businessName;
      if (emailEl && profile.email) emailEl.value = profile.email;
      if (zipEl && profile.zipcode) zipEl.value = profile.zipcode;
      if (supplierTypeEl && profile.supplierType) supplierTypeEl.value = profile.supplierType;
    }
  });
})();
