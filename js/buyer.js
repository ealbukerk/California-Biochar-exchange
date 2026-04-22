(function () {
  var compareList = [];
  var LISTINGS_PAGE_SIZE = 20;
  var _currentPage = 1;
  var _allFilteredListings = [];
  var _usingDemoFallback = false;
  var state = {
    user: null,
    profile: null
  };

  function getAllListings() {
    var demoListings = Array.isArray(window.LISTINGS) ? window.LISTINGS.slice() : [];
    var firestoreListings = Array.isArray(window._firestoreListings) ? window._firestoreListings.slice() : [];
    var byId = {};
    demoListings.forEach(function (listing) {
      if (!listing || !listing.id) return;
      byId[String(listing.id)] = listing;
    });
    firestoreListings.forEach(function (listing) {
      if (!listing || !listing.id) return;
      byId[String(listing.id)] = listing;
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

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

  function formatMonthYear(value) {
    var date = toDateOnly(value);
    if (!date) return "";
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function formatShortDate(value) {
    var date = toDateOnly(value);
    if (!date) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function isListingVisible(listing) {
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
        return '<div class="availability-pill availability-pill--warn">🕐 Available in ' + daysUntil + ' day' + (daysUntil !== 1 ? 's' : '') + ' · ' + formatMonthYear(from) + '</div>';
      }
      return '<div class="availability-pill availability-pill--muted">Available ' + formatMonthYear(from) + '</div>';
    }
    if (until) {
      var daysLeft = daysBetween(today, until);
      if (daysLeft <= 14) {
        return '<div class="availability-pill availability-pill--warn">⚠ Available now · Expires in ' + Math.max(daysLeft, 0) + ' day' + (Math.max(daysLeft, 0) !== 1 ? 's' : '') + '</div>';
      }
      return '<div class="availability-pill availability-pill--ready">✓ Available now · Until ' + formatShortDate(until) + '</div>';
    }
    return '<div class="availability-pill availability-pill--muted">' + (from ? formatShortDate(from) : 'Availability on request') + '</div>';
  }

  function updateCompareBar() {
    const bar = document.getElementById("compare-bar");
    const count = document.getElementById("compare-count");
    if (!bar || !count) return;
    if (compareList.length >= 2) {
      bar.style.display = "flex";
      count.textContent = compareList.length + " listings selected";
    } else {
      bar.style.display = "none";
    }
  }

  function runComparison() {
    if (compareList.length < 2) return;
    var selected = compareList
      .map(function (id) {
        return getAllListings().find(function (listing) {
          return String(listing.id) === String(id);
        });
      })
      .filter(Boolean);
    if (selected.length < 2) return;
    var filterBar = document.getElementById("filter-bar");
    var grid = document.getElementById("listings-grid");
    var comparisonView = document.getElementById("comparison-view");
    var compareBar = document.getElementById("compare-bar");
    if (filterBar) filterBar.classList.add("hidden");
    if (grid) grid.classList.add("hidden");
    if (compareBar) compareBar.style.display = "none";
    if (comparisonView) {
      comparisonView.classList.remove("hidden");
    }
    renderComparisonView(selected);
  }

  function closeComparison() {
    compareList = [];
    var modal = document.getElementById('comparison-view');
    if (modal) modal.style.display = 'none';
    renderBrowseListings();
  }
  window.closeComparison = closeComparison;

  function renderComparisonView(listings) {
    var existing = document.getElementById('comparison-view');
    var modal = existing || document.createElement('div');
    modal.id = 'comparison-view';
    modal.classList.remove('hidden');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;overflow-y:auto;display:block;';

    // Score each listing per field. Ties all get the point.
    var scores = listings.map(function() { return 0; });

    function awardBest(indexedValues, lowerIsBetter) {
      var vals = indexedValues.map(function(iv) { return iv.v; });
      var validVals = vals.filter(function(v) { return v !== null; });
      if (!validVals.length) return [];
      var best = lowerIsBetter ? Math.min.apply(null, validVals) : Math.max.apply(null, validVals);
      return indexedValues.filter(function(iv) { return iv.v === best; }).map(function(iv) { return iv.i; });
    }

    function awardClosestToRange(indexedValues, lo, hi) {
      var distances = indexedValues.map(function(iv) {
        if (iv.v === null) return { i: iv.i, d: Infinity };
        var v = iv.v;
        var d = (v >= lo && v <= hi) ? 0 : Math.min(Math.abs(v - lo), Math.abs(v - hi));
        return { i: iv.i, d: d };
      });
      var validD = distances.filter(function(x) { return x.d !== Infinity; });
      if (!validD.length) return [];
      var bestD = Math.min.apply(null, validD.map(function(x) { return x.d; }));
      return distances.filter(function(x) { return x.d === bestD; }).map(function(x) { return x.i; });
    }

    function parseParticleRange(str) {
      if (!str) return null;
      var nums = str.replace(/[^0-9.\-–]/g, ' ').trim().split(/[\s\-–]+/).map(parseFloat).filter(function(n) { return !isNaN(n); });
      if (nums.length >= 2) return { lo: nums[0], hi: nums[1] };
      if (nums.length === 1) return { lo: nums[0], hi: nums[0] };
      return null;
    }

    function awardBestParticle(listings) {
      var OPTIMAL_LO = 1, OPTIMAL_HI = 4;
      var scored = listings.map(function(l, i) {
        var r = parseParticleRange(l.scorecard.particleSize);
        if (!r) return { i: i, score: -1 };
        var overlapLo = Math.max(r.lo, OPTIMAL_LO);
        var overlapHi = Math.min(r.hi, OPTIMAL_HI);
        var overlap = Math.max(0, overlapHi - overlapLo);
        var span = r.hi - r.lo || 1;
        return { i: i, score: overlap / span };
      });
      var validScored = scored.filter(function(x) { return x.score >= 0; });
      if (!validScored.length) return [];
      var best = Math.max.apply(null, validScored.map(function(x) { return x.score; }));
      return scored.filter(function(x) { return x.score === best; }).map(function(x) { return x.i; });
    }

    var numericFields = [
      { label: 'Carbon Content', key: 'carbonContent', unit: '%', lowerIsBetter: false },
      { label: 'Surface Area', key: 'surfaceArea', unit: ' m²/g', lowerIsBetter: false },
      { label: 'Moisture', key: 'moisture', unit: '%', lowerIsBetter: true },
      { label: 'Ash Content', key: 'ashContent', unit: '%', lowerIsBetter: true },
      { label: 'Electrical Conductivity', key: 'electricalConductivity', unit: ' dS/m', lowerIsBetter: true },
    ];

    // Award points for each numeric field
    numericFields.forEach(function(field) {
      var indexed = listings.map(function(l, i) {
        var v = typeof l.scorecard[field.key] === 'number' ? l.scorecard[field.key] : null;
        return { i: i, v: v };
      });
      awardBest(indexed, field.lowerIsBetter).forEach(function(i) { scores[i] += 1; });
    });

    // Award points for pH (optimal 7.5–8.5)
    var phIndexed = listings.map(function(l, i) { return { i: i, v: typeof l.scorecard.pH === 'number' ? l.scorecard.pH : null }; });
    awardClosestToRange(phIndexed, 7.5, 8.5).forEach(function(i) { scores[i] += 1; });

    // Award points for particle size (optimal 1–4mm)
    awardBestParticle(listings).forEach(function(i) { scores[i] += 1; });

    // Build field rows with winner checkmarks
    function buildNumericRow(label, values, unit, lowerIsBetter) {
      var indexed = values.map(function(v, i) { return { i: i, v: v }; });
      var winners = awardBest(indexed, lowerIsBetter);
      var cells = values.map(function(v, i) {
        var isWinner = winners.indexOf(i) !== -1;
        return '<td style="padding:12px 16px;border-bottom:1px solid #eee;text-align:center">' +
          (v !== null ? v + unit : '—') +
          (isWinner ? ' <span style="color:var(--color-accent);font-weight:700">✓</span>' : '') +
          '</td>';
      }).join('');
      return '<tr><td style="padding:12px 16px;border-bottom:1px solid #eee;font-weight:500;white-space:nowrap">' + label + '</td>' + cells + '</tr>';
    }

    var fieldRows = numericFields.map(function(field) {
      var values = listings.map(function(l) {
        return typeof l.scorecard[field.key] === 'number' ? l.scorecard[field.key] : null;
      });
      return buildNumericRow(field.label, values, field.unit, field.lowerIsBetter);
    }).join('');

    // pH row
    var phVals = listings.map(function(l) { return typeof l.scorecard.pH === 'number' ? l.scorecard.pH : null; });
    var phWinners = awardClosestToRange(phVals.map(function(v,i){return{i:i,v:v};}), 7.5, 8.5);
    var phRow = '<tr><td style="padding:12px 16px;border-bottom:1px solid #eee;font-weight:500">pH <span style="font-size:11px;color:#999">(opt 7.5–8.5)</span></td>' +
      phVals.map(function(v, i) {
        return '<td style="padding:12px 16px;border-bottom:1px solid #eee;text-align:center">' +
          (v !== null ? v : '—') +
          (phWinners.indexOf(i) !== -1 ? ' <span style="color:var(--color-accent);font-weight:700">✓</span>' : '') +
          '</td>';
      }).join('') + '</tr>';

    // Particle size row
    var particleWinners = awardBestParticle(listings);
    var particleRow = '<tr><td style="padding:12px 16px;border-bottom:1px solid #eee;font-weight:500">Particle Size <span style="font-size:11px;color:#999">(opt 1–4mm)</span></td>' +
      listings.map(function(l, i) {
        return '<td style="padding:12px 16px;border-bottom:1px solid #eee;text-align:center">' +
          htmlEscape(l.scorecard.particleSize || '—') +
          (particleWinners.indexOf(i) !== -1 ? ' <span style="color:var(--color-accent);font-weight:700">✓</span>' : '') +
          '</td>';
      }).join('') + '</tr>';

    // Total score row
    var maxScore = Math.max.apply(null, scores);
    var scoreRow = '<tr style="background:var(--color-accent-light)"><td style="padding:12px 16px;font-weight:700">Total Score</td>' +
      scores.map(function(s) {
        return '<td style="padding:12px 16px;text-align:center;font-weight:700;font-size:18px;color:' +
          (s === maxScore ? 'var(--color-accent)' : 'inherit') + '">' + s + ' / 7</td>';
      }).join('') + '</tr>';

    var headerCols = '<th style="padding:12px 16px;text-align:left;min-width:180px">Field</th>' +
      listings.map(function(l) {
        return '<th style="padding:12px 16px;text-align:center;font-weight:600">' +
          htmlEscape(l.producerName) + '<br>' +
          '<span style="font-size:12px;font-weight:400;color:#666">' + htmlEscape(l.feedstock) + '</span>' +
          '</th>';
      }).join('');

    modal.innerHTML = '<div style="background:#fff;max-width:' + (280 + listings.length * 220) + 'px;margin:60px auto;border-radius:8px;padding:32px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">' +
      '<h2 style="margin:0">Compare Listings</h2>' +
      '<button onclick="closeComparison()" style="background:none;border:none;font-size:24px;cursor:pointer">×</button>' +
      '</div>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
      '<thead style="background:#f9f9f9"><tr>' + headerCols + '</tr></thead>' +
      '<tbody>' + fieldRows + phRow + particleRow + scoreRow + '</tbody>' +
      '</table></div></div>';

    if (!existing) document.body.appendChild(modal);
    modal.style.display = 'block';
  }

  document.addEventListener("click", function (e) {
    if (e.target.id === "compare-btn" || e.target.closest("#compare-btn")) {
      e.preventDefault();
      e.stopPropagation();
      runComparison();
    }
  });

  document.addEventListener("change", function (e) {
    if (!e.target.classList.contains("compare-check")) return;
    e.stopPropagation();
    var id = e.target.dataset.id;
    if (e.target.checked) {
      if (compareList.length >= 3) {
        e.target.checked = false;
        return;
      }
      if (compareList.indexOf(id) === -1) compareList.push(id);
    } else {
      compareList = compareList.filter(function (i) { return i !== id; });
    }
    updateCompareBar();
  });

  if (typeof window.submitToAirtable !== "function") {
    window.submitToAirtable = async function () {
      return {};
    };
  }

  var countyCoords = {
    Butte: [39.6, -121.6],
    Colusa: [39.2, -122.0],
    Fresno: [36.7, -119.7],
    Glenn: [39.6, -122.4],
    Kern: [35.3, -118.7],
    Kings: [36.1, -119.8],
    Madera: [37.2, -119.7],
    Mendocino: [39.3, -123.3],
    Merced: [37.2, -120.7],
    Monterey: [36.2, -121.0],
    Napa: [38.5, -122.3],
    Nevada: [39.3, -120.8],
    Sacramento: [38.5, -121.5],
    "San Joaquin": [37.9, -121.3],
    "San Luis Obispo": [35.3, -120.4],
    "Santa Barbara": [34.7, -119.7],
    "Santa Cruz": [37.0, -122.0],
    Shasta: [40.8, -122.0],
    Solano: [38.3, -121.9],
    Sonoma: [38.3, -122.7],
    Stanislaus: [37.5, -120.9],
    Sutter: [39.0, -121.7],
    Tehama: [40.1, -122.2],
    Tulare: [36.2, -119.0],
    Ventura: [34.4, -119.1],
    Yolo: [38.7, -121.9],
    Yuba: [39.2, -121.4],
    Humboldt: [40.7, -123.9],
    "Santa Clara": [37.3, -121.9],
    "El Dorado": [38.7, -120.5]
  };

  var geoCache = {};

  function htmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateRange(fromISO, untilISO) {
    var from = new Date(fromISO);
    var until = new Date(untilISO);

    if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
      return fromISO + " - " + untilISO;
    }

    return (
      from.toLocaleDateString("en-US", { month: "short", year: "numeric" }) +
      " – " +
      until.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    );
  }

  function renderStars(rating) {
    if (rating == null) {
      return "";
    }
    var rounded = Math.round(rating);
    var stars = "";
    var i;
    for (i = 0; i < 5; i += 1) {
      stars += i < rounded ? "★" : "☆";
    }
    return stars;
  }

  function getLeadTimeDisplay(leadTimeDays) {
    var days = Number(leadTimeDays) || 0;
    if (days <= 0) {
      return { text: "Ready to ship", className: "lead-time-ready" };
    }
    return { text: Math.ceil(days / 7) + "-week lead time", className: "lead-time-standard" };
  }

  function parseOptimalRadius(value) {
    if (!value || value === "none") return null;
    var parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function getServiceAreaText(listing) {
    var radius = parseOptimalRadius(listing.optimalRadius);
    var zip = listing.producerZip || listing.zipcode || "";
    if (!radius) return "Nationwide";
    return "Serves within ~" + radius + "mi" + (zip ? " of " + zip : "");
  }

  function getVerificationBadge(listing) {
    if (listing.verifiedLevel1 && listing.verifiedLevel2) {
      return '<span class="verification-badge verification-badge--trusted">✓✓ Trusted Seller</span>';
    }
    if (listing.verifiedLevel1 || (listing.verified === true && !listing.verifiedLevel1)) {
      return '<span class="verification-badge verification-badge--reviewed">✓ Reviewed</span>';
    }
    if (listing.verified === false) {
      return '<span class="verification-badge verification-badge--unverified">Unverified</span>';
    }
    return "";
  }

  function getListingDistanceMiles(listing) {
    var listingZip = listing && (listing.producerZip || listing.zipcode);
    if (!buyerGeo.lat || !listingZip) return null;
    var cached = buyerGeo['_zip_' + listingZip];
    if (!cached || !cached.lat) return null;
    return haversineB(buyerGeo.lat, buyerGeo.lng, cached.lat, cached.lng);
  }

  function canSelfPickupListing(listing, profileLike) {
    var profile = profileLike || {};
    var maxRadius = Number(profile.maxPickupRadius || 50);
    if (!profile.canSelfPickup) return false;
    var distanceMiles = getListingDistanceMiles(listing);
    return distanceMiles != null && distanceMiles <= maxRadius;
  }

  function buildExplanation(score, reasons) {
    var prefix = "Possible match";
    if (score >= 80) prefix = "Strong match";
    else if (score >= 60) prefix = "Good match";

    if (!reasons.length) {
      return prefix + " — baseline compatibility.";
    }

    if (reasons.length === 1) {
      return prefix + " — " + reasons[0] + ".";
    }

    return prefix + " — " + reasons.slice(0, -1).join(", ") + ", and " + reasons[reasons.length - 1] + ".";
  }

  var BIOCHAR_MATCH_WEIGHTS = {
    agronomic: 34,
    chemistry: 16,
    quality: 12,
    scale: 10,
    trust: 8,
    economics: 14,
    logistics: 6
  };

  function hasBiocharMatchProfile(profileLike) {
    if (!profileLike) return false;
    return Boolean(
      (Array.isArray(profileLike.cropTypes) && profileLike.cropTypes.length) ||
      profileLike.soilPH ||
      profileLike.soilType ||
      (Array.isArray(profileLike.soilIssues) && profileLike.soilIssues.length) ||
      profileLike.organicCertified ||
      profileLike.zipcode ||
      profileLike.acreage ||
      profileLike.applicationRate ||
      profileLike.canSelfPickup
    );
  }

  function addBucketReason(reasons, weight, ratio, positiveText, negativeText) {
    var safeRatio = Math.max(0, Math.min(1, ratio));
    var signedImpact = (safeRatio - 0.5) * weight;
    var text = signedImpact >= 0 ? positiveText : negativeText;
    if (!text) return;
    reasons.push({
      text: text,
      impact: Math.abs(signedImpact),
      direction: signedImpact >= 0 ? 'positive' : 'negative',
      order: reasons.length
    });
  }

  function topBucketReasons(reasons) {
    return reasons.slice().sort(function (a, b) {
      if (b.impact !== a.impact) return b.impact - a.impact;
      if (a.direction !== b.direction) return a.direction === 'negative' ? -1 : 1;
      return a.order - b.order;
    }).slice(0, 3).map(function (reason) {
      return reason.text;
    });
  }

  function parseParticleMidpoint(value) {
    if (!value) return null;
    var matches = String(value).match(/\d+(\.\d+)?/g);
    if (!matches || !matches.length) return null;
    var nums = matches.map(function (n) { return parseFloat(n); }).filter(function (n) { return !isNaN(n); });
    if (!nums.length) return null;
    if (nums.length === 1) return nums[0];
    return (nums[0] + nums[1]) / 2;
  }

  function estimateBuyerNeedTonnes(profileLike) {
    var acreage = Number(profileLike && profileLike.acreage) || 0;
    var applicationRate = Number(profileLike && profileLike.applicationRate) || 0;
    if (acreage > 0 && applicationRate > 0) return acreage * applicationRate;
    return null;
  }

  function estimateDeliveredProxy(listing, profileLike) {
    var distanceMiles = getListingDistanceMiles(listing);
    if (distanceMiles == null || !window.DeliveredCost || typeof window.DeliveredCost.getTruckRate !== 'function') {
      return null;
    }
    var targetTonnes = Math.max(
      Number(listing.minOrderTonnes) || 1,
      Math.min(
        Number(listing.availableTonnes) || Number(listing.minOrderTonnes) || 1,
        Math.round(estimateBuyerNeedTonnes(profileLike) || 0) || Number(listing.minOrderTonnes) || 1
      )
    );
    var moisturePct = listing.scorecard && typeof listing.scorecard.moisture === 'number' ? listing.scorecard.moisture : 0;
    var physicalTons = typeof window.DeliveredCost.moistureAdjustedTons === 'function'
      ? window.DeliveredCost.moistureAdjustedTons(targetTonnes, moisturePct)
      : targetTonnes;
    var truckloads = Math.ceil(Math.max(physicalTons, 1) / 20);
    var ratePerMile = window.DeliveredCost.getTruckRate(distanceMiles);
    var transportCostPerTonne = (distanceMiles * ratePerMile * 2 * truckloads) / Math.max(targetTonnes, 1);
    return {
      deliveredPerTonne: Number(listing.pricePerTonne || 0) + transportCostPerTonne,
      distanceMiles: distanceMiles
    };
  }

  function scoreListingForInputs(listing, profileLike) {
    // Biochar matching uses capped buckets so no one sub-factor can dominate.
    var score = 0;
    var reasons = [];
    var scorecard = listing.scorecard || {};
    var crops = Array.isArray(profileLike.cropTypes) ? profileLike.cropTypes : [];
    var suitableFor = Array.isArray(listing.suitableFor) ? listing.suitableFor : [];
    var soilType = profileLike.soilType || "";
    var soilIssues = Array.isArray(profileLike.soilIssues) ? profileLike.soilIssues : [];
    var organicFlag = String(profileLike.organicCertified || "").toLowerCase();
    var particleMid = parseParticleMidpoint(scorecard.particleSize);

    // Agronomic fit combines crop/application, soil issues, and soil type into one capped bucket.
    var agronomicRatio = 0.18;
    if (crops.length || soilIssues.length || soilType) {
      var cropPart = 0.18;
      if (crops.length) {
        var cropMatches = crops.filter(function (crop) { return suitableFor.indexOf(crop) !== -1; });
        if (cropMatches.length) cropPart = 1;
        else if (suitableFor.length) cropPart = 0.08;
      }

      var issuesPart = 0.2;
      if (soilIssues.length) {
        var issueSignals = [];
        if (soilIssues.indexOf("Low water retention") !== -1) {
          issueSignals.push(scorecard.surfaceArea >= 300 ? 1 : scorecard.surfaceArea >= 220 ? 0.65 : scorecard.surfaceArea ? 0.18 : 0.12);
        }
        if (soilIssues.indexOf("High salinity") !== -1) {
          issueSignals.push(scorecard.electricalConductivity <= 1.2 ? 1 : scorecard.electricalConductivity <= 2.2 ? 0.5 : scorecard.electricalConductivity ? 0.12 : 0.12);
        }
        if (soilIssues.indexOf("Compaction") !== -1) {
          issueSignals.push(particleMid != null ? (particleMid >= 1 && particleMid <= 4 ? 0.95 : particleMid <= 6 ? 0.55 : 0.15) : 0.15);
        }
        if (soilIssues.indexOf("Low organic matter") !== -1) {
          issueSignals.push(scorecard.carbonContent >= 75 ? 0.95 : scorecard.carbonContent >= 65 ? 0.65 : scorecard.carbonContent ? 0.25 : 0.15);
        }
        if (issueSignals.length) {
          issuesPart = issueSignals.reduce(function (sum, value) { return sum + value; }, 0) / issueSignals.length;
        }
      }

      var soilTypePart = 0.25;
      if (soilType === "Sandy") {
        soilTypePart = scorecard.surfaceArea >= 250 ? 0.95 : scorecard.surfaceArea >= 180 ? 0.65 : scorecard.surfaceArea ? 0.22 : 0.18;
      } else if (soilType === "Clay") {
        soilTypePart = particleMid != null ? (particleMid >= 2 && particleMid <= 6 ? 0.9 : particleMid >= 1 && particleMid <= 8 ? 0.55 : 0.18) : 0.18;
      } else if (soilType === "Loam") {
        soilTypePart = 0.6;
      }

      agronomicRatio = (cropPart * 0.45) + (issuesPart * 0.35) + (soilTypePart * 0.2);
    }
    score += BIOCHAR_MATCH_WEIGHTS.agronomic * agronomicRatio;
    addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.agronomic, agronomicRatio, agronomicRatio >= 0.7 ? 'Strong agronomic fit' : 'Some agronomic alignment', agronomicRatio <= 0.25 ? 'Weak agronomic fit' : 'Mixed agronomic fit');

    var chemistryRatio = 0.28;
    var listingPh = Number(scorecard.pH);
    if (profileLike.soilPH && listingPh) {
      if (profileLike.soilPH === "Below 5.5") chemistryRatio = listingPh >= 8.2 ? 1 : listingPh >= 7.4 ? 0.7 : listingPh >= 6.6 ? 0.32 : 0.08;
      else if (profileLike.soilPH === "5.5–6.5") chemistryRatio = (listingPh >= 7.0 && listingPh <= 8.2) ? 1 : (listingPh >= 6.4 && listingPh <= 8.8) ? 0.6 : 0.2;
      else if (profileLike.soilPH === "6.5–7.5") chemistryRatio = (listingPh >= 7.2 && listingPh <= 8.3) ? 0.82 : (listingPh >= 6.6 && listingPh <= 8.8) ? 0.5 : 0.16;
      else if (profileLike.soilPH === "Above 8.5") chemistryRatio = listingPh <= 7.6 ? 0.88 : listingPh <= 8.2 ? 0.45 : 0.08;
    }
    score += BIOCHAR_MATCH_WEIGHTS.chemistry * chemistryRatio;
    addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.chemistry, chemistryRatio, chemistryRatio >= 0.72 ? 'pH profile aligns well' : 'pH fit looks acceptable', chemistryRatio <= 0.18 ? 'pH fit looks weak' : 'pH fit is mixed');

    var qualitySignals = [];
    qualitySignals.push(scorecard.carbonContent >= 75 ? 1 : scorecard.carbonContent >= 65 ? 0.72 : scorecard.carbonContent >= 55 ? 0.42 : scorecard.carbonContent ? 0.18 : 0.2);
    var surfaceNeed = soilIssues.indexOf("Low water retention") !== -1 || soilType === "Sandy";
    qualitySignals.push(surfaceNeed ? (scorecard.surfaceArea >= 250 ? 1 : scorecard.surfaceArea >= 180 ? 0.65 : scorecard.surfaceArea ? 0.18 : 0.15) : (scorecard.surfaceArea >= 150 ? 0.7 : scorecard.surfaceArea ? 0.4 : 0.2));
    qualitySignals.push(particleMid == null ? 0.2 : (particleMid >= 1 && particleMid <= 5 ? 0.8 : particleMid <= 8 ? 0.5 : 0.18));
    qualitySignals.push(scorecard.electricalConductivity <= 1.5 ? 0.9 : scorecard.electricalConductivity <= 2.5 ? 0.55 : scorecard.electricalConductivity ? 0.18 : 0.22);
    qualitySignals.push(scorecard.labVerified ? 0.92 : 0.2);
    var qualityRatio = qualitySignals.reduce(function (sum, value) { return sum + value; }, 0) / qualitySignals.length;
    score += BIOCHAR_MATCH_WEIGHTS.quality * qualityRatio;
    addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.quality, qualityRatio, qualityRatio >= 0.72 ? 'Strong material quality profile' : 'Material quality looks workable', qualityRatio <= 0.22 ? 'Material quality fit is weak' : 'Material quality is mixed');

    var needTonnes = estimateBuyerNeedTonnes(profileLike);
    var scaleRatio = 0.28;
    if (needTonnes) {
      var coverRatio = Number(listing.availableTonnes || 0) / Math.max(needTonnes, 1);
      if (coverRatio >= 0.75) scaleRatio = 1;
      else if (coverRatio >= 0.4) scaleRatio = 0.72;
      else if (coverRatio >= 0.15) scaleRatio = 0.42;
      else scaleRatio = 0.12;
    } else {
      var tonnes = Number(listing.availableTonnes || 0);
      if (tonnes >= 50) scaleRatio = 0.88;
      else if (tonnes >= 20) scaleRatio = 0.65;
      else if (tonnes >= 5) scaleRatio = 0.4;
      else scaleRatio = 0.16;
    }
    score += BIOCHAR_MATCH_WEIGHTS.scale * scaleRatio;
    addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.scale, scaleRatio, scaleRatio >= 0.7 ? 'Supply volume fits likely need' : 'Supply volume could work', scaleRatio <= 0.2 ? 'Supply volume is probably undersized' : 'Supply volume may be tight');

    var trustRatio = 0.08;
    var organicNeeded = organicFlag === "yes" || organicFlag === "true";
    var organicCertified = Array.isArray(listing.certifications) && (listing.certifications.indexOf("OMRI Listed") !== -1 || listing.certifications.indexOf("California Organic") !== -1);
    if (listing.verifiedLevel2) trustRatio = 1;
    else if (listing.verifiedLevel1 || listing.verified === true) trustRatio = 0.62;
    else trustRatio = 0.05;
    if (organicNeeded) {
      trustRatio = Math.min(1, trustRatio + (organicCertified ? 0.3 : -0.08));
    }
    score += BIOCHAR_MATCH_WEIGHTS.trust * trustRatio;
    addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.trust, trustRatio, organicNeeded && organicCertified ? 'Verified and organic-ready' : (trustRatio >= 0.6 ? 'Trusted seller signals' : 'Some trust signals present'), trustRatio <= 0.12 ? 'Limited trust and certification signals' : 'Trust signals are still developing');

    var economicsRatio = 0.18;
    var deliveredProxy = estimateDeliveredProxy(listing, profileLike);
    if (deliveredProxy) {
      var delivered = deliveredProxy.deliveredPerTonne;
      if (delivered <= 360) economicsRatio = 1;
      else if (delivered <= 460) economicsRatio = 0.82;
      else if (delivered <= 560) economicsRatio = 0.56;
      else if (delivered <= 700) economicsRatio = 0.28;
      else economicsRatio = 0.1;
      addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.economics, economicsRatio, 'Competitive delivered economics', delivered > 560 ? 'High delivered cost estimate' : 'Delivered economics are moderate');
    } else {
      var distanceMiles = getListingDistanceMiles(listing);
      if (distanceMiles != null) {
        if (distanceMiles <= 50) economicsRatio = 0.92;
        else if (distanceMiles <= 150) economicsRatio = 0.7;
        else if (distanceMiles <= 300) economicsRatio = 0.42;
        else if (distanceMiles <= 500) economicsRatio = 0.22;
        else economicsRatio = 0.1;
        addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.economics, economicsRatio, distanceMiles <= 150 ? 'Logistics look efficient' : 'Regional freight is workable', distanceMiles > 300 ? 'Distance weakens delivered economics' : 'Distance adds some cost pressure');
      } else {
        economicsRatio = 0.22;
        addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.economics, economicsRatio, 'Delivered economics look workable', 'Delivered economics are uncertain');
      }
    }
    score += BIOCHAR_MATCH_WEIGHTS.economics * economicsRatio;

    var logisticsRatio = 0.2;
    if (profileLike.canSelfPickup) {
      logisticsRatio = canSelfPickupListing(listing, profileLike) ? 1 : 0.12;
    } else if (parseOptimalRadius(listing.optimalRadius)) {
      logisticsRatio = 0.5;
    } else {
      logisticsRatio = 0.35;
    }
    score += BIOCHAR_MATCH_WEIGHTS.logistics * logisticsRatio;
    addBucketReason(reasons, BIOCHAR_MATCH_WEIGHTS.logistics, logisticsRatio, logisticsRatio >= 0.9 ? 'Self-pickup available' : 'Logistics look manageable', logisticsRatio <= 0.15 ? 'Pickup flexibility is limited' : 'Logistics preferences are only partly met');

    var normalized = Math.round(Math.max(0, Math.min(100, score)));
    var topReasons = topBucketReasons(reasons);
    return { listing: listing, score: normalized, explanation: buildExplanation(normalized, topReasons), reasons: topReasons };
  }

  function listingCardHtml(listing, extraScore, explanation, options) {
    options = options || {};

    var suitableList = Array.isArray(listing.suitableFor) ? listing.suitableFor : [];
    var visibleSuitable = suitableList.slice(0, 3);
    var suitableTags = visibleSuitable
      .map(function (item) {
        return '<span class="suitable-tag">' + htmlEscape(item) + "</span>";
      })
      .join("");

    var hiddenCount = Math.max(0, suitableList.length - 3);
    if (hiddenCount > 0) {
      suitableTags += '<span class="suitable-more">+' + hiddenCount + " more</span>";
    }

    var txCount = Number(listing.transactionsCompleted) || 0;
    var avgRating = listing.averageRating == null ? null : listing.averageRating;
    var ratingText = avgRating == null ? "No rating yet" : avgRating.toFixed(1);
    var stars = renderStars(avgRating);
    var lead = getLeadTimeDisplay(listing.leadTimeDays);
    var verifiedBadge = getVerificationBadge(listing);
    var selfPickupEligible = canSelfPickupListing(listing, state.profile);
    var distanceMiles = getListingDistanceMiles(listing);
    var autoVolume = (function() {
      var ac = state.profile && state.profile.acreage;
      var s = document.getElementById('pref-apprate-slider');
      var ar = s ? (parseFloat(s.value) || 7) : ((state.profile && state.profile.applicationRate) || 7);
      var vol = ac && ar ? Math.round(ac * ar) : null;
      return (vol && vol >= listing.minOrderTonnes) ? vol : listing.minOrderTonnes;
    })();

    return (
      '<div class="listing-card-wrapper" style="position:relative">' +
      '<div class="compare-corner">' +
      '<input type="checkbox" class="compare-check" data-id="' + htmlEscape(listing.id) + '"' +
      (compareList.indexOf(listing.id) !== -1 ? " checked" : "") +
      '><label class="compare-label">Compare</label>' +
      '</div>' +
      '<a href="listing.html?id=' + encodeURIComponent(listing.id) + '" class="listing-card' + (options.expanded ? ' listing-card--top-match' : '') + '" id="listing-' + htmlEscape(listing.id) + '" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;height:100%;padding:0">' +

      '<div style="width:100%;height:180px;background:' + (listing.photos && listing.photos[0] ? 'url(' + listing.photos[0] + ') center/cover no-repeat' : 'var(--color-accent-light)') + ';border-radius:var(--radius-lg) var(--radius-lg) 0 0;flex-shrink:0"></div>' +

      '<div style="padding:var(--space-5);display:flex;flex-direction:column;flex:1;gap:var(--space-3)">' +

      '<div>' +
      '<span class="feedstock-tag">' + htmlEscape(listing.feedstock) + '</span>' +
      '<h3 style="margin:var(--space-2) 0 0;font-size:var(--font-size-lg)">' + htmlEscape(listing.producerName) + (verifiedBadge ? ' ' + verifiedBadge : '') + '</h3>' +
      '<div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:2px">' + htmlEscape(getServiceAreaText(listing)) + '</div>' +
      (distanceMiles != null
        ? '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:4px">' + Math.round(distanceMiles) + ' mi from your ZIP</div>'
        : '') +
      (selfPickupEligible
        ? '<div style="margin-top:6px"><span class="verification-badge verification-badge--reviewed">Self-pickup available</span></div>'
        : '') +
      '</div>' +

      '<div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:var(--space-2)">' +
      '<div><span style="font-size:var(--font-size-2xl);font-weight:700;color:var(--color-text-primary)">$' + htmlEscape(listing.pricePerTonne) + '</span><span style="font-size:var(--font-size-sm);color:var(--color-text-muted)">/tonne</span></div>' +
      '<div class="delivered-cost-inline muted" id="dc-' + htmlEscape(listing.id) + '">Delivered cost shown after profile loads</div>' +
      (state.profile && state.profile.goals && state.profile.goals.indexOf('carbon_sequestration') !== -1 && listing.scorecard && listing.scorecard.carbonContent
        ? '<div id="co2cost-' + htmlEscape(listing.id) + '" style="font-size:var(--font-size-xs);color:var(--color-text-muted);text-align:right"></div>'
        : '') +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-2)">' +
      '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)"><div style="font-size:0.65rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600">Carbon</div><div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-text-primary);margin-top:2px">' + htmlEscape(listing.scorecard.carbonContent) + '%</div></div>' +
      '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)"><div style="font-size:0.65rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600">Ash</div><div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-text-primary);margin-top:2px">' + htmlEscape(listing.scorecard.ashContent) + '%</div></div>' +
      '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)"><div style="font-size:0.65rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600">EC</div><div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-text-primary);margin-top:2px">' + htmlEscape(listing.scorecard.electricalConductivity) + ' dS/m</div></div>' +
      '</div>' +

      '<div style="display:flex;align-items:center;justify-content:space-between;font-size:var(--font-size-xs);color:var(--color-text-muted)">' +
      '<span>' + htmlEscape(txCount) + ' transactions · ' + htmlEscape(ratingText) + (stars ? ' ' + htmlEscape(stars) : '') + '</span>' +
      '<span style="color:' + (listing.certifications && listing.certifications.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)') + ';font-weight:500">' + (listing.certifications && listing.certifications.length > 0 ? '✓ Certified' : 'Not certified') + '</span>' +
      '</div>' +

      '<div style="margin-top:2px">' + renderAvailabilityIndicator(listing) + '</div>' +

      (typeof extraScore === 'number'
        ? '<div><div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px"><span>Match</span><span>' + htmlEscape(extraScore) + '%</span></div><div class="match-score-bar"><div class="match-score-fill" style="width:' + htmlEscape(extraScore) + '%"></div></div>' +
            (explanation ? '<div class="match-reason-text">' + htmlEscape(explanation) + '</div>' : '') +
          '</div>'
        : '') +

      '</div>' +
      '</a>' +
      '</div>'
    );
  }

  async function handleCardBuyNow(listingId) {
    var listing = getAllListings().find(function (item) {
      return item.id === listingId;
    });
    if (!listing) return;

    if (!state.user) {
      window.location.href = "auth.html?role=buyer";
      return;
    }

    var buyerUID = state.user.uid;
    var buyerName = (state.profile && (state.profile.businessName || state.profile.name)) || state.user.email || "Buyer";

    try {
      var dealId = await createDealRoom(listing, state.profile || {}, buyerUID);
      await buyNow(
        dealId,
        buyerUID,
        buyerName,
        Number(listing.minOrderTonnes) || 1,
        "Buyer collects",
        ""
      );
      window.location.href = "dealroom.html?id=" + encodeURIComponent(dealId);
    } catch (error) {
      // no-op
    }
  }

  function renderTopMatchesBlock() {
    // consolidated into renderBrowseListings
  }

  function renderHeroSlot() {
    var slot = document.getElementById("hero-auth-slot");
    if (!slot) return;

    if (!state.user) {
      slot.innerHTML = '<a class="btn hero-cta" href="auth.html?role=buyer">Create free account</a>';
      return;
    }

    var business = (state.profile && state.profile.businessName) || "";
    slot.innerHTML = '<p style="color:white;margin-top:var(--space-4);">Welcome back, ' + htmlEscape(business) + "</p>";
  }

  function updateTopNav() {
    var login = document.getElementById("nav-login");
    var profile = document.getElementById("nav-profile");
    var logout = document.getElementById("nav-logout");

    if (!login || !profile || !logout) return;

    if (state.user) {
      login.classList.add("hidden");
      profile.classList.remove("hidden");
      logout.classList.remove("hidden");
    } else {
      login.classList.remove("hidden");
      profile.classList.add("hidden");
      logout.classList.add("hidden");
    }
  }

  function getMultiSelectValues(id) {
    var el = document.getElementById(id);
    if (!el || typeof el.getValue !== "function") return [];
    return el.getValue();
  }

  function getFilteredListings() {
    var listings = getAllListings();
    var search = (document.getElementById("search").value || "").trim().toLowerCase();
    var feedstock = getMultiSelectValues("ms-feedstock");
    var cert = getMultiSelectValues("ms-cert");
    var sort = document.getElementById("filter-sort").value;
    var availability = document.getElementById("filter-availability");
    var availabilityMode = availability ? availability.value : "all";

    var radiusEl = document.getElementById('filter-radius');
    var radiusMiles = radiusEl ? Number(radiusEl.value) : 0;

    var filtered = listings.filter(function (listing) {
      if (!isListingVisible(listing)) return false;
      var from = toDateOnly(listing.availableFrom);
      var until = toDateOnly(listing.availableUntil);
      var today = toDateOnly(new Date());
      if (availabilityMode === "now") {
        if (from && from > today) return false;
        if (until && until < today) return false;
      }
      if (availabilityMode === "soon") {
        if (!from || from <= today) return false;
      }
      var matchesSearch =
        !search ||
        listing.producerName.toLowerCase().indexOf(search) !== -1 ||
        listing.county.toLowerCase().indexOf(search) !== -1;

      var feedstockActive = feedstock.length && feedstock.indexOf("All") === -1;
      var certActive = cert.length && cert.indexOf("All") === -1;

      var matchesFeedstock = !feedstockActive || feedstock.indexOf(listing.feedstock) !== -1;
      var matchesCert =
        !certActive ||
        listing.certifications.some(function (item) {
          return cert.indexOf(item) !== -1;
        });

      var listingZip = listing.producerZip || listing.zipcode;
      if (buyerGeo.lat && listingZip) {
        var cached = buyerGeo['_zip_' + listingZip];
        if (cached === undefined) return true;
        if (cached === null) return true;
        var dist = haversineB(buyerGeo.lat, buyerGeo.lng, cached.lat, cached.lng);
        if (radiusMiles > 0 && dist > radiusMiles) return false;
      }

      return matchesSearch && matchesFeedstock && matchesCert;
    });
    var verifiedOnly = document.getElementById('filter-verified-only');
    if (verifiedOnly && verifiedOnly.checked) {
      filtered = filtered.filter(function(l) { return l.verified === true; });
    }

    filtered.sort(function (a, b) {
      if (sort === "price-asc") return a.pricePerTonne - b.pricePerTonne;
      if (sort === "price-desc") return b.pricePerTonne - a.pricePerTonne;
      if (sort === "carbon-desc") return b.scorecard.carbonContent - a.scorecard.carbonContent;
      if (sort === "tonnes-desc") return b.availableTonnes - a.availableTonnes;
      if (sort === "rating-desc") {
        if (a.averageRating == null && b.averageRating == null) return 0;
        if (a.averageRating == null) return 1;
        if (b.averageRating == null) return -1;
        return b.averageRating - a.averageRating;
      }
      return 0;
    });

    return filtered;
  }

  function renderBrowseListings() {
    var grid = document.getElementById("listings-grid");
    var comparisonView = document.getElementById("comparison-view");
    if (!grid) return;

    var filtered = getFilteredListings();
    _allFilteredListings = filtered.slice();
    if (_currentPage < 1) _currentPage = 1;
    if (!filtered.length) {
      if (window.UIUtils) {
        UIUtils.showEmpty("listings-grid", "No listings match your current filters.", "Try widening your filters or clearing search.");
      } else {
        grid.innerHTML = '<p class="no-results">No listings match your current filters.</p>';
      }
      var loadMoreEmpty = document.getElementById("listings-load-more-wrap");
      if (loadMoreEmpty) loadMoreEmpty.innerHTML = "";
      updateCompareBar();
      return;
    }

    var heading = document.getElementById("listings-heading");
    var subhead = document.getElementById("listings-subhead");

    var hasProfile = state.user && hasBiocharMatchProfile(state.profile);

    if (hasProfile) {
      filtered = filtered.map(function(listing) {
        return scoreListingForInputs(listing, state.profile);
      }).sort(function(a, b) { return b.score - a.score; });

      if (heading) heading.textContent = "Listings ranked for you";
      if (subhead) subhead.textContent = "Sorted by compatibility with your soil profile and crop types.";
      _allFilteredListings = filtered.slice();
      var pagedScored = filtered.slice(0, _currentPage * LISTINGS_PAGE_SIZE);
      grid.innerHTML = pagedScored.map(function(item, idx) {
        return listingCardHtml(item.listing, item.score, item.explanation, { expanded: idx < 3, includeCompare: true });
      }).join("");
    } else {
      if (heading) heading.textContent = "All listings";
      if (subhead) subhead.textContent = "";
      var paged = filtered.slice(0, _currentPage * LISTINGS_PAGE_SIZE);
      grid.innerHTML = paged.map(function(listing) {
        return listingCardHtml(listing, null, "", { expanded: false, includeCompare: true });
      }).join("");
    }

    renderLoadMore();
    updateCompareBar();
    injectDeliveredCosts();
  }

  function renderLoadMore() {
    var grid = document.getElementById("listings-grid");
    if (!grid) return;
    var wrap = document.getElementById("listings-load-more-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "listings-load-more-wrap";
      wrap.style.textAlign = "center";
      wrap.style.marginTop = "var(--space-6)";
      grid.insertAdjacentElement("afterend", wrap);
    }
    if ((_allFilteredListings || []).length <= (_currentPage * LISTINGS_PAGE_SIZE)) {
      wrap.innerHTML = "";
      return;
    }
    var remaining = (_allFilteredListings || []).length - (_currentPage * LISTINGS_PAGE_SIZE);
    wrap.innerHTML = '<button type="button" id="listings-load-more" class="btn btn-secondary">Load more (' + remaining + ' remaining)</button>';
    var btn = document.getElementById("listings-load-more");
    if (btn) {
      btn.addEventListener("click", function () {
        _currentPage += 1;
        renderBrowseListings();
      });
    }
  }

  function renderListings() {
    renderBrowseListings();
  }

  function setBrowseDeliveredPlaceholder(message) {
    var els = document.querySelectorAll('[id^="dc-"]');
    Array.prototype.forEach.call(els, function (el) {
      el.classList.add('muted');
      el.textContent = message;
    });
  }

  function estimateBiocharOrderTonnage(listing) {
    var acreage = Number(state.profile && state.profile.acreage) || 0;
    var appRateSlider = document.getElementById('pref-apprate-slider');
    var applicationRate = appRateSlider ? (parseFloat(appRateSlider.value) || 0) : (Number(state.profile && state.profile.applicationRate) || 0);
    var estimatedNeed = acreage > 0 && applicationRate > 0 ? Math.round(acreage * applicationRate) : 0;
    var minOrder = Number(listing.minOrderTonnes) || 1;
    var available = Number(listing.availableTonnes) || minOrder;
    if (estimatedNeed > 0) {
      return Math.max(minOrder, Math.min(available, estimatedNeed));
    }
    return Math.max(minOrder, Math.min(available, Math.max(minOrder, 10)));
  }

  function injectDeliveredCosts() {
    if (!window.DeliveredCost) {
      setBrowseDeliveredPlaceholder('Cost unavailable');
      return;
    }
    if (!state.user) {
      setBrowseDeliveredPlaceholder('Sign in to see delivered cost');
      return;
    }
    if (!state.profile || !state.profile.zipcode) {
      setBrowseDeliveredPlaceholder('Add your ZIP in profile to see delivered cost');
      return;
    }
    var buyerZip = state.profile.zipcode;
    var appRateSlider = document.getElementById('pref-apprate-slider');
    var appRate = appRateSlider ? (parseFloat(appRateSlider.value) || 0) : (Number(state.profile.applicationRate) || 0);
    var slider = document.getElementById('pref-spread-slider');
    var spreadCost = slider ? (parseFloat(slider.value) || 0) : (Number(state.profile.spreadCostPerTonne) || 0);
    (_allFilteredListings || []).slice(0, _currentPage * LISTINGS_PAGE_SIZE).forEach(function (entry) {
      var listing = entry && entry.listing ? entry.listing : entry;
      var el = document.getElementById('dc-' + listing.id);
      if (!el) return;
      if (!listing.producerZip) {
        el.classList.add('muted');
        el.textContent = 'Cost unavailable';
        return;
      }
      var targetTonnes = Math.max(
        Number(listing.minOrderTonnes) || 1,
        Number(estimateBiocharOrderTonnage(listing)) || 1
      );
      el.classList.remove('muted');
      el.textContent = 'Calculating...';
      window.DeliveredCost.calc({
        producerZip: listing.producerZip,
        moisturePercent: listing.scorecard ? listing.scorecard.moisture : 0,
        feedstockType: listing.feedstock || 'default',
        isBiochar: true,
        buyerZip: buyerZip,
        pricePerTonne: listing.pricePerTonne,
        tonnes: targetTonnes,
        applicationRate: appRate,
        spreadCostPerTonne: spreadCost,
        availableTonnes: listing.availableTonnes
      }).then(function(result) {
        el.innerHTML = '<strong style="color:var(--color-text-primary)">~$' +
          Math.round(result.deliveredPerTonne) +
          '/t delivered</strong>' +
          (result.costPerAcre ? ' · $' + Math.round(result.costPerAcre) + '/acre applied' : '') +
          ' <span style="color:var(--color-text-muted)">(' + result.distance + ' mi · ' + targetTonnes + 't est.)</span>';
        var co2El = document.getElementById('co2cost-' + listing.id);
        if (co2El && result && result.deliveredPerTonne && listing.scorecard && listing.scorecard.carbonContent) {
          var co2PerTonne = listing.scorecard.carbonContent / 100 * 3.67;
          var costPerTCO2 = Math.round(result.deliveredPerTonne / co2PerTonne);
          co2El.textContent = '$' + costPerTCO2 + '/tCO\u2082 sequestered';
        }
      }).catch(function() {
        el.classList.add('muted');
        el.textContent = 'Cost unavailable';
        var co2El = document.getElementById('co2cost-' + listing.id);
        if (co2El) co2El.textContent = '';
      });
    });
  }

  // Re-run delivered costs when spread slider changes
  (function() {
    var slider = document.getElementById('pref-spread-slider');
    var sliderVal = document.getElementById('pref-spread-val');
    if (!slider) return;
    slider.addEventListener('input', function() {
      if (sliderVal) sliderVal.textContent = slider.value;
      injectDeliveredCosts();
    });
  })();

  (function() {
    var slider = document.getElementById('pref-apprate-slider');
    var valEl = document.getElementById('pref-apprate-val');
    if (!slider) return;
    slider.addEventListener('input', function() {
      if (valEl) valEl.textContent = slider.value;
      injectDeliveredCosts();
    });
  })();

  function initBrowseFilters() {
    makeMultiSelect(
      document.getElementById("ms-feedstock"),
      ["Almond Shell", "Walnut Shell", "Pistachio Shell", "Vine Pruning", "Wood Chip", "Forest Thinning", "Rice Husk", "Corn Stover", "Wheat Straw"],
      "All Feedstocks"
    );

    makeMultiSelect(document.getElementById("ms-cert"), ["OMRI Listed", "IBI Certified", "California Organic"], "Any Certification");

    document.getElementById("search").addEventListener("input", function () { _currentPage = 1; renderBrowseListings(); });
    document.getElementById("filter-sort").addEventListener("change", function () { _currentPage = 1; renderBrowseListings(); });
    document.getElementById("filter-availability").addEventListener("change", function () { _currentPage = 1; renderBrowseListings(); });
    var verifiedCheck = document.getElementById('filter-verified-only');
    if (verifiedCheck) verifiedCheck.addEventListener('change', function () { _currentPage = 1; renderBrowseListings(); });
    var radiusSelect = document.getElementById('filter-radius');
    if (radiusSelect) radiusSelect.addEventListener('change', function () { _currentPage = 1; renderBrowseListings(); });
    ["ms-feedstock", "ms-cert"].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener("change", function () { _currentPage = 1; renderBrowseListings(); });
    });

    var resetBtn = document.getElementById("reset-filters");
    if (resetBtn) {
      resetBtn.addEventListener("click", function() {
        document.getElementById('search').value = ''
        document.getElementById('filter-sort').value = document.getElementById('filter-sort').options[0].value
        document.getElementById('filter-availability').value = 'all'
        document.querySelectorAll('.filter-pill-group input[type=checkbox]').forEach(function (cb) { cb.checked = false })
        const allBoxes = document.querySelectorAll('.filter-pill-group input[value="All"]')
        allBoxes.forEach(function (cb) { cb.checked = true })
        var feedstockEl = document.getElementById("ms-feedstock");
        var certEl = document.getElementById("ms-cert");
        if (feedstockEl && typeof feedstockEl.setValue === "function") feedstockEl.setValue(["All"]);
        if (certEl && typeof certEl.setValue === "function") certEl.setValue(["All"]);
        _currentPage = 1;
        renderListings()
      })
    }

    renderBrowseListings();
  }

  function getProducerCoordinate(listing) {
    if (countyCoords[listing.county]) {
      return countyCoords[listing.county];
    }
    return null;
  }

  function geocodeLocation(county, stateName) {
    var key = (county || "") + "|" + (stateName || "");
    if (geoCache[key]) {
      return Promise.resolve(geoCache[key]);
    }

    var query = encodeURIComponent((county || "") + " " + (stateName || "") + " USA");
    var url = "https://nominatim.openstreetmap.org/search?format=json&q=" + query;

    return fetch(url)
      .then(function (response) {
        return response.json();
      })
      .then(function (results) {
        if (!Array.isArray(results) || !results.length) return null;
        var first = results[0];
        var coords = [Number(first.lat), Number(first.lon)];
        geoCache[key] = coords;
        return coords;
      })
      .catch(function () {
        return null;
      });
  }

  async function plotBuyerMarkers(map) {
    const buyersSnap = await db.collection('users').where('role', '==', 'buyer').get()
    buyersSnap.forEach(async function (doc) {
      const buyer = doc.data()
      if (!buyer.state) return
      const query = encodeURIComponent(buyer.zipcode ? buyer.zipcode + ' USA' : buyer.state + ' USA')
      try {
        const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + query)
        const data = await res.json()
        if (!data || !data[0]) return
        const lat = parseFloat(data[0].lat)
        const lng = parseFloat(data[0].lon)
        L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: '#B87333',
          color: '#fff',
          weight: 1,
          fillOpacity: 0.85
        }).bindPopup(
          '<strong>' + (buyer.businessName || 'Buyer') + '</strong><br>' +
          (buyer.cropTypes ? buyer.cropTypes.join(', ') : '') + '<br>' +
          (buyer.state || '') +
          (buyer.zipcode ? ' ' + buyer.zipcode : '')
        ).addTo(map)
      } catch(e) {}
    })
  }

  function initMap() {
    var mapEl = document.getElementById("buyer-map");
    if (!mapEl || typeof L === "undefined") return;

    var defaultCenter = [36.7783, -119.4179];
    var defaultZoom = 7;

    var map = L.map("buyer-map", { zoomControl: true }).setView(defaultCenter, defaultZoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 13
    }).addTo(map);

    var radiusCircle = null;
    var producerLayer = L.layerGroup().addTo(map);
    var buyerLayer = L.layerGroup().addTo(map);

    function metersFromMiles(miles) { return miles * 1609.34; }

    function plotProducers(centerLat, centerLng) {
      producerLayer.clearLayers();
      var combined = getAllListings();
      var geocodePromises = combined.map(function(listing) {
        var listingZip = listing.producerZip || listing.zipcode;
        if (!listingZip) return Promise.resolve(null);
        var cached = buyerGeo['_zip_' + listingZip];
        if (cached && cached.lat) return Promise.resolve({ listing: listing, coords: cached });
        return geocodeBuyerZip(listingZip).then(function(c) {
          buyerGeo['_zip_' + listingZip] = c;
          return c ? { listing: listing, coords: c } : null;
        }).catch(function() { return null; });
      });
      Promise.all(geocodePromises).then(function(results) {
        results.filter(Boolean).forEach(function(item) {
          var l = item.listing;
          var c = item.coords;
          if (centerLat && centerLng) {
            var dist = haversineB(centerLat, centerLng, c.lat, c.lng);
            if (dist > 250) return;
          }
          L.circleMarker([c.lat, c.lng], {
            radius: 10,
            color: '#fff',
            fillColor: '#3D6B45',
            fillOpacity: 0.9,
            weight: 2
          }).bindPopup(
            '<strong>' + htmlEscape(l.producerName) + '</strong><br>' +
            htmlEscape(l.feedstock) + ' · $' + htmlEscape(l.pricePerTonne) + '/t<br>' +
            htmlEscape(l.availableTonnes) + 't available<br>' +
            '<a href="listing.html?id=' + encodeURIComponent(l.id) + '" style="color:#3D6B45;font-weight:600">View listing →</a>'
          ).addTo(producerLayer);
        });
      });
    }

    function plotBuyerLocation(lat, lng, name) {
      buyerLayer.clearLayers();
      L.circleMarker([lat, lng], {
        radius: 10,
        color: '#fff',
        fillColor: '#B87333',
        fillOpacity: 0.9,
        weight: 2
      }).bindPopup('<strong>Your location</strong><br>' + (name || '')).addTo(buyerLayer);
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
        '<div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:#3D6B45;display:inline-block"></span> Biochar producer</div>' +
        '<div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:#B87333;display:inline-block"></span> Your location</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:4px">Dashed circle = 250 mi radius</div>';
      return div;
    };
    legendControl.addTo(map);

    plotProducers(null, null);

    function centerMapOnUser() {
      var profile = state.profile || (window.AuthState && window.AuthState.profile) || null;
      var zip = profile && profile.zipcode ? profile.zipcode : null;
      if (!zip) return;
      geocodeBuyerZip(zip).then(function(c) {
        if (!c) return;
        buyerGeo.lat = c.lat;
        buyerGeo.lng = c.lng;
        plotBuyerLocation(c.lat, c.lng, (profile && profile.businessName) || '');
        plotProducers(c.lat, c.lng);
      });
    }

    window._centerMapOnUser = centerMapOnUser;
    centerMapOnUser();

    db.collection('listings').where('status', '==', 'active').onSnapshot(function(snap) {
      window._firestoreListings = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d.id = doc.id;
        window._firestoreListings.push(d);
      });
      _usingDemoFallback = false;
      renderBrowseListings();
      plotProducers(buyerGeo.lat, buyerGeo.lng);
    }, function() {
      if (getAllListings().length) {
        _usingDemoFallback = true;
        if (window.UIUtils) UIUtils.toast('Live listings unavailable. Showing demo listings.', 'warning', 2800);
        plotProducers(buyerGeo.lat, buyerGeo.lng);
        return;
      }
      if (window.UIUtils) UIUtils.showError("buyer-map", "Could not load listing map.", function () { window.location.reload(); });
    });
  }

  function initAuthState() {
    if (!document.body.dataset.cardClickDelegationBoundBuyer) {
      document.addEventListener("click", function (event) {

        if (event.target.classList.contains("buynow-quick-btn")) {
          event.preventDefault();
          event.stopPropagation();
          var quickId = event.target.dataset.id;
          if (quickId) {
            handleCardBuyNow(quickId);
          }
          return;
        }

        var buyToggle = event.target.closest(".buy-now-toggle-btn");
        if (buyToggle) {
          event.preventDefault();
          event.stopPropagation();
          var listingId = buyToggle.getAttribute("data-id");
          var inline = document.getElementById("buy-inline-" + listingId);
          if (!inline) return;
          inline.style.display = inline.style.display === "none" || inline.style.display === "" ? "flex" : "none";
          return;
        }

        var buyConfirm = event.target.closest(".buy-now-confirm-btn");
        if (buyConfirm) {
          event.preventDefault();
          event.stopPropagation();
          var id = buyConfirm.getAttribute("data-id");
          if (!id) return;
          handleCardBuyNow(id);
        }
      });
      document.body.dataset.cardClickDelegationBoundBuyer = "true";
    }

    auth.onAuthStateChanged(function (user) {
      if (!user) {
        state.user = null;
        state.profile = null;
        updateTopNav();
        renderHeroSlot();
        renderTopMatchesBlock();
        return;
      }

      state.user = user;
      db.collection("users")
        .doc(user.uid)
        .get()
        .then(function (doc) {
          state.profile = doc.exists ? doc.data() : null;
          if (state.profile && state.profile.role === 'seller') showProducerBanner();
          updateTopNav();
          renderHeroSlot();
          renderTopMatchesBlock();
          if (typeof window._centerMapOnUser === 'function') window._centerMapOnUser();
          // Set slider and display from saved profile prefs
          var slider = document.getElementById('pref-spread-slider');
          var sliderVal = document.getElementById('pref-spread-val');
          var appRateDisplay = document.getElementById('pref-apprate-display');
          if (slider && state.profile) {
            var savedSpread = state.profile.spreadCostPerTonne || 60;
            slider.value = savedSpread;
            if (sliderVal) sliderVal.textContent = savedSpread;
          }
          if (appRateDisplay && state.profile) {
            var ar = state.profile.applicationRate || 7;
            var appRateSlider = document.getElementById('pref-apprate-slider');
            var appRateValEl = document.getElementById('pref-apprate-val');
            if (appRateSlider) {
              appRateSlider.value = ar;
              if (appRateValEl) appRateValEl.textContent = ar;
            }
            if (appRateDisplay) appRateDisplay.textContent = '';
          }
          if (state.profile && state.profile.zipcode) {
            var radiusSelect = document.getElementById('filter-radius');
            if (radiusSelect && radiusSelect.value === '0') radiusSelect.value = '100';
            geocodeBuyerZip(state.profile.zipcode).then(function(c) {
              buyerGeo.lat = c.lat;
              buyerGeo.lng = c.lng;
              renderBrowseListings();
            }).catch(function() {});
          }
          injectDeliveredCosts();
        })
        .catch(function () {
          state.profile = null;
          updateTopNav();
          renderHeroSlot();
          renderTopMatchesBlock();
        });
    });
  }

  function showProducerBanner() {
    var banner = document.getElementById('producer-cta-banner');
    if (banner) banner.classList.remove('hidden');
  }

  var buyerGeo = { lat: null, lng: null };

  function haversineB(lat1, lng1, lat2, lng2) {
    var R = 3958.8;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
            Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function geocodeBuyerZip(zip) {
    var zipGeoCache = window._zipGeoCache || (window._zipGeoCache = {});
    if (zipGeoCache[zip]) return zipGeoCache[zip];
    var p = fetch('https://api.zippopotam.us/us/' + zip)
      .then(function(r) { if (!r.ok) throw new Error('bad zip'); return r.json(); })
      .then(function(d) { return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; });
    zipGeoCache[zip] = p.catch(function(err) { delete zipGeoCache[zip]; throw err; });
    return zipGeoCache[zip];
  }

  function bindDistanceFilter() {
    var radiusSelect = document.getElementById('filter-radius');
    if (!radiusSelect) return;
    radiusSelect.addEventListener('change', function() {
      if (buyerGeo.lat) renderBrowseListings();
    });
  }

  function init() {
    var isBuyerPage = !!document.getElementById('listings-grid');
    if (!isBuyerPage) {
      initMap();
      return;
    }
    if (window.UIUtils) UIUtils.showLoading("listings-grid", "Loading listings...");
    initAuthState();
    initBrowseFilters();
    bindDistanceFilter();
    getAllListings().forEach(function(l) {
      if (l.producerZip && buyerGeo['_zip_' + l.producerZip] === undefined) {
        buyerGeo['_zip_' + l.producerZip] = null;
        geocodeBuyerZip(l.producerZip).then(function(c) {
          buyerGeo['_zip_' + l.producerZip] = c;
        }).catch(function() {});
      }
    });
    renderBrowseListings();
    initMap();
    var logoutBtn = document.getElementById("nav-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        auth.signOut().then(function () {
          window.location.href = "index.html";
        });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
