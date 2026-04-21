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
    tree_service: 'Tree Service', recycler: 'Recycler', aggregator: 'Aggregator / Processor',
    broker: 'Broker'
  };

  var MOISTURE_LABELS = {
    under_20: 'Under 20%', '20_30': '20–30%', '30_40': '30–40%', over_40: 'Over 40%'
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
  var profileData = null;

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function checked(id) {
    var el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function todayIso() {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function toDateOnly(value) {
    if (!value) return null;
    var date = new Date(value);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function getProfileField(key) {
    return profileData && profileData[key] ? String(profileData[key]).trim() : '';
  }

  function getSupplierType() {
    return val('f-supplier-type') || getProfileField('supplierType');
  }

  function getListingZip() {
    return val('f-zip') || getProfileField('zipcode');
  }

  function getSelectedBiomassTypes() {
    return Array.prototype.slice.call(document.querySelectorAll('input[name="f-biomass-types"]:checked')).map(function (el) {
      return el.value;
    });
  }

  function getAvailableFromValue() {
    return checked('f-available-now') ? todayIso() : val('f-available-from');
  }

  function getAvailableUntilValue() {
    return val('f-available-until');
  }

  function getAvailabilitySummary() {
    var from = getAvailableFromValue();
    var until = getAvailableUntilValue();
    if (checked('f-available-now')) {
      return until ? 'Available now until ' + until : 'Available now';
    }
    if (from && until) return from + ' to ' + until;
    if (from) return 'Available from ' + from;
    return 'Availability on request';
  }

  function listingIsImmediatelyBrowsable(listing) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var oneMonthOut = new Date(today.getTime());
    oneMonthOut.setDate(oneMonthOut.getDate() + 30);
    var from = listing && listing.availableFrom ? new Date(listing.availableFrom) : null;
    var until = listing && listing.availableUntil ? new Date(listing.availableUntil) : null;
    if (from && !Number.isNaN(from.getTime())) from.setHours(0, 0, 0, 0);
    if (until && !Number.isNaN(until.getTime())) until.setHours(0, 0, 0, 0);
    if (until && !Number.isNaN(until.getTime()) && until < today) return false;
    if (from && !Number.isNaN(from.getTime()) && from > oneMonthOut) return false;
    return String(listing.status || '').toLowerCase() === 'active';
  }

  function toast(message, type, durationMs) {
    if (window.UIUtils && typeof window.UIUtils.toast === 'function') {
      window.UIUtils.toast(message, type, durationMs);
    }
  }

  function showFieldError(id, message) {
    if (window.UIUtils && typeof window.UIUtils.showFieldError === 'function') {
      window.UIUtils.showFieldError(id, message);
      return;
    }
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add('field-error');
    el.focus();
  }

  function clearFieldError(id) {
    if (window.UIUtils && typeof window.UIUtils.clearFieldError === 'function') {
      window.UIUtils.clearFieldError(id);
      return;
    }
    var el = document.getElementById(id);
    if (el) el.classList.remove('field-error');
  }

  function setButtonLoading(btn, isLoading, loadingText) {
    if (window.UIUtils && typeof window.UIUtils.setButtonLoading === 'function') {
      window.UIUtils.setButtonLoading(btn, isLoading, loadingText);
      return;
    }
    if (!btn) return;
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? (loadingText || 'Saving...') : btn.dataset.originalText;
  }

  function syncProfileFields(profile, user) {
    profileData = profile || profileData || {};
    var supplierType = getProfileField('supplierType');
    var zipcode = getProfileField('zipcode');
    var name = getProfileField('name');
    var businessName = getProfileField('businessName');
    var email = getProfileField('email') || (user && user.email) || '';
    var phone = getProfileField('phone');

    if (document.getElementById('f-supplier-type')) document.getElementById('f-supplier-type').value = supplierType;
    if (document.getElementById('f-zip')) document.getElementById('f-zip').value = zipcode;
    if (document.getElementById('f-name')) document.getElementById('f-name').value = name;
    if (document.getElementById('f-company')) document.getElementById('f-company').value = businessName;
    if (document.getElementById('f-email')) document.getElementById('f-email').value = email;
    if (document.getElementById('f-phone')) document.getElementById('f-phone').value = phone;
    if (document.getElementById('f-profile-company')) document.getElementById('f-profile-company').textContent = businessName || 'Add this in your profile';
    if (document.getElementById('f-profile-name')) document.getElementById('f-profile-name').textContent = name || 'Add this in your profile';
    if (document.getElementById('f-profile-supplier-type')) {
      document.getElementById('f-profile-supplier-type').textContent = SUPPLIER_LABELS[supplierType] || 'Add supplier type in your profile';
    }
    if (document.getElementById('f-profile-zip')) {
      document.getElementById('f-profile-zip').textContent = zipcode || 'Add ZIP code in your profile';
    }
    if (document.getElementById('f-profile-email')) document.getElementById('f-profile-email').textContent = email || 'Add this in your profile';
    if (document.getElementById('f-profile-phone')) document.getElementById('f-profile-phone').textContent = phone || 'Optional';
    if (document.getElementById('f-review-company')) document.getElementById('f-review-company').textContent = businessName || 'Add this in your profile';
    if (document.getElementById('f-review-name')) document.getElementById('f-review-name').textContent = name || 'Add this in your profile';
    if (document.getElementById('f-review-email')) document.getElementById('f-review-email').textContent = email || 'Add this in your profile';
    if (document.getElementById('f-review-phone')) document.getElementById('f-review-phone').textContent = phone || 'Optional';
  }

  function initDatePickers() {
    if (typeof Pikaday !== 'function') return;
    ['f-available-from', 'f-available-until'].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || input.dataset.pikadayBound === 'true') return;
      input.dataset.pikadayBound = 'true';
      new Pikaday({
        field: input,
        format: 'YYYY-MM-DD',
        minDate: new Date(),
        onSelect: function () {
          input.value = this.toString();
        }
      });
    });
  }

  function syncAvailabilityUI() {
    var nowChecked = checked('f-available-now');
    var fromInput = document.getElementById('f-available-from');
    var note = document.getElementById('f-availability-note');
    if (!fromInput) return;

    if (nowChecked) {
      if (!fromInput.dataset.manualValue) fromInput.dataset.manualValue = fromInput.value || '';
      fromInput.value = todayIso();
      fromInput.classList.add('is-disabled');
      fromInput.dataset.autoValue = 'true';
      if (note) note.textContent = 'We will set Available from to today so your listing can be shown immediately when it qualifies for browse.';
    } else {
      if (fromInput.dataset.autoValue === 'true') {
        fromInput.value = fromInput.dataset.manualValue || '';
      }
      fromInput.classList.remove('is-disabled');
      fromInput.dataset.autoValue = 'false';
      if (note) note.textContent = 'Choose the first date producers can actually pick up this material.';
    }
  }

  function updateBiomassSummary() {
    var selected = getSelectedBiomassTypes();
    var summary = document.getElementById('f-biomass-summary');
    if (!summary) return;
    if (!selected.length) {
      summary.textContent = 'No material types selected yet.';
      return;
    }
    summary.textContent = selected.length + ' material type' + (selected.length === 1 ? '' : 's') + ' selected.';
  }

  function goToStep(n) {
    document.querySelectorAll('.wizard-panel').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('fs-step-' + n).classList.add('active');
    document.querySelectorAll('.wizard-step-dot').forEach(function (dot) {
      var stepNumber = Number(dot.getAttribute('data-step'));
      dot.classList.remove('active', 'complete');
      if (stepNumber === n) dot.classList.add('active');
      if (stepNumber < n) dot.classList.add('complete');
    });
    currentStep = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateStep1() {
    var selected = getSelectedBiomassTypes();
    if (!selected.length) {
      toast('Select at least one biomass type.', 'warning');
      return false;
    }
    var required = [
      ['f-quantity', 'Enter an estimated quantity.'],
      ['f-min-pickup', 'Enter a minimum pickup quantity.'],
      ['f-price', 'Enter a price per ton.']
    ];
    for (var i = 0; i < required.length; i++) {
      clearFieldError(required[i][0]);
      if (!val(required[i][0])) {
        showFieldError(required[i][0], required[i][1]);
        document.getElementById(required[i][0]).focus();
        return false;
      }
    }
    if (!getSupplierType()) {
      toast('Add your supplier type in your profile before listing biomass.', 'warning');
      return false;
    }
    if (!getListingZip()) {
      toast('Add your ZIP code in your profile before listing biomass.', 'warning');
      return false;
    }
    return true;
  }

  function validateStep2() {
    var required = [
      ['f-particle-size', 'Choose a particle size.'],
      ['f-contamination-debris', 'Score physical debris contamination.'],
      ['f-contamination-ash', 'Score soil / ash contamination.'],
      ['f-contamination-chemical', 'Score chemical contamination.'],
      ['f-contamination-other', 'Score other contamination.'],
      ['f-moisture', 'Choose a moisture range.'],
      ['f-age', 'Choose an age of material.'],
      ['f-loading', 'Choose a loading type.']
    ];
    for (var i = 0; i < required.length; i++) {
      clearFieldError(required[i][0]);
      if (!val(required[i][0])) {
        showFieldError(required[i][0], required[i][1]);
        document.getElementById(required[i][0]).focus();
        return false;
      }
    }

    clearFieldError('f-available-from');
    clearFieldError('f-available-until');
    if (!checked('f-available-now') && !val('f-available-from')) {
      showFieldError('f-available-from', 'Choose when this material becomes available.');
      document.getElementById('f-available-from').focus();
      return false;
    }

    var from = toDateOnly(getAvailableFromValue());
    var until = toDateOnly(getAvailableUntilValue());
    if (until && from && until < from) {
      showFieldError('f-available-until', 'Available until must be on or after Available from.');
      document.getElementById('f-available-until').focus();
      return false;
    }

    return true;
  }

  function buildReviewSummary() {
    var rows = [
      ['Biomass types', getSelectedBiomassTypes().map(function (type) { return BIOMASS_LABELS[type] || type; }).join(', ') || '—'],
      ['Supplier type', SUPPLIER_LABELS[getSupplierType()] || getSupplierType() || '—'],
      ['ZIP code', getListingZip() || '—'],
      ['Quantity', val('f-quantity') ? val('f-quantity') + ' tons' : '—'],
      ['Minimum pickup', val('f-min-pickup') ? val('f-min-pickup') + ' tons' : '—'],
      ['Price', val('f-price') ? '$' + val('f-price') + '/ton' : '—'],
      ['Particle size', PARTICLE_LABELS[val('f-particle-size')] || val('f-particle-size') || '—'],
      ['Physical debris', val('f-contamination-debris') ? 'Score ' + val('f-contamination-debris') + '/5' : '—'],
      ['Soil / ash', val('f-contamination-ash') ? 'Score ' + val('f-contamination-ash') + '/5' : '—'],
      ['Chemical risk', val('f-contamination-chemical') ? 'Score ' + val('f-contamination-chemical') + '/5' : '—'],
      ['Other contamination', val('f-contamination-other') ? 'Score ' + val('f-contamination-other') + '/5' : '—'],
      ['Moisture', MOISTURE_LABELS[val('f-moisture')] || val('f-moisture') || '—'],
      ['Age', val('f-age') ? val('f-age').replace(/_/g, ' ') : '—'],
      ['Loading', LOADING_LABELS[val('f-loading')] || val('f-loading') || '—'],
      ['Availability', getAvailabilitySummary()],
      ['Photos', photoFiles.length ? photoFiles.length + ' photo(s) attached' : 'None'],
      ['Verification docs', verificationFiles.length ? verificationFiles.length + ' document(s) attached' : 'None']
    ];
    var html = '<div class="review-card-title">Listing Summary</div>';
    rows.forEach(function (row) {
      html += '<div class="review-row"><span class="review-label">' + row[0] + '</span><span class="review-val">' + row[1] + '</span></div>';
    });
    document.getElementById('review-summary').innerHTML = html;
  }

  function handlePhotoSelect(files) {
    photoFiles = Array.prototype.slice.call(files || [], 0, 5);
    var previews = document.getElementById('photo-previews');
    if (!previews) return;
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
    return photoFiles.reduce(function (chain, file) {
      return chain.then(function (urls) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', CLOUDINARY_PRESET);
        return fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            if (data && data.secure_url) urls.push(data.secure_url);
            return urls;
          });
      });
    }, Promise.resolve([]));
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

  function handleVerificationSelect(files) {
    var incoming = Array.prototype.slice.call(files || [], 0, 5);
    if (incoming.find(isLikelyScreenshot)) {
      verificationFiles = [];
      setVerificationWarning('This looks like a screenshot — please upload the original document file (PDF preferred).');
      return false;
    }
    setVerificationWarning('');
    verificationFiles = incoming;
    var previews = document.getElementById('verification-previews');
    if (!previews) return true;
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
          .then(function (response) { return response.json(); })
          .then(function (data) {
            if (data && data.secure_url) urls.push(data.secure_url);
          });
      });
    }, Promise.resolve()).then(function () {
      return urls;
    });
  }

  function buildListingPayload(user, mode, photoUrls, verificationUrls) {
    var biomassTypes = getSelectedBiomassTypes();
    var availableFrom = getAvailableFromValue();
    var availableUntil = getAvailableUntilValue();
    return {
      supplierUID: user.uid,
      supplierName: val('f-name'),
      company: val('f-company'),
      contactEmail: val('f-email'),
      phone: val('f-phone'),
      supplierType: getSupplierType(),
      biomassTypes: biomassTypes,
      biomassType: biomassTypes[0] || '',
      particleSize: val('f-particle-size'),
      contaminationDebris: val('f-contamination-debris'),
      contaminationAsh: val('f-contamination-ash'),
      contaminationChemical: val('f-contamination-chemical'),
      contaminationOther: val('f-contamination-other'),
      contaminationRisk: 'scored',
      ageOfMaterial: val('f-age'),
      moistureContent: val('f-moisture'),
      loadingType: val('f-loading'),
      estimatedQuantityTons: Number(val('f-quantity')),
      minimumPickupTons: Number(val('f-min-pickup')),
      pricePerTon: Number(val('f-price')),
      negotiable: true,
      locationZip: getListingZip(),
      availableNow: checked('f-available-now'),
      availableFrom: availableFrom,
      availableUntil: availableUntil,
      harvestDate: availableFrom,
      notes: val('f-notes'),
      photos: photoUrls.filter(Boolean),
      verificationDocs: verificationUrls.filter(Boolean),
      supplierVerified: verificationUrls.filter(Boolean).length > 0,
      status: mode === 'draft' ? 'draft' : 'active',
      verified: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  }

  function showSuccess(mode, result) {
    document.getElementById('wizard-wrap').style.display = 'none';
    document.getElementById('success-state').style.display = 'block';

    var titleEl = document.getElementById('success-title');
    var copyEl = document.getElementById('success-copy');
    var viewEl = document.getElementById('success-view-listing');
    var nextEl = document.getElementById('success-next-action');
    var browseEl = document.getElementById('success-browse-link');
    var resetEl = document.getElementById('success-reset-link');
    var isBrowsable = result && result.listing ? listingIsImmediatelyBrowsable(result.listing) : false;

    if (viewEl) {
      viewEl.style.display = 'none';
      viewEl.textContent = 'View listing';
    }
    if (nextEl) {
      nextEl.style.display = 'none';
      nextEl.textContent = 'Next step';
    }

    if (mode === 'draft') {
      if (titleEl) titleEl.textContent = 'Draft saved';
      if (copyEl) copyEl.textContent = 'Your draft is saved privately and is not visible in the biomass marketplace yet.';
      if (nextEl) {
        nextEl.href = 'profile.html';
        nextEl.textContent = 'Return to profile';
        nextEl.style.display = 'inline-flex';
      }
      if (browseEl) browseEl.textContent = 'Browse all feedstock';
      if (resetEl) resetEl.textContent = 'Start another listing';
    } else {
      if (titleEl) titleEl.textContent = isBrowsable ? 'Your listing is live!' : 'Your listing was published';
      if (copyEl) {
        copyEl.textContent = isBrowsable
          ? 'Biochar producers can now find and contact you.'
          : 'Your listing is published and will appear in browse automatically when its availability date gets closer.';
      }
      if (viewEl && result && result.id) {
        viewEl.href = 'feedstock-listing.html?id=' + encodeURIComponent(result.id);
        viewEl.style.display = 'inline-flex';
      }
      if (browseEl) browseEl.textContent = 'Browse all feedstock';
      if (resetEl) resetEl.textContent = 'List another material';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function saveListing(mode) {
    var user = window.AuthState && window.AuthState.user;
    if (!user) {
      document.getElementById('wizard-wrap').style.display = 'none';
      document.getElementById('auth-gate').style.display = 'block';
      return;
    }
    if (!validateStep1()) {
      goToStep(1);
      return;
    }
    if (!validateStep2()) {
      goToStep(2);
      return;
    }
    if (!val('f-name') || !val('f-company') || !val('f-email')) {
      toast('Complete your profile contact details before saving this listing.', 'warning');
      return;
    }
    if (mode === 'publish' && !checked('f-terms')) {
      toast('Please confirm the terms before publishing.', 'warning');
      return;
    }

    var activeBtn = document.getElementById(mode === 'draft' ? 'save-draft-btn' : 'submit-btn');
    var otherBtn = document.getElementById(mode === 'draft' ? 'submit-btn' : 'save-draft-btn');
    setButtonLoading(activeBtn, true, mode === 'draft' ? 'Saving draft…' : 'Publishing…');
    if (otherBtn) otherBtn.disabled = true;

    Promise.all([uploadPhotos(), uploadVerificationDocs()])
      .then(function (results) {
        var listing = buildListingPayload(user, mode, results[0] || [], results[1] || []);
        return firebase.firestore().collection('feedstock_listings').add(listing).then(function (docRef) {
          return { id: docRef.id, listing: listing };
        });
      })
      .then(function (result) {
        toast(mode === 'draft' ? 'Draft saved.' : 'Listing published.', 'success');
        showSuccess(mode, result);
      })
      .catch(function (error) {
        console.error(error);
        toast(mode === 'draft' ? 'Draft save failed. Please try again.' : 'Submission failed. Please try again.', 'error', 4200);
      })
      .finally(function () {
        setButtonLoading(activeBtn, false);
        if (otherBtn) otherBtn.disabled = false;
      });
  }

  function bindFieldClearers() {
    ['f-quantity', 'f-min-pickup', 'f-price', 'f-particle-size', 'f-contamination-debris', 'f-contamination-ash', 'f-contamination-chemical', 'f-contamination-other', 'f-moisture', 'f-age', 'f-loading', 'f-available-from', 'f-available-until'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var eventName = el.tagName === 'SELECT' || el.classList.contains('date-picker-input') ? 'change' : 'input';
      el.addEventListener(eventName, function () { clearFieldError(id); });
    });
  }

  function init() {
    initDatePickers();
    syncAvailabilityUI();
    updateBiomassSummary();
    bindFieldClearers();

    Array.prototype.slice.call(document.querySelectorAll('input[name="f-biomass-types"]')).forEach(function (box) {
      box.addEventListener('change', updateBiomassSummary);
    });

    var availableNow = document.getElementById('f-available-now');
    if (availableNow) {
      availableNow.addEventListener('change', function () {
        syncAvailabilityUI();
        clearFieldError('f-available-from');
      });
    }
    var availableFrom = document.getElementById('f-available-from');
    if (availableFrom) {
      availableFrom.addEventListener('change', function () {
        if (!checked('f-available-now')) availableFrom.dataset.manualValue = availableFrom.value || '';
      });
    }

    document.getElementById('next-1').addEventListener('click', function () {
      if (validateStep1()) goToStep(2);
    });
    document.getElementById('back-2').addEventListener('click', function () { goToStep(1); });
    document.getElementById('next-2').addEventListener('click', function () {
      if (validateStep2()) {
        buildReviewSummary();
        goToStep(3);
      }
    });
    document.getElementById('back-3').addEventListener('click', function () { goToStep(2); });
    document.getElementById('submit-btn').addEventListener('click', function () { saveListing('publish'); });
    document.getElementById('save-draft-btn').addEventListener('click', function () { saveListing('draft'); });

    document.getElementById('photo-input').addEventListener('change', function (e) {
      handlePhotoSelect(e.target.files);
      buildReviewSummary();
    });

    var verificationInput = document.getElementById('verification-input');
    if (verificationInput) {
      verificationInput.addEventListener('change', function (e) {
        if (handleVerificationSelect(e.target.files) === false) {
          e.target.value = '';
          document.getElementById('verification-previews').innerHTML = '';
        }
        buildReviewSummary();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.AuthState.onReady(function (user, profile) {
    if (!user) {
      document.getElementById('wizard-wrap').style.display = 'none';
      document.getElementById('auth-gate').style.display = 'block';
      return;
    }
    document.getElementById('wizard-wrap').style.display = 'block';
    document.getElementById('auth-gate').style.display = 'none';
    syncProfileFields(profile || {}, user);
    syncAvailabilityUI();
    buildReviewSummary();
  });
})();
