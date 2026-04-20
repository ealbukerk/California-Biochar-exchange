(function () {
  'use strict';

  var db = firebase.firestore();

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
    tree_service: 'Tree Service', recycler: 'Recycler',
    aggregator: 'Aggregator / Processor', broker: 'Broker'
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

  var CONTAMINATION_RISK_LEVEL = {
    certified_clean: 0,
    clean: 1,
    bark_included: 2,
    possible_soil: 3,
    some_soil: 4,
    possible_treated: 5,
    mixed_debris: 6,
    unknown: 7
  };

  function scoreDots(score, max, lowerBetter) {
    var filled = Math.round((lowerBetter ? (max + 1 - score) : score) / max * 5);
    filled = Math.max(1, Math.min(5, filled));
    var color = score <= 2 ? '#3D6B45' : score <= 3 ? '#B87333' : '#cc4444';
    var dots = '';
    for (var i = 0; i < 5; i++) {
      dots += '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:2px;background:' + (i < filled ? color : 'var(--color-border)') + '"></span>';
    }
    return dots;
  }

  function contaminationAvg(l) {
    var c1 = parseInt(l.contaminationDebris || 1);
    var c2 = parseInt(l.contaminationAsh || 1);
    var c3 = parseInt(l.contaminationChemical || 1);
    var c4 = parseInt(l.contaminationOther || 1);
    return Math.round((c1 + c2 + c3 + c4) / 4 * 10) / 10;
  }

  var state = {
    listings: [],
    filtered: [],
    buyerLat: null,
    buyerLng: null,
    filters: { biomassType: '', contaminationMax: '', sort: 'newest', radius: 0, verifiedOnly: false, search: '' }
  };
  var LISTINGS_PAGE_SIZE = 20;
  var _currentPage = 1;
  var _allFilteredListings = [];

  window._DEMAND_ENABLED = false;

  function toDateOnly(value) {
    if (!value) return null;
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function daysBetween(start, end) {
    return Math.round((end - start) / 86400000);
  }

  function formatShortDate(value) {
    var date = toDateOnly(value);
    if (!date) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatMonthYear(value) {
    var date = toDateOnly(value);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function isFeedstockVisible(listing) {
    var today = toDateOnly(new Date());
    var oneMonthOut = new Date(today.getTime());
    oneMonthOut.setDate(oneMonthOut.getDate() + 30);
    var from = toDateOnly(listing.availableFrom);
    var until = toDateOnly(listing.availableUntil);
    if (until && until < today) return false;
    if (from && from > oneMonthOut) return false;
    return true;
  }

  function renderAvailabilityIndicator(listing) {
    var today = toDateOnly(new Date());
    var from = toDateOnly(listing.availableFrom);
    var until = toDateOnly(listing.availableUntil);
    if (from && from > today) {
      var daysUntil = daysBetween(today, from);
      if (daysUntil <= 30) {
        return '<div style="font-size:var(--font-size-xs);color:#B45309;background:#FEF3C7;border-radius:999px;padding:4px 10px;display:inline-block;font-weight:600">🕐 Available in ' + daysUntil + ' day' + (daysUntil !== 1 ? 's' : '') + ' · ' + formatMonthYear(from) + '</div>';
      }
      return '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);background:var(--color-bg);border-radius:999px;padding:4px 10px;display:inline-block;font-weight:600">Available ' + formatMonthYear(from) + '</div>';
    }
    if (until) {
      var daysLeft = daysBetween(today, until);
      if (daysLeft <= 14) {
        return '<div style="font-size:var(--font-size-xs);color:#B45309;background:#FEF3C7;border-radius:999px;padding:4px 10px;display:inline-block;font-weight:600">⚠ Available now · Expires in ' + Math.max(daysLeft, 0) + ' day' + (Math.max(daysLeft, 0) !== 1 ? 's' : '') + '</div>';
      }
      return '<div style="font-size:var(--font-size-xs);color:#166534;background:#DCFCE7;border-radius:999px;padding:4px 10px;display:inline-block;font-weight:600">✓ Available now · Until ' + formatShortDate(until) + '</div>';
    }
    return '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);background:var(--color-bg);border-radius:999px;padding:4px 10px;display:inline-block;font-weight:600">' + (listing.availabilityWindow || 'Availability on request') + '</div>';
  }

  function haversine(lat1, lng1, lat2, lng2) {
    var R = 3958.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
            Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  var zipGeoCache = window._zipGeoCache || (window._zipGeoCache = {});

  function geocodeZip(zip) {
    if (zipGeoCache[zip]) return zipGeoCache[zip];
    var p = fetch('https://api.zippopotam.us/us/' + zip)
      .then(function (r) { if (!r.ok) throw new Error('bad zip'); return r.json(); })
      .then(function (d) { return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; });
    zipGeoCache[zip] = p.catch(function (err) { delete zipGeoCache[zip]; throw err; });
    return zipGeoCache[zip];
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
    state.filtered = state.listings.filter(function(l) {
      if (!isFeedstockVisible(l)) return false;
      if (f.biomassType && l.biomassType !== f.biomassType &&
          !(l.biomassTypes && l.biomassTypes.indexOf(f.biomassType) !== -1)) return false;
      if (f.contaminationMax) {
        var avg = contaminationAvg(l);
        if (avg > parseFloat(f.contaminationMax)) return false;
      }
      if (f.verifiedOnly && !l.verified) return false;
      if (f.radius > 0 && (!l._dist || l._dist > f.radius)) return false;
      if (f.search) {
        var hay = ((l.company||'') + ' ' + (l.supplierName||'') + ' ' + (l.biomassType||'')).toLowerCase();
        if (hay.indexOf(f.search) === -1) return false;
      }
      return true;
    });

    if (f.sort === 'closest' && state.buyerLat) {
      state.filtered.sort(function (a, b) { return (a._dist || 9999) - (b._dist || 9999); });
    } else if (f.sort === 'cheapest') {
      state.filtered.sort(function (a, b) { return a.pricePerTon - b.pricePerTon; });
    } else if (f.sort === 'largest') {
      state.filtered.sort(function (a, b) { return b.estimatedQuantityTons - a.estimatedQuantityTons; });
    } else {
      state.filtered.sort(function (a, b) {
        var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
        var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
    }
    _allFilteredListings = state.filtered.slice();
    renderGrid();
  }

  function yieldHtml(l) {
    var ratios = window.FEEDSTOCK_YIELD_RATIOS || {};
    var ratio = ratios[l.biomassType];
    if (!ratio || !l.estimatedQuantityTons) return '';

    var moisturePenalty = 1.0;
    if (l.moistureContent === 'over_40') moisturePenalty = 0.80;
    else if (l.moistureContent === '30_40') moisturePenalty = 0.88;
    else if (l.moistureContent === '20_30') moisturePenalty = 0.94;

    var ashPenalty = 1.0;
    var ashScore = parseInt(l.contaminationAsh || 1);
    if (ashScore >= 4) ashPenalty = 0.82;
    else if (ashScore === 3) ashPenalty = 0.91;

    var bestRatio = ratio * 1.08;
    var worstRatio = ratio * moisturePenalty * ashPenalty;

    var bestYield  = Math.round(l.estimatedQuantityTons * bestRatio);
    var worstYield = Math.round(l.estimatedQuantityTons * worstRatio);
    var midYield   = Math.round((bestYield + worstYield) / 2);
    var co2Total = midYield * 0.85 * 3.67;
    var co2PerTon = l.estimatedQuantityTons ? (co2Total / l.estimatedQuantityTons) : null;

    var rangeStr = bestYield === worstYield
      ? bestYield.toLocaleString() + ' tons'
      : worstYield.toLocaleString() + '\u2013' + bestYield.toLocaleString() + ' tons';

    if (!co2PerTon) return '';
    return '<div style="background:var(--color-accent-light);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-top:var(--space-2);font-size:var(--font-size-sm);color:var(--color-text-secondary)">' +
      '🔥 Est. char yield: <strong>' + rangeStr + '</strong>' +
      ' &nbsp;·&nbsp; 🌍 CO₂ potential: <strong>~' + co2PerTon.toFixed(1) + ' t CO₂ / ton</strong>' +
    '</div>';
  }

  function cardHtml(l) {
    var typeLabel = BIOMASS_LABELS[l.biomassType] || l.biomassType;
    var photoHtml = '<div style="width:100%;height:180px;background:' + (l.photos && l.photos[0] ? 'url(' + l.photos[0] + ') center/cover no-repeat' : '#F5EFE6') + ';border-radius:var(--radius-lg) var(--radius-lg) 0 0;flex-shrink:0"></div>';
    var supplierLabel = SUPPLIER_LABELS[l.supplierType] || l.supplierType;
    var moistureLabel = MOISTURE_LABELS[l.moistureContent] || l.moistureContent;
    var particleLabel = PARTICLE_LABELS[l.particleSize] || l.particleSize;
    var avgContam = contaminationAvg(l);
    var contamColor = avgContam <= 2 ? '#3D6B45' : avgContam <= 3 ? '#B87333' : '#cc4444';
    var negTag = '';
    var verifiedTag = '';
    var qty = l.estimatedQuantityTons || 0;
    var sizeLabel = qty >= 500 ? 'Large' : qty >= 100 ? 'Medium' : 'Small';
    var sizeColor = qty >= 500 ? '#1E3A5F' : qty >= 100 ? '#92400E' : '#374151';
    var sizeBg    = qty >= 500 ? '#DBEAFE' : qty >= 100 ? '#FEF3C7' : '#F3F4F6';
    var sizeTag = '<span style="background:' + sizeBg + ';color:' + sizeColor + ';border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700">' + sizeLabel + ' · ' + qty.toLocaleString() + 't</span>';
    var supplierBadge = l.supplierVerified ? '<span class="verified-badge">✓ Verified</span>' : '';
    var freeTag = l.pricePerTon === 0 ? '<span class="fs-tag fs-tag-free">Free to haul</span>' : '';
    var priceDisplay = l.pricePerTon === 0 ? 'Free' : '$' + l.pricePerTon + '/ton';

    var distLine = l._dist !== undefined
      ? '<div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:var(--space-1)">' + l._dist + ' mi away</div>'
      : '';

    var deliveredHtml = l._delivered !== undefined
      ? '<div class="fs-delivered" style="background:var(--color-accent-light);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3);font-size:var(--font-size-sm)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<span style="color:var(--color-text-muted)">Listed</span>' +
            '<strong>$' + l.pricePerTon + '/ton</strong>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">' +
            '<span style="color:var(--color-text-muted)">Est. delivered</span>' +
            '<strong style="color:var(--color-accent)">~$' + l._delivered + '/ton</strong>' +
          '</div>' +
        '</div>'
      : '<div style="font-size:var(--font-size-sm);font-weight:600">$' + (l.pricePerTon === 0 ? 'Free to haul' : l.pricePerTon + '/ton') + '</div>';

    var availHtml = '<div style="margin-top:var(--space-2)">' + renderAvailabilityIndicator(l) + '</div>';

    return '<div class="listing-card-wrapper" style="position:relative">' +
      '<div class="compare-corner">' +
      '<input type="checkbox" class="fs-compare-check" data-id="' + (l._id || l.id || '') + '"' +
      (fsCompareList.indexOf(String(l._id || l.id || '')) !== -1 ? ' checked' : '') +
      '><label class="compare-label">Compare</label>' +
      '</div>' +
      '<a href="feedstock-listing.html?id=' + (l._id || l.id || '') + '" class="fs-card" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;cursor:pointer">' +
        photoHtml +
        '<div style="padding:var(--space-5);display:flex;flex-direction:column;flex:1;gap:var(--space-3)">' +
        '<div>' +
          '<div class="listing-top-row" style="flex-wrap:wrap;gap:var(--space-2)">' +
            '<span class="fs-tag fs-tag-type">' + typeLabel + '</span>' +
            '<span class="fs-tag fs-tag-supplier">' + supplierLabel + '</span>' +
            (supplierBadge ? supplierBadge + ' ' : '') +
            sizeTag + (freeTag ? ' ' + freeTag : '') +
          '</div>' +
          '<h3 style="margin-top:var(--space-3)">' + (l.company || l.supplierName || '') + '</h3>' +
          distLine +
          availHtml +
        '</div>' +

        '<div class="fs-card-stats">' +
          '<div class="fs-stat"><div class="fs-stat-label">Moisture</div><div class="fs-stat-val">' + moistureLabel + '</div></div>' +
          '<div class="fs-stat"><div class="fs-stat-label">Particle size</div><div class="fs-stat-val">' + particleLabel + '</div></div>' +
          '<div class="fs-stat"><div class="fs-stat-label">Contamination</div><div class="fs-stat-val" style="color:' + contamColor + '">'+ avgContam.toFixed(1) + ' / 5</div></div>' +
        '</div>' +

        deliveredHtml +
        yieldHtml(l) +

        '</div>' +
      '</a>' +
    '</div>';
  }

  var fsCompareList = [];

  function updateFsCompareBar() {
    return;
  }

  function fsCompareCardHtml(l) {
    var score = 0;
    var fields = [
      { label: 'Quantity', value: l.estimatedQuantityTons ? l.estimatedQuantityTons.toLocaleString() + ' tons' : '—', score: l.estimatedQuantityTons || 0, higherBetter: true },
      { label: 'Min pickup', value: l.minimumPickupTons ? l.minimumPickupTons + ' tons' : '—', score: l.minimumPickupTons || 999, higherBetter: false },
      { label: 'Price/ton', value: l.pricePerTon === 0 ? 'Free' : ('$' + l.pricePerTon + '/ton'), score: l.pricePerTon || 999, higherBetter: false },
      { label: 'Moisture', value: (MOISTURE_LABELS && MOISTURE_LABELS[l.moistureContent]) || l.moistureContent || '—', score: 0, higherBetter: false },
      { label: 'Contamination', value: contaminationAvg(l).toFixed(1) + ' / 5', score: 0, higherBetter: false },
      { label: 'Availability', value: l.availableFrom ? formatShortDate(l.availableFrom) + (l.availableUntil ? ' — ' + formatShortDate(l.availableUntil) : '') : (l.availabilityWindow || '—'), score: 0, higherBetter: false }
    ];
    return '<div style="flex:1;min-width:200px;max-width:320px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-5)">' +
      '<div style="font-weight:700;font-size:var(--font-size-base);margin-bottom:var(--space-1)">' + (l.company || l.supplierName || '') + '</div>' +
      '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:var(--space-4)">' + (BIOMASS_LABELS[l.biomassType] || l.biomassType || '') + '</div>' +
      fields.map(function(f) {
        return '<div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border);font-size:var(--font-size-sm)">' +
          '<span style="color:var(--color-text-muted)">' + f.label + '</span>' +
          '<span style="font-weight:600">' + f.value + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderFsComparison() {
    var view = document.getElementById('fs-comparison-view');
    var grid = document.getElementById('fs-grid');
    if (!view) return;
    var selected = fsCompareList.map(function(id) {
      return state.listings.find(function(l) { return String(l._id) === String(id); });
    }).filter(Boolean);
    if (selected.length < 2) return;

    if (grid) grid.classList.add('hidden');
    view.classList.remove('hidden');
    view.innerHTML =
      '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px">' +
        '<div style="background:var(--color-bg);border-radius:var(--radius-lg);padding:var(--space-8);max-width:960px;width:100%">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-6)">' +
            '<h2 style="font-size:var(--font-size-xl);font-weight:700">Feedstock comparison</h2>' +
            '<button id="fs-compare-close" style="background:none;border:1px solid var(--color-border);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px">✕ Close</button>' +
          '</div>' +
          '<div style="display:flex;gap:var(--space-4);flex-wrap:wrap">' +
            selected.map(fsCompareCardHtml).join('') +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('fs-compare-close').addEventListener('click', function() {
      view.classList.add('hidden');
      view.innerHTML = '';
      fsCompareList = [];
      if (grid) grid.classList.remove('hidden');
      updateFsCompareBar();
      renderGrid();
    });
  }

  function renderGrid() {
    var grid = document.getElementById('fs-grid');
    var empty = document.getElementById('fs-empty');
    if (!state.filtered.length) {
      grid.innerHTML = '';
      if (window.UIUtils) {
        empty.style.display = 'none';
        UIUtils.showEmpty('fs-grid', 'No feedstock listings match your filters.', 'Try widening your filters or clearing search.');
      } else {
        empty.style.display = 'block';
      }
      renderLoadMore();
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = state.filtered.slice(0, _currentPage * LISTINGS_PAGE_SIZE).map(function(l) {
      return cardHtml(l);
    }).join('');

    grid.querySelectorAll('.fs-contact-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { openModal(btn.getAttribute('data-id')); });
    });

    grid.querySelectorAll('.fs-compare-check').forEach(function(chk) {
      chk.addEventListener('change', function(e) {
        e.stopPropagation();
        var id = String(chk.getAttribute('data-id'));
        var idx = fsCompareList.indexOf(id);
        if (chk.checked && idx === -1) {
          if (fsCompareList.length >= 3) { chk.checked = false; return; }
          fsCompareList.push(id);
        } else if (!chk.checked && idx !== -1) {
          fsCompareList.splice(idx, 1);
        }
        updateFsCompareBar();
        if (fsCompareList.length === 3) renderFsComparison();
      });
    });

    updateFsCompareBar();
    renderLoadMore();
  }

  function renderLoadMore() {
    var grid = document.getElementById('fs-grid');
    if (!grid) return;
    var wrap = document.getElementById('fs-load-more-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'fs-load-more-wrap';
      wrap.style.textAlign = 'center';
      wrap.style.marginTop = 'var(--space-6)';
      grid.insertAdjacentElement('afterend', wrap);
    }
    if ((_allFilteredListings || []).length <= (_currentPage * LISTINGS_PAGE_SIZE)) {
      wrap.innerHTML = '';
      return;
    }
    var remaining = (_allFilteredListings || []).length - (_currentPage * LISTINGS_PAGE_SIZE);
    wrap.innerHTML = '<button type="button" id="fs-load-more" class="btn btn-secondary">Load more (' + remaining + ' remaining)</button>';
    document.getElementById('fs-load-more').addEventListener('click', function () {
      _currentPage += 1;
      renderGrid();
    });
  }

  function openModal(id) {
    var l = state.listings.find(function (x) { return String(x._id) === String(id); });
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

  function renderDemandTab() {
    if (window._DEMAND_ENABLED === false) return;
    var grid = document.getElementById('demand-full-grid');
    var empty = document.getElementById('demand-full-empty');
    if (!grid) return;

    var BIOMASS_LABELS_D = {
      orchard_prunings:'Orchard Prunings', almond_shells:'Almond Shells',
      pistachio_shells:'Pistachio Shells', walnut_shells:'Walnut Shells',
      corn_stover:'Corn Stover', rice_husks:'Rice Husks',
      forestry_slash:'Forestry Slash', logging_residue:'Logging Residue',
      thinning_material:'Thinning Material', clean_wood_waste:'Clean Wood Waste',
      construction_wood:'Construction Wood', tree_service_chips:'Tree Service Chips'
    };
    var PERIOD_LABELS_D = { per_week:'/week', per_month:'/month', per_year:'/year', one_time:'one-time' };
    var PYRO_LABELS_D = { kiln:'Kiln', retort:'Retort', continuous_reactor:'Continuous reactor', gasifier:'Gasifier', other:'Other' };

    var listings = (window.PRODUCER_DEMAND_LISTINGS || []);

    db.collection('feedstock_demand').where('status','==','active').get()
      .then(function(snap) {
        snap.forEach(function(doc) {
          var d = doc.data(); d._id = doc.id;
          listings = listings.concat([d]);
        });
      }).catch(function(){}).finally(function() {
        var producerProfile = window.AuthState && window.AuthState.profile ? window.AuthState.profile : null;
        if (producerProfile && producerProfile.acceptedBiomassTypes && producerProfile.acceptedBiomassTypes.length) {
          listings = listings.map(function(l) {
            var score = 0;
            var accepted = producerProfile.acceptedBiomassTypes || [];
            var demandTypes = l.acceptedBiomassTypes || [];
            var typeMatch = demandTypes.filter(function(t) { return accepted.indexOf(t) !== -1; }).length;
            score += typeMatch * 30;
            if (producerProfile.locationZip && l.locationZip) {
              var cached = window._fsGeoCache && window._fsGeoCache[l.locationZip];
              var myCache = window._fsGeoCache && window._fsGeoCache[producerProfile.locationZip];
              if (cached && myCache) {
                var R = 3958.8;
                var dLat = (cached.lat - myCache.lat) * Math.PI / 180;
                var dLng = (cached.lng - myCache.lng) * Math.PI / 180;
                var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(myCache.lat*Math.PI/180)*Math.cos(cached.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
                var dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                if (dist <= 50) score += 20;
                else if (dist <= 150) score += 12;
                else if (dist <= 300) score += 5;
              }
            }
            if (l.volumeNeeded && producerProfile.annualCapacity) {
              if (l.volumeNeeded <= producerProfile.annualCapacity) score += 10;
            }
            l._matchScore = score;
            return l;
          });
          listings.sort(function(a, b) { return (b._matchScore || 0) - (a._matchScore || 0); });
        }
        if (!listings.length) {
          if (empty) empty.style.display = 'block';
          grid.innerHTML = '';
          return;
        }
        if (empty) empty.style.display = 'none';
        grid.innerHTML = listings.map(function(l) {
          var types = (l.acceptedBiomassTypes || []).slice(0,4).map(function(t) {
            return '<span style="font-size:11px;padding:2px 8px;background:rgba(122,92,30,0.1);color:#7A5C1E;border-radius:20px">' + (BIOMASS_LABELS_D[t]||t) + '</span>';
          }).join(' ');
          var period = PERIOD_LABELS_D[l.volumePeriod] || '';
          var pyro = PYRO_LABELS_D[l.pyroTech] || '';
          return '<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-3)">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between">' +
              '<div>' +
                '<div style="font-weight:700;font-size:var(--font-size-base)">' + (l.company||l.producerName||'') + '</div>' +
                '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:2px">' + (pyro ? pyro + ' · ' : '') + 'ZIP ' + (l.locationZip||'') + '</div>' +
              '</div>' +
              '<span style="font-size:11px;padding:3px 10px;background:var(--color-accent-light);color:var(--color-accent);border-radius:20px;font-weight:600">Seeking</span>' +
              (l._matchScore > 0 ? '<span style="font-size:11px;padding:3px 8px;background:var(--color-accent-light);color:var(--color-accent);border-radius:20px;font-weight:600;margin-left:4px">' + l._matchScore + ' pts</span>' : '') +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px">' + types + '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2)">' +
              '<div style="font-size:var(--font-size-xs)"><div style="color:var(--color-text-muted)">Volume needed</div><div style="font-weight:600">' + (l.volumeNeeded||'?') + 't' + period + '</div></div>' +
              '<div style="font-size:var(--font-size-xs)"><div style="color:var(--color-text-muted)">Max price</div><div style="font-weight:600">' + (l.pricePerTonMax ? '$'+l.pricePerTonMax+'/ton' : 'Negotiable') + '</div></div>' +
              '<div style="font-size:var(--font-size-xs)"><div style="color:var(--color-text-muted)">Min shipment</div><div style="font-weight:600">' + (l.minimumShipmentTons||'?') + 't</div></div>' +
              '<div style="font-size:var(--font-size-xs)"><div style="color:var(--color-text-muted)">Max distance</div><div style="font-weight:600">' + (l.maxSourcingDistance ? l.maxSourcingDistance+'mi' : 'Any') + '</div></div>' +
            '</div>' +
          '</div>';
        }).join('');
      });
  }

  function submitRequest(user) {
    var id = document.getElementById('modal-listing-id').value;
    var l = state.listings.find(function (x) { return String(x._id) === String(id); });
    if (!l) return;
    var name = document.getElementById('modal-name').value.trim();
    var email = document.getElementById('modal-email').value.trim();
    var message = document.getElementById('modal-message').value.trim();
    if (!name || !email || !message) {
      if (window.UIUtils) UIUtils.toast('Please fill in Name, Email, and Message.', 'error', 2400);
      else alert('Please fill in Name, Email, and Message.');
      return;
    }
    var btn = document.getElementById('modal-submit');
    if (window.UIUtils) UIUtils.setButtonLoading(btn, true, 'Sending...');
    else {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }
    firebase.firestore().collection('feedstock_requests').add({
      listingId: id,
      biomassType: l.biomassType,
      supplierUID: l.supplierUID || null,
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
      if (window.UIUtils) {
        UIUtils.setButtonLoading(btn, false);
        btn.textContent = 'Sent!';
        UIUtils.toast('Request sent.', 'success', 2200);
      } else btn.textContent = 'Sent!';
    }).catch(function (err) {
      console.error(err);
      if (window.UIUtils) {
        UIUtils.setButtonLoading(btn, false);
        UIUtils.toast('Failed to send request. Please try again.', 'error', 3000);
      } else {
        alert('Failed to send. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Send Request';
      }
    });
  }

  function setZip(zip) {
    geocodeZip(zip).then(function (c) {
      state.buyerLat = c.lat;
      state.buyerLng = c.lng;
      var statusEl = document.getElementById('zip-status');
      if (statusEl) {
        statusEl.textContent = '✓';
        statusEl.style.color = 'var(--color-accent)';
      }
      computeDistances();
      applyFilters();
    }).catch(function () {
      var statusEl = document.getElementById('zip-status');
      if (statusEl) {
        statusEl.textContent = '✗';
        statusEl.style.color = 'red';
      }
      if (window.UIUtils) UIUtils.toast('Could not locate that ZIP code.', 'warning', 2400);
    });
  }

  function bindFilters() {
    document.getElementById('filter-biomass').addEventListener('change', function () {
      state.filters.biomassType = this.value; _currentPage = 1; applyFilters();
    });
    document.getElementById('filter-sort').addEventListener('change', function () {
      state.filters.sort = this.value; _currentPage = 1; applyFilters();
    });
    document.getElementById('filter-contamination').addEventListener('change', function () {
      state.filters.contaminationMax = this.value; _currentPage = 1; applyFilters();
    });
    var radiusEl = document.getElementById('filter-radius');
    if (radiusEl) radiusEl.addEventListener('change', function() {
      state.filters.radius = parseInt(this.value) || 0; _currentPage = 1; applyFilters();
    });
    var verifiedEl = document.getElementById('filter-verified-only');
    if (verifiedEl) verifiedEl.addEventListener('change', function() {
      state.filters.verifiedOnly = this.checked; _currentPage = 1; applyFilters();
    });
    var searchEl = document.getElementById('search');
    if (searchEl) searchEl.addEventListener('input', function() {
      state.filters.search = this.value.toLowerCase(); _currentPage = 1; applyFilters();
    });
    var resetEl = document.getElementById('reset-filters');
    if (resetEl) resetEl.addEventListener('click', function() {
      state.filters = { biomassType: '', contaminationMax: '', sort: 'newest', radius: 0, verifiedOnly: false, search: '' };
      document.getElementById('filter-biomass').value = '';
      document.getElementById('filter-sort').value = 'newest';
      document.getElementById('filter-contamination').value = '';
      var rv = document.getElementById('filter-radius'); if (rv) rv.value = 0;
      var vv = document.getElementById('filter-verified-only'); if (vv) vv.checked = false;
      var sv = document.getElementById('search'); if (sv) sv.value = '';
      _currentPage = 1;
      applyFilters();
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
    if (window.UIUtils) UIUtils.showLoading('fs-grid', 'Loading feedstock listings...');
    // Always show demo data immediately
    var demoList = window.FEEDSTOCK_LISTINGS ? window.FEEDSTOCK_LISTINGS.slice() : [];
    state.listings = demoList;
    geocodeListings(demoList).then(function (list) {
      state.listings = list;
      computeDistances();
      applyFilters();
    });

    // Then layer in real Firestore listings on top
    firebase.firestore().collection('feedstock_listings')
      .where('status', '==', 'active')
      .get()
      .then(function (snap) {
        if (snap.empty) return;
        var realListings = [];
        snap.forEach(function (doc) { var d = doc.data(); d._id = doc.id; realListings.push(d); });
        return geocodeListings(realListings).then(function (geocoded) {
          state.listings = demoList.concat(geocoded);
          computeDistances();
          applyFilters();
        });
      })
      .catch(function (err) {
        console.warn('Firestore fetch failed, showing demo data only:', err);
        if (demoList.length && window.UIUtils) {
          UIUtils.toast('Live feedstock listings unavailable. Showing demo listings.', 'warning', 2800);
          return;
        }
        if (window.UIUtils) UIUtils.showError('fs-grid', 'Could not load feedstock listings.', function () { window.location.reload(); });
      });
  }

  function initMap() {
    var mapEl = document.getElementById("feedstock-map");
    if (!mapEl || typeof L === "undefined") return;

    var defaultCenter = [36.7783, -119.4179];
    var defaultZoom = 7;

    var map = L.map("feedstock-map", { zoomControl: true }).setView(defaultCenter, defaultZoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 13
    }).addTo(map);

    var radiusCircle = null;
    var supplierLayer = L.layerGroup().addTo(map);
    var userLayer = L.layerGroup().addTo(map);
    var feedstockGeo = { lat: null, lng: null };

    function metersFromMiles(miles) { return miles * 1609.34; }

    function htmlEscape(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function plotSuppliers(centerLat, centerLng) {
      supplierLayer.clearLayers();
      var allListings = (window.FEEDSTOCK_LISTINGS || []);
      var firestoreListings = window._firestoreFeedstockListings || [];
      var combined = allListings.concat(firestoreListings);
      var geocodePromises = combined.map(function(listing) {
        var z = listing.locationZip || listing.zipcode || listing.supplierZip;
        if (!z) return Promise.resolve(null);
        return geocodeZip(z).then(function(c) {
          return c ? { listing: listing, coords: c } : null;
        }).catch(function() { return null; });
      });
      Promise.all(geocodePromises).then(function(results) {
        var visibleCount = 0;
        results.filter(Boolean).forEach(function(item) {
          var l = item.listing;
          var c = item.coords;
          if (centerLat && centerLng) {
            var dist = haversine(centerLat, centerLng, c.lat, c.lng);
            if (dist > 250) return;
          }
          visibleCount += 1;
          var supplierName = l.company || l.supplierName || l.producerName || 'Supplier';
          var biomassLabel = BIOMASS_LABELS[l.biomassType] || l.biomassType || 'Biomass';
          var price = (l.pricePerTon === 0) ? 'Free to haul' : '$' + (l.pricePerTon || '—') + '/ton';
          var listingId = l._id || l.id || '';
          L.circleMarker([c.lat, c.lng], {
            radius: 10,
            color: '#fff',
            fillColor: '#3D6B45',
            fillOpacity: 0.9,
            weight: 2
          }).bindPopup(
            '<strong>' + htmlEscape(supplierName) + '</strong><br>' +
            htmlEscape(biomassLabel) + ' · ' + htmlEscape(price) + '<br>' +
            '<a href="feedstock-listing.html?id=' + encodeURIComponent(listingId) + '" style="color:#3D6B45;font-weight:600">View listing →</a>'
          ).addTo(supplierLayer);
        });
        var countEl = document.getElementById('map-producer-count');
        if (countEl) countEl.textContent = visibleCount ? (visibleCount + ' suppliers shown') : '';
      });
    }

    function plotUserLocation(lat, lng, name) {
      userLayer.clearLayers();
      L.circleMarker([lat, lng], {
        radius: 10,
        color: '#fff',
        fillColor: '#B87333',
        fillOpacity: 0.9,
        weight: 2
      }).bindPopup('<strong>Your location</strong><br>' + (name || '')).addTo(userLayer);
      if (radiusCircle) map.removeLayer(radiusCircle);
      radiusCircle = L.circle([lat, lng], {
        radius: metersFromMiles(250),
        color: '#3D6B45',
        fillColor: '#3D6B45',
        fillOpacity: 0.04,
        weight: 1,
        dashArray: '6 4'
      }).addTo(map);
      map.setView([lat, lng], 7);
    }

    var legendControl = L.control({ position: 'bottomleft' });
    legendControl.onAdd = function() {
      var div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:#3D6B45;display:inline-block"></span> Feedstock supplier</div>' +
        '<div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:#B87333;display:inline-block"></span> Your location</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:4px">Dashed circle = 250 mi radius</div>';
      return div;
    };
    legendControl.addTo(map);

    plotSuppliers(null, null);

    function centerMapOnUser() {
      var zip = window.AuthState && window.AuthState.profile && window.AuthState.profile.zipcode
        ? window.AuthState.profile.zipcode
        : null;
      if (!zip) return;
      geocodeZip(zip).then(function(c) {
        if (!c) return;
        feedstockGeo.lat = c.lat;
        feedstockGeo.lng = c.lng;
        plotUserLocation(c.lat, c.lng, (window.AuthState && window.AuthState.profile && window.AuthState.profile.businessName) || '');
        plotSuppliers(c.lat, c.lng);
      });
    }

    window._centerMapOnUser = centerMapOnUser;
    centerMapOnUser();

    db.collection('feedstock_listings').where('status', '==', 'active').onSnapshot(function(snap) {
      window._firestoreFeedstockListings = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        window._firestoreFeedstockListings.push(d);
      });
      plotSuppliers(feedstockGeo.lat, feedstockGeo.lng);
    }, function() {
      if (window.UIUtils) UIUtils.toast('Live supplier map unavailable. Showing available cached/demo pins.', 'warning', 2600);
    });
  }

  function init() {
    bindFilters();
    bindModal();
    initMap();
    if (window.AuthState && typeof window.AuthState.onReady === 'function') {
      window.AuthState.onReady(function(user, profile) {
        if (profile && profile.zipcode) {
          var radiusEl = document.getElementById('filter-radius');
          if (radiusEl && radiusEl.value === '0') radiusEl.value = '100';
          setZip(profile.zipcode);
        }
        if (typeof window._centerMapOnUser === 'function') window._centerMapOnUser();
      });
    }
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
          if (doc.exists && doc.data().zipcode) {
            var z = doc.data().zipcode;
            var radiusEl = document.getElementById('filter-radius');
            if (radiusEl && radiusEl.value === '0') radiusEl.value = '100';
            setZip(z);
          }
          if (doc.exists) {
            var d = doc.data();
            if (d.name) document.getElementById('modal-name').value = d.name;
            if (d.businessName) document.getElementById('modal-company').value = d.businessName;
            document.getElementById('modal-email').value = d.email || user.email || '';
          }
          if (typeof window._centerMapOnUser === 'function') window._centerMapOnUser();
        });
      }
      loadListings();
    });
    if (window._DEMAND_ENABLED !== false) renderDemandTab();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
