(function () {
  var state = {
    user: null,
    profile: null,
    compareList: []
  };

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

  function listingCardHtml(listing, extraScore, explanation) {
    var certBadges = listing.certifications
      .map(function (cert) {
        return '<span class="cert-badge">' + htmlEscape(cert) + "</span>";
      })
      .join("");

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

    return (
      '<article class="listing-card" id="listing-' +
      htmlEscape(listing.id) +
      '" style="position:relative;">' +
      '<div style="position:absolute;top:12px;right:12px;">' +
      '<label style="display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-sm);color:var(--color-text-secondary);">' +
      '<input class="compare-check" type="checkbox" data-id="' +
      htmlEscape(listing.id) +
      '"' +
      (state.compareList.indexOf(listing.id) !== -1 ? " checked" : "") +
      " />+ Compare</label></div>" +
      "<h3>" +
      htmlEscape(listing.producerName) +
      (verifiedBadge ? '<span style="margin-left:var(--space-2);vertical-align:middle;">' + verifiedBadge + "</span>" : "") +
      "</h3>" +
      '<p class="listing-meta">' +
      htmlEscape(listing.county) +
      " County · " +
      htmlEscape(listing.region) +
      "</p>" +
      '<span class="feedstock-tag">' +
      htmlEscape(listing.feedstock) +
      "</span>" +
      '<div class="price-row"><span class="price-value">$' +
      htmlEscape(listing.pricePerTonne) +
      '</span><span class="price-unit">/tonne</span></div>' +
      '<p class="card-detail">Available: ' +
      htmlEscape(listing.availableTonnes) +
      " tonnes</p>" +
      '<p class="card-detail">Availability: ' +
      htmlEscape(formatDateRange(listing.availableFrom, listing.availableUntil)) +
      "</p>" +
      '<p class="card-detail">Min order: ' +
      htmlEscape(listing.minOrderTonnes) +
      " tonnes</p>" +
      '<p class="card-detail ' +
      lead.className +
      '">' +
      htmlEscape(lead.text) +
      "</p>" +
      '<div class="scorecard-inline">' +
      '<span class="scorecard-badge">' +
      htmlEscape(listing.scorecard.carbonContent.toFixed(1)) +
      "% C</span>" +
      '<span class="scorecard-badge">pH ' +
      htmlEscape(listing.scorecard.pH.toFixed(1)) +
      "</span>" +
      '<span class="scorecard-badge">' +
      htmlEscape(listing.scorecard.surfaceArea) +
      " m²/g</span>" +
      "</div>" +
      '<a class="scorecard-toggle" href="#" data-action="expand-scorecard">Full scorecard ↓</a>' +
      '<div class="scorecard-expanded">' +
      '<div class="scorecard-row"><span class="field-name">Carbon Content</span><span class="field-value">' +
      htmlEscape(listing.scorecard.carbonContent.toFixed(1)) +
      "%</span></div>" +
      '<div class="scorecard-row"><span class="field-name">pH</span><span class="field-value">' +
      htmlEscape(listing.scorecard.pH.toFixed(1)) +
      "</span></div>" +
      '<div class="scorecard-row"><span class="field-name">Surface Area</span><span class="field-value">' +
      htmlEscape(listing.scorecard.surfaceArea) +
      " m²/g</span></div>" +
      '<div class="scorecard-row"><span class="field-name">Particle Size</span><span class="field-value">' +
      htmlEscape(listing.scorecard.particleSize) +
      "</span></div>" +
      '<div class="scorecard-row"><span class="field-name">Moisture</span><span class="field-value">' +
      htmlEscape(listing.scorecard.moisture.toFixed(1)) +
      "%</span></div>" +
      '<div class="scorecard-row"><span class="field-name">Ash Content</span><span class="field-value">' +
      htmlEscape(listing.scorecard.ashContent.toFixed(1)) +
      "%</span></div>" +
      '<div class="scorecard-row"><span class="field-name">Electrical Conductivity</span><span class="field-value">' +
      htmlEscape(listing.scorecard.electricalConductivity.toFixed(1)) +
      " dS/m</span></div>" +
      '<a class="scorecard-hide" href="#" data-action="collapse-scorecard">Hide ↑</a>' +
      "</div>" +
      '<div class="badge-row">' +
      certBadges +
      "</div>" +
      '<div class="suitable-row">' +
      suitableTags +
      "</div>" +
      '<div class="rating-row"><span>' +
      htmlEscape(listing.transactionsCompleted) +
      " transactions</span><span>·</span><span>" +
      htmlEscape(ratingText) +
      "</span>" +
      (stars ? '<span class="star-rating">' + htmlEscape(stars) + "</span>" : "") +
      "</div>" +
      (typeof extraScore === "number"
        ? '<p class="card-detail" style="margin-top:var(--space-2);">Match score: ' + htmlEscape(extraScore) + '%</p>' +
          '<div class="match-score-bar"><div class="match-score-fill" style="width:' + htmlEscape(extraScore) + '%"></div></div>' +
          '<p class="card-detail" style="margin-top:var(--space-2);">' + htmlEscape(explanation || "") + "</p>"
        : "") +
      '<div class="listing-actions" style="display:flex;gap:var(--space-2);flex-wrap:wrap;">' +
      '<a class="btn btn-primary" href="listing.html?id=' +
      encodeURIComponent(listing.id) +
      '">Make an offer</a>' +
      '<button class="btn btn-secondary buy-now-card-btn" type="button" data-id="' +
      htmlEscape(listing.id) +
      '">Buy now</button></div>' +
      "</article>"
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

    if (!hasSavedCrops) {
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
        return listingCardHtml(item.listing, item.score, item.explanation);
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

    if (!login || !profile) return;

    if (state.user) {
      login.classList.add("hidden");
      profile.classList.remove("hidden");
    } else {
      login.classList.remove("hidden");
      profile.classList.add("hidden");
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
    var sort = document.getElementById("filter-sort").value;

    var filtered = listings.filter(function (listing) {
      var matchesSearch =
        !search ||
        listing.producerName.toLowerCase().indexOf(search) !== -1 ||
        listing.county.toLowerCase().indexOf(search) !== -1;

      var feedstockActive = feedstock.length && feedstock.indexOf("All") === -1;
      var regionActive = region.length && region.indexOf("All") === -1;
      var certActive = cert.length && cert.indexOf("All") === -1;

      var matchesFeedstock = !feedstockActive || feedstock.indexOf(listing.feedstock) !== -1;
      var matchesRegion = !regionActive || region.indexOf(listing.region) !== -1;
      var matchesCert =
        !certActive ||
        listing.certifications.some(function (item) {
          return cert.indexOf(item) !== -1;
        });

      return matchesSearch && matchesFeedstock && matchesRegion && matchesCert;
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

  function updateCompareBar() {
    var bar = document.getElementById("compare-bar");
    var count = document.getElementById("compare-count");
    if (!bar || !count) return;
    count.textContent = state.compareList.length + " listings selected";
    bar.style.display = state.compareList.length >= 2 ? "flex" : "none";
  }

  function showMaxCompareTooltip(checkbox) {
    var label = checkbox.parentElement;
    if (!label) return;
    var existing = label.querySelector(".compare-tooltip");
    if (existing) existing.remove();

    var tip = document.createElement("span");
    tip.className = "compare-tooltip";
    tip.textContent = "Maximum 3";
    tip.style.marginLeft = "6px";
    tip.style.color = "var(--color-warning)";
    tip.style.fontSize = "var(--font-size-xs)";
    label.appendChild(tip);

    setTimeout(function () {
      if (tip.parentNode) tip.parentNode.removeChild(tip);
    }, 2000);
  }

  function getComparisonNumber(listing, key) {
    if (key === "pricePerTonne") return listing.pricePerTonne;
    if (key === "availableTonnes") return listing.availableTonnes;
    if (key === "minOrderTonnes") return listing.minOrderTonnes;
    if (key === "carbonContent") return listing.scorecard.carbonContent;
    if (key === "pH") return listing.scorecard.pH;
    if (key === "surfaceArea") return listing.scorecard.surfaceArea;
    if (key === "moisture") return listing.scorecard.moisture;
    if (key === "ashContent") return listing.scorecard.ashContent;
    if (key === "electricalConductivity") return listing.scorecard.electricalConductivity;
    if (key === "transactionsCompleted") return listing.transactionsCompleted;
    if (key === "averageRating") return listing.averageRating;
    return null;
  }

  function renderComparisonView(selectedListings) {
    var container = document.getElementById("comparison-view");
    if (!container) return;

    var rowDefs = [
      { key: "producerName", label: "Producer Name", display: function (l) { return l.producerName; } },
      { key: "county", label: "County", display: function (l) { return l.county; } },
      { key: "feedstock", label: "Feedstock", display: function (l) { return l.feedstock; } },
      { key: "pricePerTonne", label: "Price Per Tonne", display: function (l) { return "$" + l.pricePerTonne; } },
      { key: "availableTonnes", label: "Available Tonnes", display: function (l) { return l.availableTonnes; } },
      { key: "minOrderTonnes", label: "Min Order Tonnes", display: function (l) { return l.minOrderTonnes; } },
      { key: "availability", label: "Availability", display: function (l) { return formatDateRange(l.availableFrom, l.availableUntil); } },
      { key: "carbonContent", label: "Carbon Content", display: function (l) { return l.scorecard.carbonContent.toFixed(1) + "%"; } },
      { key: "pH", label: "pH", display: function (l) { return l.scorecard.pH.toFixed(1); } },
      { key: "surfaceArea", label: "Surface Area", display: function (l) { return l.scorecard.surfaceArea + " m²/g"; } },
      { key: "particleSize", label: "Particle Size", display: function (l) { return l.scorecard.particleSize; } },
      { key: "moisture", label: "Moisture", display: function (l) { return l.scorecard.moisture.toFixed(1) + "%"; } },
      { key: "ashContent", label: "Ash Content", display: function (l) { return l.scorecard.ashContent.toFixed(1) + "%"; } },
      { key: "electricalConductivity", label: "Electrical Conductivity", display: function (l) { return l.scorecard.electricalConductivity.toFixed(1) + " dS/m"; } },
      { key: "labVerified", label: "Lab Verified", display: function (l) { return l.scorecard.labVerified ? "Yes" : "No"; } },
      { key: "certifications", label: "Certifications", display: function (l) { return l.certifications.join(", "); } },
      { key: "suitableFor", label: "Suitable For", display: function (l) { return l.suitableFor.join(", "); } },
      { key: "transactionsCompleted", label: "Transactions Completed", display: function (l) { return l.transactionsCompleted; } },
      { key: "averageRating", label: "Rating", display: function (l) { return l.averageRating == null ? "N/A" : l.averageRating.toFixed(1); } }
    ];

    var higherBetter = {
      carbonContent: true,
      surfaceArea: true,
      availableTonnes: true,
      transactionsCompleted: true,
      averageRating: true
    };

    var lowerBetter = {
      pricePerTonne: true,
      moisture: true,
      ashContent: true
    };

    var headCells = selectedListings
      .map(function (listing) {
        return "<th>" + htmlEscape(listing.producerName) + "</th>";
      })
      .join("");

    var rowsHtml = rowDefs
      .map(function (row) {
        var values = selectedListings.map(function (listing) {
          return row.display(listing);
        });

        var bestValue = null;
        if (higherBetter[row.key] || lowerBetter[row.key]) {
          var numericValues = selectedListings
            .map(function (listing) {
              return getComparisonNumber(listing, row.key);
            })
            .filter(function (value) {
              return typeof value === "number" && !Number.isNaN(value);
            });

          if (numericValues.length) {
            bestValue = higherBetter[row.key]
              ? Math.max.apply(null, numericValues)
              : Math.min.apply(null, numericValues);
          }
        }

        var valueCells = selectedListings
          .map(function (listing, idx) {
            var numericValue = getComparisonNumber(listing, row.key);
            var isBest =
              bestValue != null &&
              typeof numericValue === "number" &&
              !Number.isNaN(numericValue) &&
              numericValue === bestValue;

            var style = isBest
              ? ' style="background: var(--color-accent-light); font-weight: var(--font-weight-bold);"'
              : "";

            return "<td" + style + ">" + htmlEscape(values[idx]) + "</td>";
          })
          .join("");

        return "<tr><td><strong>" + row.label + "</strong></td>" + valueCells + "</tr>";
      })
      .join("");

    container.innerHTML =
      '<div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-6);">' +
      '<button id="back-to-listings" class="btn btn-secondary" type="button">Back to Listings</button>' +
      '<button id="inquire-all" class="btn btn-primary" type="button">Inquire About All</button>' +
      "</div>" +
      '<div style="overflow-x:auto;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface);">' +
      '<table style="width:100%;border-collapse:collapse;min-width:900px;">' +
      '<thead><tr><th style="text-align:left;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border);background:var(--color-bg);">Field</th>' +
      headCells +
      "</tr></thead><tbody>" +
      rowsHtml +
      "</tbody></table></div>";

    container.querySelectorAll("th, td").forEach(function (el) {
      if (!el.getAttribute("style")) {
        el.setAttribute(
          "style",
          "text-align:left;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border);font-size:var(--font-size-sm);"
        );
      }
    });

    document.getElementById("back-to-listings").addEventListener("click", function () {
      state.compareList = [];
      document.getElementById("comparison-view").classList.add("hidden");
      document.getElementById("comparison-view").innerHTML = "";
      document.getElementById("filter-bar").classList.remove("hidden");
      document.getElementById("listings-grid").classList.remove("hidden");
      renderBrowseListings();
    });

    document.getElementById("inquire-all").addEventListener("click", function () {
      selectedListings.forEach(function (listing) {
        window.open("listing.html?id=" + encodeURIComponent(listing.id), "_blank");
      });
    });
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

    grid.innerHTML = filtered.map(function (listing) { return listingCardHtml(listing); }).join("");
    updateCompareBar();

    grid.querySelectorAll(".compare-check").forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        var listingId = checkbox.getAttribute("data-id");
        if (!listingId) return;

        if (checkbox.checked) {
          if (state.compareList.indexOf(listingId) !== -1) return;
          if (state.compareList.length >= 3) {
            checkbox.checked = false;
            showMaxCompareTooltip(checkbox);
            return;
          }
          state.compareList.push(listingId);
        } else {
          state.compareList = state.compareList.filter(function (id) {
            return id !== listingId;
          });
        }

        updateCompareBar();
      });
    });

    document.getElementById("compare-btn").onclick = function () {
      if (state.compareList.length < 2) return;
      var selected = state.compareList
        .map(function (id) {
          return (window.LISTINGS || []).find(function (listing) { return listing.id === id; });
        })
        .filter(Boolean);

      if (selected.length < 2) return;

      document.getElementById("filter-bar").classList.add("hidden");
      grid.classList.add("hidden");
      document.getElementById("compare-bar").style.display = "none";
      comparisonView.classList.remove("hidden");
      renderComparisonView(selected);
    };
  }

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
    ["ms-feedstock", "ms-region", "ms-cert"].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener("change", renderBrowseListings);
    });

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

    db.collection("users")
      .where("role", "==", "buyer")
      .get()
      .then(function (snapshot) {
        var tasks = [];
        snapshot.forEach(function (doc) {
          var data = doc.data() || {};
          if (!data.county || !data.state) return;
          tasks.push(
            geocodeLocation(data.county, data.state).then(function (coords) {
              if (!coords) return;
              L.circleMarker(coords, {
                radius: 8,
                color: "#B87333",
                fillColor: "#B87333",
                fillOpacity: 0.95,
                weight: 2
              })
                .addTo(map)
                .bindPopup(
                  "<strong>Business Name:</strong> " + htmlEscape(data.businessName || "-") + "<br>" +
                  "<strong>Crop Types:</strong> " + htmlEscape(Array.isArray(data.cropTypes) ? data.cropTypes.join(", ") : "") + "<br>" +
                  "<strong>County:</strong> " + htmlEscape(data.county || "") + "<br>" +
                  "<strong>State:</strong> " + htmlEscape(data.state || "")
                );
            })
          );
        });

        return Promise.all(tasks);
      })
      .catch(function () {
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
          updateTopNav();
          renderHeroSlot();
          renderTopMatchesBlock();
        })
        .catch(function () {
          state.profile = null;
          updateTopNav();
          renderHeroSlot();
          renderTopMatchesBlock();
        });
    });
  }

  function init() {
    initAuthState();
    initBrowseFilters();
    initMap();
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.classList) {
        return;
      }

      if (target.classList.contains("buy-now-card-btn")) {
        var listingId = target.getAttribute("data-id");
        if (!listingId) return;
        handleCardBuyNow(listingId);
        return;
      }

      var action = target.getAttribute("data-action");
      if (action !== "expand-scorecard" && action !== "collapse-scorecard") {
        return;
      }

      event.preventDefault();
      var card = target.closest(".listing-card");
      if (!card) {
        return;
      }

      var expanded = card.querySelector(".scorecard-expanded");
      if (!expanded) {
        return;
      }

      if (action === "expand-scorecard") {
        expanded.classList.add("open");
      } else {
        expanded.classList.remove("open");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
