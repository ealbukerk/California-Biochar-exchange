var compareList = []

function updateCompareBar() {
  var bar = document.getElementById('compare-bar')
  var count = document.getElementById('compare-count')
  if (!bar) return
  if (compareList.length >= 2) {
    bar.style.display = 'flex'
    if (count) count.textContent = compareList.length + ' listings selected'
  } else {
    bar.style.display = 'none'
  }
}

function runComparison() {
  if (compareList.length < 2) return
  var listings = compareList.map(function(id) {
    return window.LISTINGS.find(function(l) { return String(l.id) === String(id) })
  }).filter(Boolean)
  if (listings.length < 2) return

  var modal = document.getElementById('compare-modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'compare-modal'
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:600;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto'
    document.body.appendChild(modal)
  }

  var fields = [
    { label: 'Feedstock', key: 'feedstock' },
    { label: 'Price per tonne', key: 'pricePerTonne', prefix: '$' },
    { label: 'Available tonnes', key: 'availableTonnes', suffix: ' t' },
    { label: 'Min order', key: 'minOrderTonnes', suffix: ' t' },
    { label: 'Lead time', key: 'leadTimeDays', suffix: ' days' },
    { label: 'Carbon content', key: 'carbonContent', parent: 'scorecard', suffix: '%' },
    { label: 'pH', key: 'pH', parent: 'scorecard' },
    { label: 'Surface area', key: 'surfaceArea', parent: 'scorecard', suffix: ' m²/g' },
    { label: 'Moisture', key: 'moisture', parent: 'scorecard', suffix: '%' },
    { label: 'Ash content', key: 'ashContent', parent: 'scorecard', suffix: '%' },
    { label: 'EC', key: 'electricalConductivity', parent: 'scorecard', suffix: ' dS/m' }
  ]

  function getVal(listing, field) {
    var raw = field.parent ? (listing[field.parent] ? listing[field.parent][field.key] : null) : listing[field.key]
    if (raw === null || raw === undefined || raw === '') return '—'
    return (field.prefix || '') + raw + (field.suffix || '')
  }

  function getBest(field) {
    var numericKeys = ['pricePerTonne','availableTonnes','carbonContent','surfaceArea']
    if (numericKeys.indexOf(field.key) === -1) return null
    var vals = listings.map(function(l) {
      var raw = field.parent ? (l[field.parent] ? l[field.parent][field.key] : null) : l[field.key]
      return parseFloat(raw)
    })
    if (vals.some(isNaN)) return null
    return field.key === 'pricePerTonne'
      ? vals.indexOf(Math.min.apply(null, vals))
      : vals.indexOf(Math.max.apply(null, vals))
  }

  var cols = listings.map(function(l) { return '<th style="padding:12px 16px;text-align:left;font-weight:600">' + l.producerName + '<br><span style="font-size:12px;font-weight:400;color:#666">' + l.feedstock + '</span></th>' }).join('')

  var rows = fields.map(function(field) {
    var bestIdx = getBest(field)
    var cells = listings.map(function(l, idx) {
      var val = getVal(l, field)
      var highlight = bestIdx === idx ? 'background:var(--color-accent-light);font-weight:600' : ''
      return '<td style="padding:10px 16px;border-top:1px solid var(--color-border);' + highlight + '">' + val + '</td>'
    }).join('')
    return '<tr><td style="padding:10px 16px;border-top:1px solid var(--color-border);color:var(--color-text-muted);font-size:13px;white-space:nowrap">' + field.label + '</td>' + cells + '</tr>'
  }).join('')

  var actionCells = listings.map(function(l) {
    return '<td style="padding:12px 16px;border-top:2px solid var(--color-border)"><a href="listing.html?id=' + l.id + '" class="btn btn-primary" style="display:block;text-align:center;font-size:13px">View listing</a></td>'
  }).join('')

  modal.innerHTML =
    '<div style="background:white;border-radius:12px;width:100%;max-width:' + (listings.length * 280 + 200) + 'px;overflow:hidden">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid var(--color-border)">' +
        '<h2 style="font-size:18px;font-weight:700">Comparing ' + listings.length + ' listings</h2>' +
        '<button id="close-compare-modal" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666">×</button>' +
      '</div>' +
      '<div style="overflow-x:auto">' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr><th style="padding:12px 16px;text-align:left;color:var(--color-text-muted);font-size:13px">Field</th>' + cols + '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
          '<tfoot><tr><td></td>' + actionCells + '</tr></tfoot>' +
        '</table>' +
      '</div>' +
    '</div>'

  modal.style.display = 'flex'

  document.getElementById('close-compare-modal').addEventListener('click', function() {
    modal.style.display = 'none'
  })
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.style.display = 'none'
  })
}

