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
  var PERIOD_LABELS = { per_week: '/week', per_month: '/month', per_year: '/year', one_time: 'one-time' };
  var CONTAMINATION_LABELS = { clean_only: 'Clean only', soil_acceptable: 'Soil OK', mixed_acceptable: 'Mixed OK' };
  var PYRO_LABELS = { kiln: 'Kiln', retort: 'Retort', continuous_reactor: 'Continuous reactor', gasifier: 'Gasifier', other: 'Other' };

  var state = {
    listings: [],
    filtered: [],
    supplierLat: null,
    supplierLng: null,
    supplierBiomassType: '',
    filters: { biomassType: '', moisture: '', sort: 'newest' }
  };

  function haversine(lat1, lng1, lat2, lng2) {
    var R = 3958.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
            Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function geocodeZip(zip) {
    return fetch('https://api.zippopotam.us/us/' + zip)
      .then(function (r) { if (!r.ok) throw new Error('bad zip'); return r.json(); })
      .then(function (d) { return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; });
  }

  function geocodeListings(listings) {
    return Promise.all(listings.map(function (l) {
      if (!l.locationZip || l._lat) return Promise.resolve(l);
      return geocodeZip(l.locationZip)
        .then(function (c) { l._lat = c.lat; l._lng = c.lng; return l; })
        .catch(function () { return l; });
    }));
  }

  function computeDistances() {
    if (!state.supplierLat) return;
    state.listings.forEach(function (l) {
      if (l._lat && l._lng) {
        l._dist = Math.round(haversine(state.supplierLat, state.supplierLng, l._lat, l._lng));
      }
    });
  }

  function computeMatchScore(l) {
    var score = 0;
    var max = 4;
    if (state.supplierBiomassType && l.acceptedBiomassTypes && l.acceptedBiomassTypes.indexOf(state.supplierBiomassType) !== -1) score++;
    if (l._dist !== undefined && l.maxSourcingDistance !== 'any' && l._dist <= Number(l.maxSourcingDistance)) score++;
    else if (l.maxSourcingDistance === 'any') score++;
    if (l.contaminationTolerance && l.contaminationTolerance !== 'clean_only') score++;
    else if (l.contaminationTolerance === 'clean_only') score += 0.5;
    if (l.maxMoistureAccepted === 'any' || l.maxMoistureAccepted === 'under_40') score++;
    l._score = Math.round((score / max) * 100);
    return l;
  }

  function applyFilters() {
    var f = state.filters;
    var list = state.listings.map(computeMatchScore);
    if (f.biomassType) list = list.filter(function (l) {
      return l.acceptedBiomassTypes && l.acceptedBiomassTypes.indexOf(f.biomassType) !== -1;
    });
    if (f.moisture === 'under_15') list = list.filter(function (l) { return l.maxMoistureAccepted === 'under_15' || l.maxMoistureAccepted === 'under_25' || l.maxMoistureAccepted === 'under_40' || l.maxMoistureAccepted === 'any'; });
    if (f.moisture === 'under_25') list = list.filter(function (l) { return l.maxMoistureAccepted === 'under_25' || l.maxMoistureAccepted === 'under_40' || l.maxMoistureAccepted === 'any'; });
    if (f.moisture === 'under_40') list = list.filter(function (l) { return l.maxMoistureAccepted === 'under_40' || l.maxMoistureAccepted === 'any'; });

    if (f.sort === 'closest' && state.supplierLat) {
      list.sort(function (a, b) { return (a._dist || 9999) - (b._dist || 9999); });
    } else if (f.sort === 'largest') {
      list.sort(function (a, b) { return b.volumeNeeded - a.volumeNeeded; });
    } else if (f.sort === 'score') {
      list.sort(function (a, b) { return b._score - a._score; });
    } else {
      list.sort(function (a, b) {
        var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
    }
    state.filtered = list;
    renderGrid();
  }

  function cardHtml(l) {
    var pyroLabel = PYRO_LABELS[l.pyroTech] || '';
    var photoHtml = (l.photos && l.photos.length)
      ? '<img src="' + l.photos[0] + '" alt="Operation photo" style="width:100%;height:140px;object-fit:cover;display:block;border-radius:var(--radius-lg) var(--radius-lg) 0 0;flex-shrink:0" />'
      : '<div style="width:100%;height:100px;background:linear-gradient(135deg,var(--color-accent-light),var(--color-border));display:flex;align-items:center;justify-content:center;font-size:2.5rem;border-radius:var(--radius-lg) var(--radius-lg) 0 0;flex-shrink:0">🔥</div>';
    var moistureLabel = MOISTURE_LABELS[l.maxMoistureAccepted] || l.maxMoistureAccepted;
    var contamLabel = CONTAMINATION_LABELS[l.contaminationTolerance] || l.contaminationTolerance;
    var periodLabel = PERIOD_LABELS[l.volumePeriod] || '';
    var distLine = l._dist !== undefined
      ? '<div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:var(--space-1)">' + l._dist + ' mi away</div>'
      : '';
    var scoreHtml = state.supplierBiomassType
      ? '<div class="pdb-score"><div class="pdb-score-bar"><div class="pdb-score-fill" style="width:' + l._score + '%"></div></div><span class="pdb-score-label">Match: ' + l._score + '%</span></div>'
      : '';
    var biomassChips = (l.acceptedBiomassTypes || []).map(function (v) {
      var isMatch = state.supplierBiomassType && v === state.supplierBiomassType;
      return '<span class="pdb-biomass-chip' + (isMatch ? ' match' : '') + '">' + (BIOMASS_LABELS[v] || v) + '</span>';
    }).join('');
    var priceHtml = l.pricePerTonMax
      ? '<div class="fs-stat"><div class="pdb-stat-label">Max price</div><div class="pdb-stat-val">$' + l.pricePerTonMax + '/ton</div></div>'
      : '<div class="fs-stat"><div class="pdb-stat-label">Price</div><div class="pdb-stat-val">Negotiable</div></div>';
    var contamClass = l.contaminationTolerance === 'clean_only' ? 'pdb-tag-clean' : 'pdb-tag-soil';

    return '<div class="listing-card-wrapper">' +
      '<div class="listing-card" style="padding:0;overflow:hidden">' +
        photoHtml +
        '<div style="padding:var(--space-5);display:flex;flex-direction:column;flex:1;gap:var(--space-3)">' +
        '<div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);align-items:center">' +
            (pyroLabel ? '<span class="pdb-tag pdb-tag-tech">' + pyroLabel + '</span>' : '') +
            '<span class="pdb-tag pdb-tag-moisture">' + moistureLabel + ' moisture</span>' +
            '<span class="pdb-tag ' + contamClass + '">' + contamLabel + '</span>' +
          '</div>' +
          '<h3 style="margin-top:var(--space-3)">' + (l.company || l.producerName || '') + '</h3>' +
          distLine +
        '</div>' +
        '<div class="pdb-card-stats">' +
          '<div class="pdb-stat"><div class="pdb-stat-label">Volume needed</div><div class="pdb-stat-val">' + l.volumeNeeded.toLocaleString() + ' tons' + periodLabel + '</div></div>' +
          '<div class="pdb-stat"><div class="pdb-stat-label">Min shipment</div><div class="pdb-stat-val">' + l.minimumShipmentTons + ' tons</div></div>' +
          priceHtml +
        '</div>' +
        '<div class="pdb-biomass-list">' + biomassChips + '</div>' +
        scoreHtml +
        (l.notes ? '<div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-top:var(--space-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + l.notes + '</div>' : '') +
        '<button class="pdb-contact-btn" data-id="' + l._id + '">Contact Producer</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderGrid() {
    var grid = document.getElementById('pdb-grid');
    var empty = document.getElementById('pdb-empty');
    if (!state.filtered.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = state.filtered.map(cardHtml).join('');
    grid.querySelectorAll('.pdb-contact-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openModal(btn.getAttribute('data-id')); });
    });
  }

  function openModal(id) {
    var l = state.listings.find(function (x) { return String(x._id) === String(id); });
    if (!l) return;
    document.getElementById('pdb-modal-listing-id').value = id;
    document.getElementById('pdb-modal-producer-name').textContent = (l.company || l.producerName || '') + ' — seeking ' + (l.acceptedBiomassTypes || []).slice(0, 2).map(function (v) { return BIOMASS_LABELS[v] || v; }).join(', ');
    document.getElementById('pdb-modal-name').value = '';
    document.getElementById('pdb-modal-company').value = '';
    document.getElementById('pdb-modal-material').value = '';
    document.getElementById('pdb-modal-volume').value = '';
    document.getElementById('pdb-modal-message').value = '';
    document.getElementById('pdb-modal-email').value = '';
    document.getElementById('pdb-modal-phone').value = '';
    document.getElementById('pdb-modal-success').style.display = 'none';
    document.getElementById('pdb-modal-submit').disabled = false;
    document.getElementById('pdb-modal-submit').textContent = 'Send to Producer';
    document.getElementById('pdb-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('pdb-modal').classList.add('hidden');
  }

  function submitContact(user) {
    var id = document.getElementById('pdb-modal-listing-id').value;
    var l = state.listings.find(function (x) { return String(x._id) === String(id); });
    if (!l) return;
    var name = document.getElementById('pdb-modal-name').value.trim();
    var email = document.getElementById('pdb-modal-email').value.trim();
    var message = document.getElementById('pdb-modal-message').value.trim();
    var material = document.getElementById('pdb-modal-material').value.trim();
    if (!name || !email || !message || !material) { alert('Please fill in all required fields.'); return; }
    var btn = document.getElementById('pdb-modal-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    firebase.firestore().collection('feedstock_inquiries').add({
      demandListingId: id,
      producerUID: l.producerUID || null,
      producerName: l.producerName,
      producerEmail: l.contactEmail,
      supplierUID: user ? user.uid : null,
      supplierName: name,
      supplierCompany: document.getElementById('pdb-modal-company').value.trim(),
      supplierEmail: email,
      supplierPhone: document.getElementById('pdb-modal-phone').value.trim(),
      materialDescription: material,
      volumeAvailableTons: Number(document.getElementById('pdb-modal-volume').value) || null,
      message: message,
      status: 'open',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      document.getElementById('pdb-modal-success').style.display = 'block';
      btn.textContent = 'Sent!';
    }).catch(function (err) {
      console.error(err);
      alert('Failed to send. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Send to Producer';
    });
  }

  function setZip(zip) {
    geocodeZip(zip).then(function (c) {
      state.supplierLat = c.lat;
      state.supplierLng = c.lng;
      document.getElementById('zip-status').textContent = '✓';
      document.getElementById('zip-status').style.color = 'var(--color-accent)';
      computeDistances();
      applyFilters();
    }).catch(function () {
      document.getElementById('zip-status').textContent = '✗';
      document.getElementById('zip-status').style.color = 'red';
    });
  }

  function bindFilters() {
    document.getElementById('filter-biomass').addEventListener('change', function () {
      state.filters.biomassType = this.value;
      state.supplierBiomassType = this.value;
      applyFilters();
    });
    document.getElementById('filter-moisture').addEventListener('change', function () {
      state.filters.moisture = this.value; applyFilters();
    });
    document.getElementById('filter-sort').addEventListener('change', function () {
      state.filters.sort = this.value; applyFilters();
    });
    document.getElementById('zip-input').addEventListener('change', function () {
      var z = this.value.trim();
      if (z.length === 5) setZip(z);
    });
  }

  function bindModal() {
    document.getElementById('pdb-modal-close').addEventListener('click', closeModal);
    document.getElementById('pdb-modal').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('pdb-modal-submit').addEventListener('click', function () {
      submitContact(firebase.auth().currentUser);
    });
  }

  function loadListings() {
    var demoList = window.PRODUCER_DEMAND_LISTINGS ? window.PRODUCER_DEMAND_LISTINGS.slice() : [];
    state.listings = demoList;
    geocodeListings(demoList).then(function (list) {
      state.listings = list;
      computeDistances();
      applyFilters();
    });
    firebase.firestore().collection('feedstock_demand')
      .where('status', '==', 'active')
      .get()
      .then(function (snap) {
        if (snap.empty) return;
        var real = [];
        snap.forEach(function (doc) { var d = doc.data(); d._id = doc.id; real.push(d); });
        return geocodeListings(real).then(function (geocoded) {
          state.listings = demoList.concat(geocoded);
          computeDistances();
          applyFilters();
        });
      })
      .catch(function (err) {
        console.warn('Firestore error, showing demo data only:', err);
      });
  }

  function init() {
    bindFilters();
    bindModal();
    firebase.auth().onAuthStateChanged(function (user) {
      var login = document.getElementById('nav-login');
      var profile = document.getElementById('nav-profile');
      var logout = document.getElementById('nav-logout');
      if (user) {
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
            if (d.zipcode) {
              document.getElementById('zip-input').value = d.zipcode;
              setZip(d.zipcode);
            }
            if (d.name) document.getElementById('pdb-modal-name').value = d.name;
            if (d.businessName) document.getElementById('pdb-modal-company').value = d.businessName;
            document.getElementById('pdb-modal-email').value = d.email || user.email || '';
          }
        });
      }
      loadListings();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
