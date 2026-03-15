(function () {
  'use strict';

  var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
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
    clean: 'Clean', possible_soil: 'Possible soil', mixed_debris: 'Mixed debris'
  };

  var PARTICLE_LABELS = {
    chipped: 'Chipped', whole_limbs: 'Whole limbs', mixed: 'Mixed'
  };

  var LOADING_LABELS = {
    pile: 'Pile', baled: 'Baled', loose: 'Loose', stacked: 'Stacked'
  };

  var currentStep = 1;
  var photoFiles = [];

  function val(id) { return document.getElementById(id).value.trim(); }
  function checked(id) { return document.getElementById(id).checked; }

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
      alert('Please select at least one biomass type.');
      return false;
    }
    var required = ['f-supplier-type', 'f-zip', 'f-quantity', 'f-min-pickup', 'f-price'];
    for (var i = 0; i < required.length; i++) {
      if (!val(required[i])) {
        document.getElementById(required[i]).focus();
        document.getElementById(required[i]).style.borderColor = '#cc4444';
        setTimeout(function (id) { document.getElementById(id).style.borderColor = ''; }, 2000, required[i]);
        return false;
      }
    }
    return true;
  }

  function validateStep2() {
    var required = ['f-particle-size', 'f-contamination', 'f-moisture', 'f-age', 'f-loading'];
    for (var i = 0; i < required.length; i++) {
      if (!val(required[i])) {
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
      ['Price', '$' + val('f-price') + '/ton' + (checked('f-negotiable') ? ' (negotiable)' : '')],
      ['Particle size', PARTICLE_LABELS[val('f-particle-size')] || val('f-particle-size')],
      ['Contamination', CONTAMINATION_LABELS[val('f-contamination')] || val('f-contamination')],
      ['Moisture', MOISTURE_LABELS[val('f-moisture')] || val('f-moisture')],
      ['Age', val('f-age').replace(/_/g, ' ')],
      ['Loading', LOADING_LABELS[val('f-loading')] || val('f-loading')],
      ['Availability', val('f-availability') || '—'],
      ['Photos', photoFiles.length ? photoFiles.length + ' photo(s) attached' : 'None']
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

    uploadPhotos().then(function (photoUrls) {
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
        contaminationRisk: val('f-contamination'),
        ageOfMaterial: val('f-age'),
        moistureContent: val('f-moisture'),
        loadingType: val('f-loading'),
        estimatedQuantityTons: Number(val('f-quantity')),
        minimumPickupTons: Number(val('f-min-pickup')),
        pricePerTon: Number(val('f-price')),
        negotiable: checked('f-negotiable'),
        locationZip: val('f-zip'),
        harvestDate: val('f-harvest-date'),
        availabilityWindow: val('f-availability'),
        notes: val('f-notes'),
        photos: photoUrls.filter(Boolean),
        status: 'active',
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
    firebase.auth().onAuthStateChanged(function (user) {
      var login = document.getElementById('nav-login');
      var profile = document.getElementById('nav-profile');
      var logout = document.getElementById('nav-logout');

      if (!user) {
        document.getElementById('wizard-wrap').style.display = 'none';
        document.getElementById('auth-gate').style.display = 'block';
        return;
      }

      if (login) login.classList.add('hidden');
      if (profile) profile.classList.remove('hidden');
      if (logout) {
        logout.classList.remove('hidden');
        logout.addEventListener('click', function () {
          firebase.auth().signOut().then(function () { window.location.href = 'index.html'; });
        });
      }

      firebase.firestore().collection('users').doc(user.uid).get().then(function (doc) {
        if (doc.exists) {
          var d = doc.data();
          if (d.name) document.getElementById('f-name').value = d.name;
          if (d.businessName) document.getElementById('f-company').value = d.businessName;
          if (d.zipcode) document.getElementById('f-zip').value = d.zipcode;
        }
        document.getElementById('f-email').value = user.email || '';
      });

      document.getElementById('next-1').addEventListener('click', function () {
        if (validateStep1()) goToStep(2);
      });
      document.getElementById('back-2').addEventListener('click', function () { goToStep(1); });
      document.getElementById('next-2').addEventListener('click', function () {
        if (validateStep2()) { buildReviewSummary(); goToStep(3); }
      });
      document.getElementById('back-3').addEventListener('click', function () { goToStep(2); });
      document.getElementById('submit-btn').addEventListener('click', function () { submitListing(user); });

      document.getElementById('photo-input').addEventListener('change', function (e) {
        handlePhotoSelect(e.target.files);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
