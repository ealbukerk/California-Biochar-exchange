(function () {
  'use strict';

  var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
  var CLOUDINARY_PRESET = 'biochar_certs';

  var wizardData = {
    supplierName: '',
    contactEmail: '',
    projectName: '',
    projectType: '',
    standard: '',
    vintageYear: '',
    projectLocation: '',
    registryUrl: '',
    volumeTonnes: '',
    pricePerTonne: '',
    cobenefits: [],
    documents: []
  };

  var currentStep = 1;
  var docFiles = [];

  function showStep(step) {
    document.querySelectorAll('.wizard-panel').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('lc-step-' + step).classList.add('active');
    document.querySelectorAll('.wizard-step').forEach(function(s) {
      var n = Number(s.getAttribute('data-step'));
      s.classList.toggle('active', n === step);
    });
    currentStep = step;
  }

  function verifyLink() {
    var url = document.getElementById('lc-registry').value.trim();
    var status = document.getElementById('lc-verify-status');
    if (!url) { status.textContent = 'Enter a URL first.'; return; }
    status.textContent = 'Checking…';
    fetch(url, { method: 'HEAD' }).then(function(r) {
      status.textContent = r.ok ? '✓ Link verified' : 'Link could not be verified';
    }).catch(function() {
      status.textContent = 'Could not verify link.';
    });
  }

  function validateStep1() {
    var required = ['lc-project-name','lc-project-type','lc-standard','lc-vintage','lc-location'];
    for (var i = 0; i < required.length; i++) {
      var el = document.getElementById(required[i]);
      if (!el || !el.value.trim()) return false;
    }
    return true;
  }

  function validateStep2() {
    if (!document.getElementById('lc-volume').value.trim()) return false;
    if (!document.getElementById('lc-price').value.trim()) return false;
    return true;
  }

  function validateStep3() {
    return docFiles.length > 0;
  }

  function collectData() {
    wizardData.projectName = document.getElementById('lc-project-name').value.trim();
    wizardData.projectType = document.getElementById('lc-project-type').value;
    wizardData.standard = document.getElementById('lc-standard').value;
    wizardData.vintageYear = Number(document.getElementById('lc-vintage').value);
    wizardData.projectLocation = document.getElementById('lc-location').value.trim();
    wizardData.registryUrl = document.getElementById('lc-registry').value.trim();
    wizardData.volumeTonnes = Number(document.getElementById('lc-volume').value);
    wizardData.pricePerTonne = Number(document.getElementById('lc-price').value);
    wizardData.cobenefits = Array.prototype.slice.call(document.querySelectorAll('input[name="lc-cobenefit"]:checked')).map(function(el) { return el.value; });
  }

  function buildReview() {
    collectData();
    var review = document.getElementById('lc-review');
    review.innerHTML =
      '<div><strong>Project</strong>: ' + wizardData.projectName + '</div>' +
      '<div><strong>Type</strong>: ' + wizardData.projectType + '</div>' +
      '<div><strong>Standard</strong>: ' + wizardData.standard + '</div>' +
      '<div><strong>Vintage</strong>: ' + wizardData.vintageYear + '</div>' +
      '<div><strong>Location</strong>: ' + wizardData.projectLocation + '</div>' +
      '<div><strong>Registry</strong>: ' + (wizardData.registryUrl || 'Not provided') + '</div>' +
      '<div><strong>Volume</strong>: ' + wizardData.volumeTonnes + ' tCO₂e</div>' +
      '<div><strong>Price</strong>: $' + wizardData.pricePerTonne + '/tonne</div>' +
      '<div><strong>Co-benefits</strong>: ' + (wizardData.cobenefits.length ? wizardData.cobenefits.join(', ') : 'None') + '</div>' +
      '<div><strong>Documents</strong>: ' + docFiles.length + ' file(s)</div>';
  }

  function handleDocSelect(files) {
    docFiles = Array.prototype.slice.call(files, 0, 5);
    var list = document.getElementById('lc-doc-list');
    list.innerHTML = '';
    docFiles.forEach(function(file) {
      var item = document.createElement('div');
      item.className = 'doc-item';
      item.textContent = file.name;
      list.appendChild(item);
    });
  }

  function uploadDocs() {
    var promises = docFiles.map(function(file) {
      var fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', CLOUDINARY_PRESET);
      return fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(d) { return d.secure_url || ''; });
    });
    return Promise.all(promises);
  }

  function submitListing(user) {
    collectData();
    uploadDocs().then(function(urls) {
      return firebase.firestore().collection('carbon_listings').add({
        supplierUID: user.uid,
        supplierName: wizardData.supplierName,
        contactEmail: wizardData.contactEmail,
        projectName: wizardData.projectName,
        projectType: wizardData.projectType,
        standard: wizardData.standard,
        vintageYear: wizardData.vintageYear,
        volumeTonnes: wizardData.volumeTonnes,
        pricePerTonne: wizardData.pricePerTonne,
        cobenefits: wizardData.cobenefits,
        projectLocation: wizardData.projectLocation,
        registryUrl: wizardData.registryUrl,
        documents: urls.filter(Boolean),
        verified: false,
        status: 'active',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function() {
      window.location.href = 'profile.html';
    }).catch(function() {
      alert('Submission failed. Please try again.');
    });
  }

  function bindEvents() {
    document.getElementById('lc-verify-link').addEventListener('click', verifyLink);
    document.getElementById('lc-next-1').addEventListener('click', function() {
      if (!validateStep1()) { alert('Please complete all required fields.'); return; }
      showStep(2);
    });
    document.getElementById('lc-back-2').addEventListener('click', function() { showStep(1); });
    document.getElementById('lc-next-2').addEventListener('click', function() {
      if (!validateStep2()) { alert('Please enter volume and price.'); return; }
      showStep(3);
    });
    document.getElementById('lc-back-3').addEventListener('click', function() { showStep(2); });
    document.getElementById('lc-next-3').addEventListener('click', function() {
      if (!validateStep3()) { alert('Please upload at least one document.'); return; }
      buildReview();
      showStep(4);
    });
    document.getElementById('lc-back-4').addEventListener('click', function() { showStep(3); });
    document.getElementById('lc-submit').addEventListener('click', function() {
      var user = firebase.auth().currentUser;
      if (!user) { window.location.href = 'auth.html'; return; }
      submitListing(user);
    });
    document.getElementById('lc-doc-drop').addEventListener('click', function() {
      document.getElementById('lc-doc-input').click();
    });
    document.getElementById('lc-doc-input').addEventListener('change', function(e) {
      handleDocSelect(e.target.files);
    });
  }

  window.AuthState.onReady(function(user, profile) {
    if (!user) {
      document.getElementById('wizard-wrap').style.display = 'none';
      document.getElementById('auth-gate').style.display = 'block';
      return;
    }
    wizardData.supplierName = (profile && (profile.businessName || profile.name)) || '';
    wizardData.contactEmail = (profile && profile.email) || (user && user.email) || '';
  });

  document.addEventListener('DOMContentLoaded', bindEvents);
})();
