(function () {
  var compareList = [];

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

    return {
      search: searchInput ? searchInput.value.trim() : "",
      feedstock: getMultiSelectValues("ms-feedstock"),
      region: getMultiSelectValues("ms-region"),
      cert: getMultiSelectValues("ms-cert"),
      sort: sortSelect ? sortSelect.value : ""
    };
  }

  function updateUrlFromFilters() {
    var defaults = {
      search: "",
      feedstock: [],
      region: [],
      cert: [],
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

    if (searchInput && params.has("search")) {
      searchInput.value = params.get("search");
    }
    hydrateMultiSelectFromParam("ms-feedstock", params.get("feedstock"));
    hydrateMultiSelectFromParam("ms-region", params.get("region"));
    hydrateMultiSelectFromParam("ms-cert", params.get("cert"));
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

  function updateCompareBar() {
    var bar = document.getElementById("compare-bar");
    var count = document.getElementById("compare-count");

    if (!bar || !count) {
      return;
    }

    count.textContent = compareList.length + " listings selected";
    bar.style.display = compareList.length >= 2 ? "flex" : "none";
  }

  function showMaxCompareTooltip(checkbox) {
    var label = checkbox.parentElement;
    if (!label) {
      return;
    }

    var existing = label.querySelector(".compare-tooltip");
    if (existing) {
      existing.remove();
    }

    var tooltip = document.createElement("span");
    tooltip.className = "compare-tooltip";
    tooltip.textContent = "Maximum 3";
    tooltip.style.marginLeft = "6px";
    tooltip.style.color = "var(--color-warning)";
    tooltip.style.fontSize = "var(--font-size-xs)";

    label.appendChild(tooltip);

    setTimeout(function () {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    }, 2000);
  }

  function getSelectedListings(allListings) {
    return compareList
      .map(function (id) {
        return allListings.find(function (listing) {
          return listing.id === id;
        });
      })
      .filter(Boolean);
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

  function renderComparisonView(container, allListings, onBack) {
    var selectedListings = getSelectedListings(allListings);
    if (selectedListings.length < 2) {
      container.innerHTML = "";
      return;
    }

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
        return "<th>" + listing.producerName + "</th>";
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
            .filter(function (v) {
              return typeof v === "number" && !Number.isNaN(v);
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

            return "<td" + style + ">" + values[idx] + "</td>";
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
      "<thead><tr><th style=\"text-align:left;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border);background:var(--color-bg);\">Field</th>" +
      headCells +
      "</tr></thead>" +
      "<tbody>" +
      rowsHtml +
      "</tbody></table></div>";

    container.querySelectorAll("th, td").forEach(function (el) {
      if (!el.getAttribute("style")) {
        el.setAttribute(
          "style",
          "text-align:left;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border);font-size:var(--font-size-sm);"
        );
      } else {
        el.setAttribute(
          "style",
          "text-align:left;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--color-border);font-size:var(--font-size-sm);" +
            el.getAttribute("style")
        );
      }
    });

    var backButton = document.getElementById("back-to-listings");
    var inquireAllButton = document.getElementById("inquire-all");

    backButton.addEventListener("click", onBack);
    inquireAllButton.addEventListener("click", function () {
      selectedListings.forEach(function (listing) {
        window.open("listing.html?id=" + listing.id, "_blank");
      });
    });
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

      var matchesFeedstock = !feedstockFilterActive || filters.feedstock.indexOf(listing.feedstock) !== -1;
      var matchesRegion = !regionFilterActive || filters.region.indexOf(listing.region) !== -1;
      var matchesCert =
        !certFilterActive ||
        listing.certifications.some(function (cert) {
          return filters.cert.indexOf(cert) !== -1;
        });

      return matchesSearch && matchesFeedstock && matchesRegion && matchesCert;
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

    var filters = {
      search: searchInput.value.trim().toLowerCase(),
      feedstock: getMultiSelectValues("ms-feedstock"),
      region: getMultiSelectValues("ms-region"),
      cert: getMultiSelectValues("ms-cert"),
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

      var certBadges = listing.certifications
        .map(function (cert) {
          return '<span class="cert-badge">' + cert + "</span>";
        })
        .join("");

      var suitableTags = visibleSuitable
        .map(function (item) {
          return '<span class="suitable-tag">' + item + "</span>";
        })
        .join("");

      if (hiddenCount > 0) {
        suitableTags += '<span class="suitable-more">+' + hiddenCount + " more</span>";
      }

      var ratingText = listing.averageRating == null ? "No rating yet" : listing.averageRating.toFixed(1);
      var stars = renderStars(listing.averageRating);
      var ratingStarsHtml = stars ? '<span class="star-rating" aria-label="Rated ' + ratingText + ' out of 5">' + stars + "</span>" : "";
      var leadTime = getLeadTimeDisplay(listing.leadTimeDays);

      return (
        '<article class="listing-card" id="listing-' +
        listing.id +
        '" style="position: relative;">' +
        '<div style="position:absolute;top:12px;right:12px;">' +
        '<label style="display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-sm);color:var(--color-text-secondary);">' +
        '<input class="compare-check" type="checkbox" data-id="' +
        listing.id +
        '"' +
        (compareList.includes(listing.id) ? " checked" : "") +
        " />+ Compare</label></div>" +
        "<h3>" +
        listing.producerName +
        "</h3>" +
        '<p class="listing-meta">' +
        listing.county +
        " County · " +
        listing.region +
        "</p>" +
        '<span class="feedstock-tag">' +
        listing.feedstock +
        "</span>" +
        '<div class="price-row"><span class="price-value">$' +
        listing.pricePerTonne +
        '</span><span class="price-unit">/tonne</span></div>' +
        '<p class="card-detail">Available: ' +
        listing.availableTonnes +
        " tonnes</p>" +
        '<p class="card-detail">Availability: ' +
        formatDateRange(listing.availableFrom, listing.availableUntil) +
        "</p>" +
        '<p class="card-detail">Min order: ' +
        listing.minOrderTonnes +
        " tonnes</p>" +
        '<p class="card-detail ' +
        leadTime.className +
        '">' +
        leadTime.text +
        "</p>" +
        '<div class="scorecard-mini">' +
        '<span class="score-item">C: ' +
        listing.scorecard.carbonContent.toFixed(1) +
        '%</span>' +
        '<span class="score-item">pH: ' +
        listing.scorecard.pH.toFixed(1) +
        "</span>" +
        '<span class="score-item">' +
        listing.scorecard.surfaceArea +
        " m²/g</span>" +
        "</div>" +
        '<div class="badge-row">' +
        certBadges +
        "</div>" +
        '<div class="suitable-row">' +
        suitableTags +
        "</div>" +
        '<div class="rating-row"><span>' +
        listing.transactionsCompleted +
        " transactions</span><span>·</span><span>" +
        ratingText +
        "</span>" +
        ratingStarsHtml +
        "</div>" +
        '<div class="listing-actions"><a class="btn btn-primary" href="listing.html?id=' +
        listing.id +
        '">View &amp; Inquire</a></div>' +
        "</article>"
      );
    });

    grid.innerHTML = cards.join("");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var grid = document.getElementById("listings-grid");
    var filterBar = document.getElementById("filter-bar");
    var compareBar = document.getElementById("compare-bar");
    var compareBtn = document.getElementById("compare-btn");
    var comparisonView = document.getElementById("comparison-view");
    var listings = window.LISTINGS;

    if (!grid) {
      return;
    }

    function update() {
      renderListings(grid, listings);
      updateCompareBar();
      updateUrlFromFilters();
    }

    var feedstockEl = document.getElementById("ms-feedstock");
    var regionEl = document.getElementById("ms-region");
    var certEl = document.getElementById("ms-cert");
    var searchElement = document.getElementById("search");
    var sortElement = document.getElementById("filter-sort");

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

    [feedstockEl, regionEl, certEl].forEach(function (el) {
      if (el) {
        el.addEventListener("change", update);
      }
    });

    grid.addEventListener("change", function (event) {
      var target = event.target;
      if (!target.classList.contains("compare-check")) {
        return;
      }

      var listingId = target.getAttribute("data-id");
      if (!listingId) {
        return;
      }

      if (target.checked) {
        if (compareList.indexOf(listingId) !== -1) {
          return;
        }

        if (compareList.length >= 3) {
          target.checked = false;
          showMaxCompareTooltip(target);
          return;
        }

        compareList.push(listingId);
      } else {
        compareList = compareList.filter(function (id) {
          return id !== listingId;
        });
      }

      updateCompareBar();
    });

    if (compareBtn) {
      compareBtn.addEventListener("click", function () {
        if (compareList.length < 2) {
          return;
        }

        if (filterBar) {
          filterBar.style.display = "none";
        }
        grid.style.display = "none";
        if (compareBar) {
          compareBar.style.display = "none";
        }
        if (comparisonView) {
          comparisonView.style.display = "block";
          renderComparisonView(comparisonView, listings, function () {
            compareList = [];
            document.querySelectorAll(".compare-check").forEach(function (checkbox) {
              checkbox.checked = false;
            });

            comparisonView.innerHTML = "";
            comparisonView.style.display = "none";
            grid.style.display = "grid";
            if (filterBar) {
              filterBar.style.display = "block";
            }
            update();
          });
        }
      });
    }

    hydrateFiltersFromUrl();
    update();
  });
})();
