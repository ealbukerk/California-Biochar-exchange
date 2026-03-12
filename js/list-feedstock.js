(function () {
  'use strict';

  var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
  var CLOUDINARY_PRESET = 'biochar_certs';

  function val(id) { return document.getElementById(id).value.trim(); }
  function checked(id) { return document.getElementById(id).checked; }

  function handlePhotoSelect(files) {
    var previews = document.getElementById('photo-previews');
    var arr = Array.prototype.slice.call(files, 0, 5);
    arr.forEach(function (file) {
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

  function uploadPhotos(files) {
    var arr = Array.prototype.slice.call(files, 0, 5);
    if (!arr.length) return Promise.resolve([]);
    var promises = arr.map(function (file) {
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
    var required = ['f-name','f-company','f-email','f-supplier-type','f-biomass-type',
      'f-particle-size','f-contamination','f-age','f-moisture','f-loading',
      'f-quantity','f-min-pickup','f-price','f-zip'];
    var missing = required.filter(function (id) { return !val(id); });
    if (missing.length) {
      alert('Please fill in all required fields.');
      document.getElementById(missing[0]).focus();
      return;
    }

    var btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    var photoFiles = document.getElementById('photo-input').files;
    uploadPhotos(photoFiles).then(function (photoUrls) {
      var listing = {
        supplierUID: user.uid,
        supplierName: val('f-name'),
        company: val('f-company'),
        contactEmail: val('f-email'),
        phone: val('f-phone'),
        supplierType: val('f-supplier-type'),
        biomassType: val('f-biomass-type'),
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
      document.getElementById('success-banner').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      btn.disabled = false;
      btn.textContent = 'Submit Listing';
    }).catch(function (err) {
      console.error(err);
      alert('Submission failed. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Listing';
    });
  }

  function init() {
    firebase.auth().onAuthStateChanged(function (user) {
      var login = document.getElementById('nav-login');
      var profile = document.getElementById('nav-profile');
      var logout = document.getElementById('nav-logout');

      if (!user) {
        document.getElementById('form-wrap').style.display = 'none';
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

      document.getElementById('submit-btn').addEventListener('click', function () {
        submitListing(user);
      });

      document.getElementById('photo-input').addEventListener('change', function (e) {
        handlePhotoSelect(e.target.files);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
