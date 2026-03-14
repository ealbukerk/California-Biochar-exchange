(function () {
  'use strict';

  var BIOMASS_LABELS = {
    orchard_prunings: 'Orchard Prunings', almond_shells: 'Almond Shells',
    pistachio_shells: 'Pistachio Shells', walnut_shells: 'Walnut Shells',
    corn_stover: 'Corn Stover', rice_husks: 'Rice Husks',
    forestry_slash: 'Forestry Slash', logging_residue: 'Logging Residue',
    thinning_material: 'Thinning Material', clean_wood_waste: 'Clean Wood Waste',
    construction_wood: 'Construction Wood', tree_service_chips: 'Tree Service Chips'
  };

  var MOISTURE_LABELS = { under_15: 'Under 15%', under_25: 'Under 25%', under_40: 'Under 40%', any: 'Any' };
  var PERIOD_LABELS = { per_week: 'per week', per_month: 'per month', per_year: 'per year', one_time: 'one-time' };
  var CONTAMINATION_LABELS = { clean_only: 'Clean only', soil_acceptable: 'Soil acceptable', mixed_acceptable: 'Mixed acceptable' };
  var PARTICLE_LABELS = { any: 'Any', chipped: 'Chipped', shredded: 'Shredded', whole: 'Whole' };

  var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
  var CLOUDINARY_PRESET = 'biochar_certs';
  var pdPhotoFiles = [];
  var currentStep = 1;

  function val(id) { return document.getElementById(id).value.trim(); }

  function handlePdPhotos(files) {
    pdPhotoFiles = Array.prototype.slice.call(files, 0, 5);
    var previews = document.getElementById('pd-photo-previews');
    if (!previews) return;
    previews.innerHTML = '';
    pdPhotoFiles.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = document.createElement('img');
        img.src = e.target.result;
        img.style.cssText = 'width:100px;height:100px;object-fit:cover;border-radius:var(--radius-md);border:1px solid var(--color-border)';
        previews.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  function uploadPdPhotos() {
    if (!pdPhotoFiles.length) return Promise.resolve([]);
    return Promise.all(pdPhotoFiles.map(function (file) {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_PRESET);
      return fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) { return d.secure_url || ''; });
    }));
  }

  function getChecked(name) {
    return Array.prototype.slice.call(document.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (el) { return el.value; });
  }

  function goToStep(n) {
    document.querySelectorAll('.wizard-panel').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('pd-step-' + n).classList.add('active');
    document.querySelectorAll('.wizard-step-dot').forEach(function (dot) {
      var s = Number(dot.getAttribute('data-step'));
      dot.classList.remove('active', 'complete');
      if (s === n) dot.classList.add('active');
      if (s < n) dot.classList.add('complete');
    });
    currentStep = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function highlight(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.borderColor = '#cc4444';
    setTimeout(function () { el.style.borderColor = ''; }, 2000);
    el.focus();
  }

  function validateStep1() {
    var biomass = getChecked('pd-biomass');
    if (!biomass.length) { alert('Please select at least one biomass type.'); return false; }
    if (!val('pd-volume')) { highlight('pd-volume'); return false; }
    if (!val('pd-volume-period')) { highlight('pd-volume-period'); return false; }
    if (!val('pd-min-shipment')) { highlight('pd-min-shipment'); return false; }
    if (!val('pd-zip')) { highlight('pd-zip'); return false; }
    return true;
  }

  function validateStep2() {
    if (!val('pd-max-moisture')) { highlight('pd-max-moisture'); return false; }
    return true;
  }

  function buildReviewSummary() {
    var biomass = getChecked('pd-biomass').map(function (v) { return BIOMASS_LABELS[v] || v; }).join(', ') || '—';
    var rows = [
      ['Biomass types', biomass],
      ['Volume needed', val('pd-volume') + ' tons ' + (PERIOD_LABELS[val('pd-volume-period')] || '')],
      ['Min shipment', val('pd-min-shipment') + ' tons'],
      ['Max distance', val('pd-max-distance') === 'any' ? 'Any distance' : val('pd-max-distance') + ' miles'],
      ['Price willing to pay', val('pd-price-max') ? '$' + val('pd-price-max') + '/ton max' : 'Negotiable'],
      ['ZIP', val('pd-zip')],
      ['Max moisture', MOISTURE_LABELS[val('pd-max-moisture')] || val('pd-max-moisture')],
      ['Contamination tolerance', CONTAMINATION_LABELS[val('pd-contamination-tolerance')] || '—'],
      ['Particle size', PARTICLE_LABELS[val('pd-particle-size')] || 'Any'],
      ['Storage capacity', val('pd-storage-capacity') ? val('pd-storage-capacity') + ' tons' : '—'],
      ['Loading equipment', getChecked('pd-loading-equip').join(', ') || 'None specified']
    ];
    var html = '<div class="review-card-title">Listing Summary</div>';
    rows.forEach(function (r) {
      html += '<div class="review-row"><span class="review-label">' + r[0] + '</span><span class="review-val">' + r[1] + '</span></div>';
    });
    document.getElementById('pd-review-summary').innerHTML = html;
  }

  function submitDemand(user) {
    if (!val('pd-company') || !val('pd-name') || !val('pd-email')) {
      alert('Please fill in operation name, contact name, and email.');
      return;
    }
    var btn = document.getElementById('pd-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Posting…';

    var listing = {
      producerUID: user.uid,
      producerName: val('pd-name'),
      company: val('pd-company'),
      contactEmail: val('pd-email'),
      phone: val('pd-phone'),
      acceptedBiomassTypes: getChecked('pd-biomass'),
      volumeNeeded: Number(val('pd-volume')),
      volumePeriod: val('pd-volume-period'),
      minimumShipmentTons: Number(val('pd-min-shipment')),
      maxSourcingDistance: val('pd-max-distance'),
      pricePerTonMax: Number(val('pd-price-max')) || null,
      locationZip: val('pd-zip'),
      maxMoistureAccepted: val('pd-max-moisture'),
      contaminationTolerance: val('pd-contamination-tolerance'),
      preferredParticleSize: val('pd-particle-size'),
      preprocessingCapability: val('pd-preprocessing'),
      pyroTech: val('pd-pyro-tech'),
      storageCapacityTons: Number(val('pd-storage-capacity')) || null,
      loadingEquipment: getChecked('pd-loading-equip'),
      notes: val('pd-notes'),
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    uploadPdPhotos().then(function (photoUrls) {
      listing.photos = photoUrls.filter(Boolean);
      return firebase.firestore().collection('feedstock_demand').add(listing);
    }).then(function () {
      document.getElementById('wizard-wrap').style.display = 'none';
      document.getElementById('success-state').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (err) {
      console.error(err);
      alert('Submission failed. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Post Demand Listing';
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
          if (d.businessName) document.getElementById('pd-company').value = d.businessName;
          if (d.name) document.getElementById('pd-name').value = d.name;
          if (d.zipcode) document.getElementById('pd-zip').value = d.zipcode;
          if (d.pyroTech) document.getElementById('pd-pyro-tech').value = d.pyroTech;
          if (d.maxMoistureAccepted) document.getElementById('pd-max-moisture').value = d.maxMoistureAccepted;
          if (d.contaminationTolerance) document.getElementById('pd-contamination-tolerance').value = d.contaminationTolerance;
          if (d.acceptedBiomassTypes) {
            d.acceptedBiomassTypes.forEach(function (v) {
              var cb = document.querySelector('input[name="pd-biomass"][value="' + v + '"]');
              if (cb) cb.checked = true;
            });
          }
        }
        document.getElementById('pd-email').value = user.email || '';
      });

      var pdPhotoInput = document.getElementById('pd-photo-input');
      if (pdPhotoInput) pdPhotoInput.addEventListener('change', function (e) { handlePdPhotos(e.target.files); });

      document.getElementById('pd-next-1').addEventListener('click', function () {
        if (validateStep1()) goToStep(2);
      });
      document.getElementById('pd-back-2').addEventListener('click', function () { goToStep(1); });
      document.getElementById('pd-next-2').addEventListener('click', function () {
        if (validateStep2()) { buildReviewSummary(); goToStep(3); }
      });
      document.getElementById('pd-back-3').addEventListener('click', function () { goToStep(2); });
      document.getElementById('pd-submit-btn').addEventListener('click', function () { submitDemand(user); });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