document.addEventListener('change', function(e) {
  if (!e.target.classList.contains('compare-check')) return
  e.stopPropagation()
  var id = String(e.target.dataset.id)
  if (e.target.checked) {
    if (compareList.length >= 3) {
      e.target.checked = false
      return
    }
    if (compareList.indexOf(id) === -1) compareList.push(id)
  } else {
    compareList = compareList.filter(function(i) { return i !== id })
  }
  updateCompareBar()
})

document.addEventListener('click', function(e) {
  if (e.target.id === 'compare-btn' || (e.target.closest && e.target.closest('#compare-btn'))) {
    e.preventDefault()
    e.stopPropagation()
    runComparison()
  }
  if (e.target.id === 'reset-filters') {
    compareList = []
    updateCompareBar()
    document.querySelectorAll('.compare-check').forEach(function(cb) { cb.checked = false })
  }
})

(function () {
  var listingsGridEl = null;

  function formatDateRange(fromISO, untilISO) {
    var from = new Date(fromISO);
    var until = new Date(untilISO);

    if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
      return fromISO + " - " + untilISO;
    }

    var options = { month: "short", year: "numeric" };
    return from.toLocaleDateString("en-US", options) + " – " + until.toLocaleDateString("en-US", options);
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
      return {
        text: "Ready to ship",
        className: "lead-time-ready"
      };
    }

    return {
      text: Math.ceil(days / 7) + "-week lead time",
      className: "lead-time-standard"
    };
  }

  function readFiltersForUrl() {
    var searchInput = document.getElementById("search");
    var sortSelect = document.getElementById("filter-sort");
    var stateSelect = document.getElementById("filter-state");

    return {
      search: searchInput ? searchInput.value.trim() : "",
      feedstock: getMultiSelectValues("ms-feedstock"),
      region: getMultiSelectValues("ms-region"),
      cert: getMultiSelectValues("ms-cert"),
      state: stateSelect ? stateSelect.value : "",
      sort: sortSelect ? sortSelect.value : ""
    };
  }

  function updateUrlFromFilters() {
    var defaults = {
      search: "",
      feedstock: [],
      region: [],
      cert: [],
      state: "",
      sort: "price-asc"
    };

    var filters = readFiltersForUrl();
    var params = new URLSearchParams();

    Object.keys(filters).forEach(function (key) {
      var value = filters[key];
      var defaultValue = defaults[key];
      if (Array.isArray(value)) {
        var activeValues = value.filter(function (entry) {
          return entry && entry !== "All";
        });
        if (activeValues.length > 0) {
          params.set(key, activeValues.join(","));
        }
        return;
      }

      if (value && value !== "all" && value !== defaultValue) {
        params.set(key, value);
      }
    });

    var query = params.toString();
    var nextUrl = window.location.pathname + (query ? "?" + query : "");
    window.history.replaceState({}, "", nextUrl);
  }

  function hydrateFiltersFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var searchInput = document.getElementById("search");
    var sortSelect = document.getElementById("filter-sort");
    var stateSelect = document.getElementById("filter-state");

    if (searchInput && params.has("search")) {
      searchInput.value = params.get("search");
    }
    hydrateMultiSelectFromParam("ms-feedstock", params.get("feedstock"));
    hydrateMultiSelectFromParam("ms-region", params.get("region"));
    hydrateMultiSelectFromParam("ms-cert", params.get("cert"));
    if (stateSelect && params.has("state")) {
      stateSelect.value = params.get("state");
    }
    if (sortSelect && params.has("sort")) {
      sortSelect.value = params.get("sort");
    }
  }

  function getMultiSelectValues(containerId) {
    var container = document.getElementById(containerId);
    if (!container || typeof container.getValue !== "function") {
      return [];
    }

    return container.getValue();
  }

  function hydrateMultiSelectFromParam(containerId, paramValue) {
    var container = document.getElementById(containerId);
    if (!container || typeof container.setValue !== "function") {
      return;
    }

    if (!paramValue) {
      container.setValue(["All"]);
      return;
    }

    var desired = paramValue
      .split(",")
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);

    container.setValue(desired.length ? desired : ["All"]);
  }


  function getFilteredListings(listings, filters) {
    var filtered = listings.filter(function (listing) {
      var searchValue = filters.search;
      var matchesSearch =
        !searchValue ||
        listing.producerName.toLowerCase().includes(searchValue) ||
        listing.county.toLowerCase().includes(searchValue);

      var feedstockFilterActive = filters.feedstock.length > 0 && filters.feedstock.indexOf("All") === -1;
      var regionFilterActive = filters.region.length > 0 && filters.region.indexOf("All") === -1;
      var certFilterActive = filters.cert.length > 0 && filters.cert.indexOf("All") === -1;
      var stateFilterValue = (filters.state || "").trim();
      var stateFilterActive = !!stateFilterValue && stateFilterValue !== "All States";

      var matchesFeedstock = !feedstockFilterActive || filters.feedstock.indexOf(listing.feedstock) !== -1;
      var matchesRegion = !regionFilterActive || filters.region.indexOf(listing.region) !== -1;
      var matchesCert =
        !certFilterActive ||
        listing.certifications.some(function (cert) {
          return filters.cert.indexOf(cert) !== -1;
        });
      var listingState = String(listing.state || "").toLowerCase();
      var listingRegion = String(listing.region || "").toLowerCase();
      var stateNeedle = stateFilterValue.toLowerCase();
      var matchesState =
        !stateFilterActive ||
        listingState.indexOf(stateNeedle) !== -1 ||
        listingRegion.indexOf(stateNeedle) !== -1;

      return matchesSearch && matchesFeedstock && matchesRegion && matchesCert && matchesState;
    });

    filtered.sort(function (a, b) {
      if (filters.sort === "price-asc") {
        return a.pricePerTonne - b.pricePerTonne;
      }

      if (filters.sort === "price-desc") {
        return b.pricePerTonne - a.pricePerTonne;
      }

      if (filters.sort === "carbon-desc") {
        return b.scorecard.carbonContent - a.scorecard.carbonContent;
      }

      if (filters.sort === "tonnes-desc") {
        return b.availableTonnes - a.availableTonnes;
      }

      if (filters.sort === "rating-desc") {
        var aNull = a.averageRating == null;
        var bNull = b.averageRating == null;

        if (aNull && bNull) {
          return 0;
        }

        if (aNull) {
          return 1;
        }

        if (bNull) {
          return -1;
        }

        return b.averageRating - a.averageRating;
      }

      return 0;
    });

    return filtered;
  }

  function renderListings(grid, listings) {
    if (!Array.isArray(listings) || listings.length === 0) {
      grid.innerHTML = '<p class="loading-state">Listings loading...</p>';
      return;
    }

    var searchInput = document.getElementById("search");
    var sortSelect = document.getElementById("filter-sort");
    var stateSelect = document.getElementById("filter-state");

    var filters = {
      search: searchInput.value.trim().toLowerCase(),
      feedstock: getMultiSelectValues("ms-feedstock"),
      region: getMultiSelectValues("ms-region"),
      cert: getMultiSelectValues("ms-cert"),
      state: stateSelect ? stateSelect.value : "",
      sort: sortSelect.value
    };

    var filtered = getFilteredListings(listings, filters);

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="no-results">No listings match your current filters.</p>';
      return;
    }

    var cards = filtered.map(function (listing) {
      var visibleSuitable = listing.suitableFor.slice(0, 3);
      var hiddenCount = Math.max(0, listing.suitableFor.length - 3);
      var ratingText = listing.averageRating == null ? "No rating yet" : listing.averageRating.toFixed(1);
      var stars = renderStars(listing.averageRating);
      var ratingStarsHtml = stars ? '<span class="star-rating" aria-label="Rated ' + ratingText + ' out of 5">' + stars + "</span>" : "";
      var leadTime = getLeadTimeDisplay(listing.leadTimeDays);
      var verifiedBadge = listing.verified === true && typeof window.renderVerifiedBadge === "function"
        ? window.renderVerifiedBadge()
        : "";

      var certBadges = listing.certifications
        .map(function (cert) {
          return '<span class="cert-badge">' + cert + "</span>";
        })
        .join("");

      var suitableTags = visibleSuitable
        .map(function (item) {
          return '<span class="suitable-tag">' + item + "</span>";
        })
        .join("") + (hiddenCount > 0 ? '<span class="suitable-more">+' + hiddenCount + " more</span>" : "");

      return (
        '<div class="listing-card-wrapper" style="position:relative">' +
        '<div class="compare-corner">' +
        '<input type="checkbox" class="compare-check" data-id="' + listing.id + '"' + (compareList.includes(listing.id) ? " checked" : "") + ">" +
        '<label class="compare-label">Compare</label>' +
        "</div>" +
        '<a href="listing.html?id=' + listing.id + '" class="listing-card" id="listing-' + listing.id + '" style="text-decoration:none;color:inherit;display:block">' +
        '<div class="listing-top-row"><h3 style="margin:0;">' + listing.producerName + '</h3>' + verifiedBadge + "</div>" +
        '<div class="listing-subtitle">' + (listing.region || listing.state || "") + "</div>" +
        '<span class="feedstock-tag">' + listing.feedstock + "</span>" +
        '<div class="listing-summary-price">' +
        '<div class="price-row"><span class="price-value">$' + listing.pricePerTonne + '</span><span class="price-unit">/tonne</span></div>' +
        '<span class="card-detail">Available: ' + listing.availableTonnes + " tonnes</span>" +
        "</div>" +
        '<div class="scorecard-inline">' +
        '<span class="scorecard-badge">' + listing.scorecard.carbonContent + '% C</span>' +
        '<span class="scorecard-badge">pH ' + listing.scorecard.pH + "</span>" +
        '<span class="scorecard-badge">' + listing.scorecard.surfaceArea + ' m²/g</span>' +
        "</div>" +
        '<div class="badge-row" style="margin-top:var(--space-3);">' + certBadges + "</div>" +
        '<div class="suitable-row" style="margin-top:var(--space-3);">' + suitableTags + "</div>" +
        '<p class="card-detail">Availability: ' + formatDateRange(listing.availableFrom, listing.availableUntil) + "</p>" +
        '<p class="card-detail">Min order: ' + listing.minOrderTonnes + " tonnes</p>" +
        '<p class="card-detail ' + leadTime.className + '">' + leadTime.text + "</p>" +
        '<div class="rating-row"><span>' + listing.transactionsCompleted + " transactions</span><span>·</span><span>" + ratingText + "</span>" + ratingStarsHtml + "</div>" +
        '<div class="listing-actions" style="display:flex;gap:var(--space-2);margin-top:var(--space-3);flex-wrap:wrap;">' +
        '<span class="btn btn-primary">Make an offer</span>' +
        '<button class="btn btn-secondary buy-now-toggle-btn" type="button" data-id="' + listing.id + '">Buy now</button>' +
        "</div>" +
        '<div class="buy-now-inline hidden" id="buy-inline-' + listing.id + '" style="margin-top:var(--space-3);display:none;gap:var(--space-2);">' +
        '<input type="number" min="' + listing.minOrderTonnes + '" value="' + listing.minOrderTonnes + '" style="max-width:130px;" />' +
        '<button class="btn btn-primary buy-now-confirm-btn" type="button" data-id="' + listing.id + '">Confirm purchase</button>' +
        "</div>" +
        "</a>" +
        "</div>"
      );
    });

    grid.innerHTML = cards.join("");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var grid = document.getElementById("listings-grid");
    var listings = window.LISTINGS;

    if (!grid) {
      return;
    }

    function update() {
      renderListings(grid, listings);
      updateCompareBar();
      updateUrlFromFilters();
    }
    window.__cbxListingsUpdate = update;

    listingsGridEl = grid;

    var feedstockEl = document.getElementById("ms-feedstock");
    var regionEl = document.getElementById("ms-region");
    var certEl = document.getElementById("ms-cert");
    var searchElement = document.getElementById("search");
    var sortElement = document.getElementById("filter-sort");
    var stateElement = document.getElementById("filter-state");

    if (feedstockEl) {
      makeMultiSelect(
        feedstockEl,
        ["Almond Shell", "Walnut Shell", "Pistachio Shell", "Vine Pruning", "Wood Chip", "Forest Thinning", "Rice Husk", "Corn Stover", "Wheat Straw"],
        "All Feedstocks"
      );
    }

    if (regionEl) {
      makeMultiSelect(
        regionEl,
        ["Sacramento Valley", "San Joaquin Valley", "North Coast", "Central Coast", "Sierra Foothills", "Pacific Northwest", "Great Plains", "Southeast", "Northeast", "Midwest"],
        "All Regions"
      );
    }

    if (certEl) {
      makeMultiSelect(certEl, ["OMRI Listed", "IBI Certified", "California Organic"], "Any Certification");
    }

    if (searchElement) {
      searchElement.addEventListener("input", update);
    }

    if (sortElement) {
      sortElement.addEventListener("change", update);
    }

    if (stateElement) {
      stateElement.addEventListener("change", update);
    }

    [feedstockEl, regionEl, certEl].forEach(function (el) {
      if (el) {
        el.addEventListener("change", update);
      }
    });

    if (!document.body.dataset.cardClickDelegationBoundListings) {
      document.addEventListener("click", function (event) {
        if (event.target.closest(".compare-corner")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (event.target.classList.contains("buynow-quick-btn")) {
          event.preventDefault();
          event.stopPropagation();
          var quickListingId = event.target.dataset.id;
          if (quickListingId) {
            window.location.href = "listing.html?id=" + quickListingId;
          }
          return;
        }

        var buyToggle = event.target.closest(".buy-now-toggle-btn");
        if (buyToggle) {
          event.preventDefault();
          event.stopPropagation();
          var buyId = buyToggle.getAttribute("data-id");
          var inlineEl = document.getElementById("buy-inline-" + buyId);
          if (!inlineEl) return;
          inlineEl.style.display = inlineEl.style.display === "none" || inlineEl.style.display === "" ? "flex" : "none";
          return;
        }

        var buyConfirm = event.target.closest(".buy-now-confirm-btn");
        if (buyConfirm) {
          event.preventDefault();
          event.stopPropagation();
          var listingId = buyConfirm.getAttribute("data-id");
          if (listingId) {
            window.location.href = "listing.html?id=" + listingId;
          }
        }
      });
      document.body.dataset.cardClickDelegationBoundListings = "true";
    }

    hydrateFiltersFromUrl();
    update();
  });
})();
