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

  var state = {
    listings: [],
    filtered: [],
    buyerLat: null,
    buyerLng: null,
    filters: { biomassType: '', maxPrice: 0, contamination: '', minQty: 0, sort: 'newest' }
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
      .then(function (r) { if (!r.ok) throw new Error('ZIP not found'); return r.json(); })
      .then(function (d) { return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; });
  }

  function geocodeListings(listings) {
    var promises = listings.map(function (l) {
      if (!l.locationZip || l._lat) return Promise.resolve(l);
      return geocodeZip(l.locationZip)
        .then(function (c) { l._lat = c.lat; l._lng = c.lng; return l; })
        .catch(function () { return l; });
    });
    return Promise.all(promises);
  }

  function computeDistances() {
    if (!state.buyerLat) return;
    state.listings.forEach(function (l) {
      if (l._lat && l._lng) {
        l._dist = Math.round(haversine(state.buyerLat, state.buyerLng, l._lat, l._lng));
        l._transport = Math.round((l._dist * 4 * 2) / 20);
        l._delivered = l.pricePerTon + l._transport;
      }
    });
  }

  function applyFilters() {
    var f = state.filters;
    var list = state.listings.slice();
    if (f.biomassType) list = list.filter(function (l) { return l.biomassType === f.biomassType; });
    if (f.maxPrice > 0) list = list.filter(function (l) { return l.pricePerTon <= f.maxPrice; });
    if (f.contamination === 'clean') list = list.filter(function (l) { return l.contaminationRisk === 'clean'; });
    if (f.contamination === 'possible_soil') list = list.filter(function (l) { return l.contaminationRisk !== 'mixed_debris'; });
    if (f.minQty > 0) list = list.filter(function (l) { return l.estimatedQuantityTons >= f.minQty; });

    if (f.sort === 'closest' && state.buyerLat) {
      list.sort(function (a, b) { return (a._dist || 9999) - (b._dist || 9999); });
    } else if (f.sort === 'cheapest') {
      list.sort(function (a, b) { return a.pricePerTon - b.pricePerTon; });
    } else if (f.sort === 'largest') {
      list.sort(function (a, b) { return b.estimatedQuantityTons - a.estimatedQuantityTons; });
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
    var typeLabel = BIOMASS_LABELS[l.biomassType] || l.biomassType;
    var supplierLabel = SUPPLIER_LABELS[l.supplierType] || l.supplierType;
    var moistureLabel = MOISTURE_LABELS[l.moistureContent] || l.moistureContent;
    var contamLabel = CONTAMINATION_LABELS[l.contaminationRisk] || l.contaminationRisk;
    var particleLabel = PARTICLE_LABELS[l.particleSize] || l.particleSize;
    var contamColor = l.contaminationRisk === 'clean' ? 'var(--color-accent)' : l.contaminationRisk === 'possible_soil' ? 'var(--color-warning)' : '#cc4444';
    var negTag = l.negotiable ? '<span class="fs-tag fs-tag-neg">Negotiable</span>' : '';

    var photoHtml = (l.photos && l.photos.length)
      ? '<img src="' + l.photos[0] + '" alt="Material photo" class="fs-card-photo" />'
      : '<div class="fs-card-photo-placeholder">📦</div>';

    var distHtml = l._dist !== undefined ? '<div class="fs-card-dist">' + l._dist + ' mi away</div>' : '';

    var deliveredHtml = l._delivered !== undefined
      ? '<div class="fs-card-delivered">' +
          '<span class="fs-delivered-label">Listing:</span> $' + l.pricePerTon + '/ton &nbsp;+&nbsp; ' +
          '<span class="fs-delivered-label">Est. trucking:</span> $' + l._transport + '/ton' +
          '<br><strong>Delivered: $' + l._delivered + '/ton</strong>' +
        '</div>'
      : '';

    var availHtml = l.availabilityWindow ? '<div class="fs-card-avail">Available: ' + l.availabilityWindow + '</div>' : '';

    return '<div class="fs-card">' +
      photoHtml +
      '<div class="fs-card-body">' +
        '<div class="fs-card-top">' +
          '<span class="fs-tag fs-tag-type">' + typeLabel + '</span>' +
          '<span class="fs-tag fs-tag-supplier">' + supplierLabel + '</span>' +
          negTag +
        '</div>' +
        '<div class="fs-card-company">' + (l.company || l.supplierName || '') + '</div>' +
        distHtml +
        '<div class="fs-card-row">' +
          '<div class="fs-card-stat"><div class="fs-stat-label">Quantity</div><div class="fs-stat-val">' + l.estimatedQuantityTons.toLocaleString() + ' tons</div></div>' +
          '<div class="fs-card-stat"><div class="fs-stat-label">Min pickup</div><div class="fs-stat-val">' + l.minimumPickupTons + ' tons</div></div>' +
          '<div class="fs-card-stat"><div class="fs-stat-label">Price</div><div class="fs-stat-val">$' + l.pricePerTon + '/ton</div></div>' +
        '</div>' +
        '<div class="fs-card-row">' +
          '<div class="fs-card-stat"><div class="fs-stat-label">Moisture</div><div class="fs-stat-val">' + moistureLabel + '</div></div>' +
          '<div class="fs-card-stat"><div class="fs-stat-label">Particle size</div><div class="fs-stat-val">' + particleLabel + '</div></div>' +
          '<div class="fs-card-stat"><div class="fs-stat-label">Contamination</div><div class="fs-stat-val" style="color:' + contamColor + '">' + contamLabel + '</div></div>' +
        '</div>' +
        deliveredHtml +
        availHtml +
        '<button class="fs-contact-btn" data-id="' + l._id + '">Request Feedstock</button>' +
      '</div>' +
    '</div>';
  }

  function renderGrid() {
    var grid = document.getElementById('fs-grid');
    var empty = document.getElementById('fs-empty');
    if (!state.filtered.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = state.filtered.map(cardHtml).join('');
    grid.querySelectorAll('.fs-contact-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openModal(btn.getAttribute('data-id')); });
    });
  }

  function openModal(id) {
    var l = state.listings.find(function (x) { return x._id === id; });
    if (!l) return;
    document.getElementById('modal-listing-id').value = id;
    document.getElementById('modal-listing-name').textContent =
      (BIOMASS_LABELS[l.biomassType] || l.biomassType) + ' — ' + (l.company || l.supplierName || '');
    document.getElementById('modal-name').value = '';
    document.getElementById('modal-company').value = '';
    document.getElementById('modal-volume').value = '';
    document.getElementById('modal-message').value = '';
    document.getElementById('modal-email').value = '';
    document.getElementById('modal-phone').value = '';
    document.getElementById('modal-success').style.display = 'none';
    document.getElementById('modal-submit').disabled = false;
    document.getElementById('modal-submit').textContent = 'Send Request';
    document.getElementById('contact-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('contact-modal').classList.add('hidden');
  }

  function submitRequest(user) {
    var id = document.getElementById('modal-listing-id').value;
    var l = state.listings.find(function (x) { return x._id === id; });
    if (!l) return;
    var name = document.getElementById('modal-name').value.trim();
    var email = document.getElementById('modal-email').value.trim();
    var message = document.getElementById('modal-message').value.trim();
    if (!name || !email || !message) { alert('Please fill in Name, Email, and Message.'); return; }

    var btn = document.getElementById('modal-submit');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    firebase.firestore().collection('feedstock_requests').add({
      listingId: id,
      biomassType: l.biomassType,
      supplierUID: l.supplierUID,
      supplierName: l.supplierName,
      supplierEmail: l.contactEmail,
      requesterUID: user ? user.uid : null,
      requesterName: name,
      requesterCompany: document.getElementById('modal-company').value.trim(),
      requesterEmail: email,
      requesterPhone: document.getElementById('modal-phone').value.trim(),
      expectedVolumeTons: Number(document.getElementById('modal-volume').value) || null,
      message: message,
      status: 'open',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      document.getElementById('modal-success').style.display = 'block';
      btn.textContent = 'Sent!';
    }).catch(function (err) {
      console.error(err);
      alert('Failed to send. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Send Request';
    });
  }

  function setZip(zip) {
    geocodeZip(zip).then(function (c) {
      state.buyerLat = c.lat;
      state.buyerLng = c.lng;
      document.getElementById('zip-status').textContent = '✓';
      document.getElementById('zip-status').style.color = 'var(--color-accent)';
      if (state.listings.length) { computeDistances(); applyFilters(); }
    }).catch(function () {
      document.getElementById('zip-status').textContent = '✗';
      document.getElementById('zip-status').style.color = 'red';
    });
  }

  function bindFilters() {
    document.getElementById('filter-biomass').addEventListener('change', function () {
      state.filters.biomassType = this.value; applyFilters();
    });
    document.getElementById('filter-price').addEventListener('input', function () {
      var v = Number(this.value);
      state.filters.maxPrice = v;
      document.getElementById('filter-price-val').textContent = v > 0 ? '$' + v + '/ton max' : 'Any price';
      applyFilters();
    });
    document.getElementById('filter-contamination').addEventListener('change', function () {
      state.filters.contamination = this.value; applyFilters();
    });
    document.getElementById('filter-min-qty').addEventListener('input', function () {
      state.filters.minQty = Number(this.value) || 0; applyFilters();
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
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('contact-modal').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.getElementById('modal-submit').addEventListener('click', function () {
      submitRequest(firebase.auth().currentUser);
    });
  }

  function loadListings() {
    var grid = document.getElementById('fs-grid');
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--space-12);color:var(--color-text-muted)">Loading listings…</div>';
    firebase.firestore().collection('feedstock_listings')
      .where('status', '==', 'active')
      .get()
      .then(function (snap) {
        var list = window.FEEDSTOCK_LISTINGS ? window.FEEDSTOCK_LISTINGS.slice() : [];
        snap.forEach(function (doc) { var d = doc.data(); d._id = doc.id; list.push(d); });
        state.listings = list;
        return geocodeListings(list);
      })
      .then(function (list) {
        state.listings = list;
        computeDistances();
        applyFilters();
      })
      .catch(function (err) {
        console.error(err);
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--space-8);color:var(--color-text-muted)">Failed to load listings.</div>';
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
        // Autofill ZIP from profile for delivered cost
        firebase.firestore().collection('users').doc(user.uid).get().then(function (doc) {
          if (doc.exists && doc.data().zipcode) {
            var z = doc.data().zipcode;
            document.getElementById('zip-input').value = z;
            setZip(z);
          }
        });
        // Autofill modal name/email
        firebase.firestore().collection('users').doc(user.uid).get().then(function (doc) {
          if (doc.exists) {
            var d = doc.data();
            document.getElementById('modal-name').value = d.name || '';
            document.getElementById('modal-company').value = d.businessName || '';
            document.getElementById('modal-email').value = d.email || user.email || '';
          }
        });
      }
      loadListings();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
