(function () {
  var compareList = [];
  var state = {
    user: null,
    profile: null
  };

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
        return (window.LISTINGS || []).find(function (listing) {
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
      '<button onclick="document.getElementById(\'comparison-view\').style.display=\'none\'" style="background:none;border:none;font-size:24px;cursor:pointer">×</button>' +
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

  function getStateRegionBucket(stateName) {
    if (!stateName) return "";
    var buckets = {
      california: ["California"],
      pacific_northwest: ["Washington", "Oregon", "Idaho"],
      great_plains: ["Montana", "Wyoming", "Colorado", "New Mexico", "North Dakota", "South Dakota", "Nebraska", "Kansas", "Oklahoma", "Texas"],
      southeast: ["Florida", "Georgia", "South Carolina", "North Carolina", "Virginia", "West Virginia", "Kentucky", "Tennessee", "Alabama", "Mississippi", "Arkansas", "Louisiana"],
      northeast: ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania", "Delaware", "Maryland"],
      midwest: ["Ohio", "Michigan", "Indiana", "Illinois", "Wisconsin", "Minnesota", "Iowa", "Missouri"]
    };

    return (
      Object.keys(buckets).find(function (bucketKey) {
        return buckets[bucketKey].indexOf(stateName) !== -1;
      }) || ""
    );
  }

  function getListingRegionBucket(regionName) {
    var regionBuckets = {
      california: ["Sacramento Valley", "San Joaquin Valley", "North Coast", "Central Coast", "Sierra Foothills"],
      pacific_northwest: ["Pacific Northwest"],
      great_plains: ["Great Plains"],
      southeast: ["Southeast"],
      northeast: ["Northeast"],
      midwest: ["Midwest"]
    };

    return (
      Object.keys(regionBuckets).find(function (bucketKey) {
        return regionBuckets[bucketKey].indexOf(regionName) !== -1;
      }) || ""
    );
  }

  function isBroadRegionMatch(stateName, listingRegion) {
    var stateBucket = getStateRegionBucket(stateName);
    var listingBucket = getListingRegionBucket(listingRegion);
    return stateBucket && listingBucket && stateBucket === listingBucket;
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

  function scoreListingForInputs(listing, profileLike) {
    var score = 0;
    var reasons = [];

    var crops = Array.isArray(profileLike.cropTypes) ? profileLike.cropTypes : [];
    var cropMatches = crops.filter(function (crop) {
      return listing.suitableFor.indexOf(crop) !== -1;
    });
    if (cropMatches.length) {
      score += 30;
      reasons.push("suitable for " + cropMatches[0].toLowerCase());
    }

    var soilPh = profileLike.soilPH || "";
    if (soilPh === "Below 5.5" && listing.scorecard.pH > 7.0) {
      score += 20;
      reasons.push("alkaline profile aligns with low-pH soil");
    } else if (soilPh === "5.5–6.5" && listing.scorecard.pH >= 6.5 && listing.scorecard.pH <= 8.0) {
      score += 20;
      reasons.push("pH compatibility in your target range");
    } else if (soilPh === "Above 8.5" && listing.scorecard.pH < 7.5) {
      score += 10;
      reasons.push("more neutral pH for high-alkaline soils");
    } else {
      score += 10;
    }

    if (listing.availableTonnes >= 10) {
      score += 15;
      reasons.push("available in sufficient volume");
    }

    if (listing.scorecard.carbonContent >= 70) {
      score += 10;
      reasons.push("high carbon content (" + listing.scorecard.carbonContent.toFixed(1) + "%)");
    } else if (listing.scorecard.carbonContent >= 60) {
      score += 5;
      reasons.push("solid carbon content (" + listing.scorecard.carbonContent.toFixed(1) + "%)");
    }

    if (listing.scorecard.labVerified) {
      score += 10;
      reasons.push("lab-verified");
    }

    var organicFlag = String(profileLike.organicCertified || "").toLowerCase();
    if (
      (organicFlag === "yes" || organicFlag === "true") &&
      (listing.certifications.indexOf("OMRI Listed") !== -1 || listing.certifications.indexOf("California Organic") !== -1)
    ) {
      score += 15;
      reasons.push("organic-compatible certification");
    }

    score += 10;

    if (isBroadRegionMatch(profileLike.state || "", listing.region)) {
      reasons.push("regional proximity advantage");
    }

    var normalized = Math.min(score, 100);
    return { listing: listing, score: normalized, explanation: buildExplanation(normalized, reasons) };
  }

  function listingCardHtml(listing, extraScore, explanation, options) {
    options = options || {};

    var visibleSuitable = listing.suitableFor.slice(0, 3);
    var suitableTags = visibleSuitable
      .map(function (item) {
        return '<span class="suitable-tag">' + htmlEscape(item) + "</span>";
      })
      .join("");

    var hiddenCount = Math.max(0, listing.suitableFor.length - 3);
    if (hiddenCount > 0) {
      suitableTags += '<span class="suitable-more">+' + hiddenCount + " more</span>";
    }

    var ratingText = listing.averageRating == null ? "No rating yet" : listing.averageRating.toFixed(1);
    var stars = renderStars(listing.averageRating);
    var lead = getLeadTimeDisplay(listing.leadTimeDays);
    var verifiedBadge = listing.verified === true && typeof window.renderVerifiedBadge === "function"
      ? window.renderVerifiedBadge()
      : "";
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

      '<div style="width:100%;height:160px;background:linear-gradient(135deg,var(--color-accent-light),var(--color-border));display:flex;align-items:center;justify-content:center;font-size:3rem;border-radius:var(--radius-lg) var(--radius-lg) 0 0;flex-shrink:0">' +
      (listing.feedstock && listing.feedstock.toLowerCase().indexOf('almond') !== -1 ? '🌰' :
       listing.feedstock && listing.feedstock.toLowerCase().indexOf('rice') !== -1 ? '🌾' :
       listing.feedstock && listing.feedstock.toLowerCase().indexOf('wood') !== -1 ? '🪵' :
       listing.feedstock && listing.feedstock.toLowerCase().indexOf('forest') !== -1 ? '🌲' :
       listing.feedstock && listing.feedstock.toLowerCase().indexOf('walnut') !== -1 ? '🌰' :
       listing.feedstock && listing.feedstock.toLowerCase().indexOf('corn') !== -1 ? '🌽' : '⚗️') +
      '</div>' +

      '<div style="padding:var(--space-5);display:flex;flex-direction:column;flex:1;gap:var(--space-3)">' +

      '<div>' +
      '<span class="feedstock-tag">' + htmlEscape(listing.feedstock) + '</span>' +
      '<h3 style="margin:var(--space-2) 0 0;font-size:var(--font-size-lg)">' + htmlEscape(listing.producerName) + (verifiedBadge ? ' ' + verifiedBadge : '') + '</h3>' +
      '<div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:2px">' + htmlEscape(listing.county || listing.region || listing.state || '') + '</div>' +
      '</div>' +

      '<div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:var(--space-2)">' +
      '<div><span style="font-size:var(--font-size-2xl);font-weight:700;color:var(--color-text-primary)">$' + htmlEscape(listing.pricePerTonne) + '</span><span style="font-size:var(--font-size-sm);color:var(--color-text-muted)">/tonne</span></div>' +
      '<div class="delivered-cost-inline" id="dc-' + htmlEscape(listing.id) + '" style="font-size:var(--font-size-sm);color:var(--color-accent);font-weight:600;text-align:right"></div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-2)">' +
      '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)"><div style="font-size:0.65rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600">Carbon</div><div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-text-primary);margin-top:2px">' + htmlEscape(listing.scorecard.carbonContent) + '%</div></div>' +
      '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)"><div style="font-size:0.65rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600">Ash</div><div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-text-primary);margin-top:2px">' + htmlEscape(listing.scorecard.ashContent) + '%</div></div>' +
      '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)"><div style="font-size:0.65rem;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.04em;font-weight:600">EC</div><div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-text-primary);margin-top:2px">' + htmlEscape(listing.scorecard.electricalConductivity) + ' dS/m</div></div>' +
      '</div>' +

      '<div style="display:flex;align-items:center;justify-content:space-between;font-size:var(--font-size-xs);color:var(--color-text-muted)">' +
      '<span>' + htmlEscape(listing.transactionsCompleted) + ' transactions · ' + htmlEscape(ratingText) + (stars ? ' ' + htmlEscape(stars) : '') + '</span>' +
      '<span style="color:' + (listing.certifications && listing.certifications.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)') + ';font-weight:500">' + (listing.certifications && listing.certifications.length > 0 ? '✓ Certified' : 'Not certified') + '</span>' +
      '</div>' +

      (typeof extraScore === 'number'
        ? '<div><div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:4px"><span>Match</span><span>' + htmlEscape(extraScore) + '%</span></div><div class="match-score-bar"><div class="match-score-fill" style="width:' + htmlEscape(extraScore) + '%"></div></div></div>'
        : '') +

      '<div style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-top:auto">' +
      '<span class="btn btn-primary" style="flex:1;text-align:center">Make an offer</span>' +
      '<button class="btn btn-secondary buy-now-toggle-btn" type="button" data-id="' + htmlEscape(listing.id) + '">Buy now</button>' +
      '</div>' +
      '<div class="buy-now-inline" id="buy-inline-' + htmlEscape(listing.id) + '" style="margin-top:var(--space-2);display:none;gap:var(--space-2)">' +
      '<input type="number" min="' + htmlEscape(listing.minOrderTonnes) + '" value="' + htmlEscape(autoVolume) + '" style="max-width:130px" />' +
      '<button class="btn btn-primary buy-now-confirm-btn" type="button" data-id="' + htmlEscape(listing.id) + '">Confirm</button>' +
      '</div>' +

      '</div>' +
      '</a>' +
      '</div>'
    );
  }

  async function handleCardBuyNow(listingId) {
    var listing = (window.LISTINGS || []).find(function (item) {
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
    var block = document.getElementById("top-matches-block");
    var grid = document.getElementById("matched-grid");
    if (!block || !grid) return;

    var hasSavedCrops =
      !!state.user &&
      state.profile &&
      Array.isArray(state.profile.cropTypes) &&
      state.profile.cropTypes.length > 0;

    if (!state.user) {
      block.classList.add("hidden");
      grid.innerHTML = "";
      return;
    }

    block.classList.remove("hidden");
    var ranked = (window.LISTINGS || [])
      .map(function (listing) {
        return scoreListingForInputs(listing, state.profile);
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 6);

    grid.innerHTML = ranked
      .map(function (item) {
        return listingCardHtml(item.listing, item.score, item.explanation, { expanded: true, includeCompare: true });
      })
      .join("");
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
    var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS.slice() : [];
    var search = (document.getElementById("search").value || "").trim().toLowerCase();
    var feedstock = getMultiSelectValues("ms-feedstock");
    var region = getMultiSelectValues("ms-region");
    var cert = getMultiSelectValues("ms-cert");
    var stateValue = (document.getElementById("filter-state") ? document.getElementById("filter-state").value : "").trim();
    var sort = document.getElementById("filter-sort").value;

    var radiusEl = document.getElementById('filter-radius');
    var radiusMiles = radiusEl ? Number(radiusEl.value) : 0;

    var filtered = listings.filter(function (listing) {
      var matchesSearch =
        !search ||
        listing.producerName.toLowerCase().indexOf(search) !== -1 ||
        listing.county.toLowerCase().indexOf(search) !== -1;

      var feedstockActive = feedstock.length && feedstock.indexOf("All") === -1;
      var regionActive = region.length && region.indexOf("All") === -1;
      var certActive = cert.length && cert.indexOf("All") === -1;
      var stateActive = !!stateValue && stateValue !== "All States";

      var matchesFeedstock = !feedstockActive || feedstock.indexOf(listing.feedstock) !== -1;
      var matchesRegion = !regionActive || region.indexOf(listing.region) !== -1;
      var matchesCert =
        !certActive ||
        listing.certifications.some(function (item) {
          return cert.indexOf(item) !== -1;
        });
      var listingState = String(listing.state || "").toLowerCase();
      var listingRegion = String(listing.region || "").toLowerCase();
      var stateNeedle = stateValue.toLowerCase();
      var matchesState =
        !stateActive ||
        listingState.indexOf(stateNeedle) !== -1 ||
        listingRegion.indexOf(stateNeedle) !== -1;

      if (radiusMiles > 0 && buyerGeo.lat && listing.producerZip) {
        var cached = buyerGeo['_zip_' + listing.producerZip];
        if (cached === undefined) return true;
        if (cached === null) return true;
        var dist = haversineB(buyerGeo.lat, buyerGeo.lng, cached.lat, cached.lng);
        if (dist > radiusMiles) return false;
      }

      return matchesSearch && matchesFeedstock && matchesRegion && matchesCert && matchesState;
    });

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
    if (!filtered.length) {
      grid.innerHTML = '<p class="no-results">No listings match your current filters.</p>';
      updateCompareBar();
      return;
    }

    grid.innerHTML = filtered.map(function (listing) { return listingCardHtml(listing, null, "", { expanded: false, includeCompare: true }); }).join("");
    updateCompareBar();

  }

  function renderListings() {
    renderBrowseListings();
  }

  function injectDeliveredCosts() {
    if (!state.profile || !state.profile.zipcode) return;
    var buyerZip = state.profile.zipcode;
    var appRateSlider = document.getElementById('pref-apprate-slider');
    var appRate = appRateSlider ? (parseFloat(appRateSlider.value) || 7) : (state.profile.applicationRate || 7);
    var slider = document.getElementById('pref-spread-slider');
    var spreadCost = slider ? (parseFloat(slider.value) || 60) : (state.profile.spreadCostPerTonne || 60);
    (window.LISTINGS || []).forEach(function(listing) {
      var el = document.getElementById('dc-' + listing.id);
      if (!el || !listing.producerZip) return;
      el.textContent = 'Calculating...';
      window.DeliveredCost.calc({
        producerZip: listing.producerZip,
        buyerZip: buyerZip,
        pricePerTonne: listing.pricePerTonne,
        tonnes: listing.minOrderTonnes,
        applicationRate: appRate,
        spreadCostPerTonne: spreadCost
      }).then(function(result) {
        el.innerHTML = '<strong style="color:var(--color-text-primary)">~$' +
          Math.round(result.deliveredPerTonne) +
          '/t delivered</strong>' +
          (result.costPerAcre ? ' · $' + Math.round(result.costPerAcre) + '/acre' : '') +
          ' <span style="color:var(--color-text-muted)">(' + result.distance + ' mi)</span>';
      }).catch(function() {
        el.textContent = '';
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

    makeMultiSelect(
      document.getElementById("ms-region"),
      ["Sacramento Valley", "San Joaquin Valley", "North Coast", "Central Coast", "Sierra Foothills", "Pacific Northwest", "Great Plains", "Southeast", "Northeast", "Midwest"],
      "All Regions"
    );

    makeMultiSelect(document.getElementById("ms-cert"), ["OMRI Listed", "IBI Certified", "California Organic"], "Any Certification");

    document.getElementById("search").addEventListener("input", renderBrowseListings);
    document.getElementById("filter-sort").addEventListener("change", renderBrowseListings);
    var stateSelect = document.getElementById("filter-state");
    if (stateSelect) {
      stateSelect.addEventListener("change", renderBrowseListings);
    }
    ["ms-feedstock", "ms-region", "ms-cert"].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener("change", renderBrowseListings);
    });

    var resetBtn = document.getElementById("reset-filters");
    if (resetBtn) {
      resetBtn.addEventListener("click", function() {
        document.getElementById('search').value = ''
        document.getElementById('filter-sort').value = document.getElementById('filter-sort').options[0].value
        document.querySelectorAll('.filter-pill-group input[type=checkbox]').forEach(function (cb) { cb.checked = false })
        const allBoxes = document.querySelectorAll('.filter-pill-group input[value="All"]')
        allBoxes.forEach(function (cb) { cb.checked = true })
        var feedstockEl = document.getElementById("ms-feedstock");
        var regionEl = document.getElementById("ms-region");
        var certEl = document.getElementById("ms-cert");
        if (feedstockEl && typeof feedstockEl.setValue === "function") feedstockEl.setValue(["All"]);
        if (regionEl && typeof regionEl.setValue === "function") regionEl.setValue(["All"]);
        if (certEl && typeof certEl.setValue === "function") certEl.setValue(["All"]);
        var stateFilter = document.getElementById("filter-state");
        if (stateFilter) stateFilter.value = "";
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

    var map = L.map("buyer-map").setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    (window.LISTINGS || []).forEach(function (listing) {
      var coords = getProducerCoordinate(listing);
      if (!coords) return;

      L.circleMarker(coords, {
        radius: 10,
        color: "#3D6B45",
        fillColor: "#3D6B45",
        fillOpacity: 0.95,
        weight: 2
      })
        .addTo(map)
        .bindPopup(
          "<strong>Producer Name:</strong> " + htmlEscape(listing.producerName) + "<br>" +
          "<strong>Feedstock:</strong> " + htmlEscape(listing.feedstock) + "<br>" +
          "<strong>Available Tonnes:</strong> " + htmlEscape(listing.availableTonnes) + "<br>" +
          "<strong>Price Per Tonne:</strong> $" + htmlEscape(listing.pricePerTonne) + "<br>" +
          "<strong>Transactions Completed:</strong> " + htmlEscape(listing.transactionsCompleted)
        );
    });

    plotBuyerMarkers(map).catch(function () {
      return null;
    });

    var legend = L.control({ position: "bottomleft" });
    legend.onAdd = function () {
      var div = L.DomUtil.create("div", "map-legend");
      div.innerHTML =
        '<div class="legend-item"><span class="legend-dot" style="background:#3D6B45;"></span> Producer</div>' +
        '<div class="legend-item"><span class="legend-dot" style="background:#B87333;"></span> Buyer</div>';
      return div;
    };
    legend.addTo(map);
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
    return fetch('https://api.zippopotam.us/us/' + zip)
      .then(function(r) { if (!r.ok) throw new Error('bad zip'); return r.json(); })
      .then(function(d) { return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; });
  }

  function bindDistanceFilter() {
    var zipInput = document.getElementById('filter-buyer-zip');
    var radiusSelect = document.getElementById('filter-radius');
    var statusEl = document.getElementById('buyer-zip-status');
    if (!zipInput || !radiusSelect) return;

    zipInput.addEventListener('change', function() {
      var z = this.value.trim();
      if (z.length !== 5) return;
      geocodeBuyerZip(z).then(function(c) {
        buyerGeo.lat = c.lat;
        buyerGeo.lng = c.lng;
        if (statusEl) { statusEl.textContent = '✓'; statusEl.style.color = 'var(--color-accent)'; }
        renderBrowseListings();
      }).catch(function() {
        if (statusEl) { statusEl.textContent = '✗'; statusEl.style.color = 'red'; }
      });
    });

    radiusSelect.addEventListener('change', function() {
      if (buyerGeo.lat) renderBrowseListings();
    });
  }

  function init() {
    initAuthState();
    initBrowseFilters();
    bindDistanceFilter();
    (window.LISTINGS || []).forEach(function(l) {
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
