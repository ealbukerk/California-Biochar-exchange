(function () {
  var SCORECARD_EXPLANATIONS = {
    carbonContent: "Higher is better. Above 70% indicates stable long-term sequestration.",
    pH: "Values above 7 raise soil pH — beneficial for acidic soils.",
    surfaceArea: "Higher surface area means better water and nutrient retention.",
    particleSize: "Smaller particles blend more easily. Larger particles improve drainage.",
    moisture: "Lower is better for storage and transport.",
    ashContent: "Mineral residue from feedstock. High ash reduces stable carbon proportion.",
    electricalConductivity: "Below 2 dS/m is ideal for most crops."
  };

  function formatDate(dateStr) {
    var date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return dateStr;
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
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

  function formatCurrency(value, maximumFractionDigits) {
    return Number(value || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: maximumFractionDigits
    });
  }

  function renderNotFound(container) {
    container.innerHTML =
      '<p class="not-found">Listing not found. <a href="listings.html">Back to listings</a></p>';
  }

  function renderListing(container, listing) {
    var suitableTags = listing.suitableFor
      .map(function (item) {
        return '<span class="suitable-tag">' + item + "</span>";
      })
      .join("");

    var ratingLine = "No transactions yet";
    if (listing.transactionsCompleted > 0) {
      var rating = listing.averageRating == null ? "N/A" : listing.averageRating.toFixed(1);
      ratingLine =
        listing.transactionsCompleted +
        " transactions completed · " +
        rating +
        '<span class="star-rating">' +
        renderStars(listing.averageRating) +
        "</span>";
    }

    var leadTimeDays = Number(listing.leadTimeDays) || 0;
    var leadTimeText =
      leadTimeDays === 0
        ? '<span class="availability-lead ready">Ready to ship</span>'
        : '<span class="availability-lead wait">' + Math.ceil(leadTimeDays / 7) + "-week lead time</span>";

    var verificationClass = listing.scorecard.labVerified ? "verified" : "self";
    var verificationText = listing.scorecard.labVerified ? "Lab Verified" : "Self Reported";

    container.innerHTML =
      '<div class="listing-shell">' +
      '<section class="listing-header">' +
      "<h1>" +
      listing.producerName +
      "</h1>" +
      '<p class="listing-location">' +
      listing.county +
      ", " +
      listing.region +
      "</p>" +
      '<div class="listing-top-meta"><span class="feedstock-tag">' +
      listing.feedstock +
      "</span></div>" +
      '<div class="headline-row">' +
      '<span class="headline-price">$' +
      listing.pricePerTonne +
      '</span><span class="headline-unit">/tonne</span>' +
      '<span class="headline-detail">' +
      listing.availableTonnes +
      " tonnes available</span>" +
      "</div>" +
      '<p class="rating-line">' +
      ratingLine +
      '<span style="margin-left:12px;color:' + (listing.certifications && listing.certifications.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)') + ';font-weight:500">' +
      (listing.certifications && listing.certifications.length > 0 ? '✓ Certified' : 'Not certified') +
      '</span></p>' +
      '<div id="top-card-actions"></div>' +
      "</section>" +
      '<section class="scorecard-section">' +
      '<div class="section-title-row"><h2>Lab Scorecard</h2><span class="verify-badge ' +
      verificationClass +
      '">' +
      verificationText +
      "</span></div>" +
      '<div class="scorecard-grid">' +
      '<article class="scorecard-item"><p class="scorecard-value">' +
      listing.scorecard.carbonContent.toFixed(1) +
      '%</p><p class="scorecard-label">Carbon Content</p><p class="scorecard-note">' +
      SCORECARD_EXPLANATIONS.carbonContent +
      "</p></article>" +
      '<article class="scorecard-item"><p class="scorecard-value">' +
      listing.scorecard.pH.toFixed(1) +
      '</p><p class="scorecard-label">pH</p><p class="scorecard-note">' +
      SCORECARD_EXPLANATIONS.pH +
      "</p></article>" +
      '<article class="scorecard-item"><p class="scorecard-value">' +
      listing.scorecard.surfaceArea +
      ' m²/g</p><p class="scorecard-label">Surface Area</p><p class="scorecard-note">' +
      SCORECARD_EXPLANATIONS.surfaceArea +
      "</p></article>" +
      '<article class="scorecard-item"><p class="scorecard-value">' +
      listing.scorecard.particleSize +
      '</p><p class="scorecard-label">Particle Size</p><p class="scorecard-note">' +
      SCORECARD_EXPLANATIONS.particleSize +
      "</p></article>" +
      '<article class="scorecard-item"><p class="scorecard-value">' +
      listing.scorecard.moisture.toFixed(1) +
      '%</p><p class="scorecard-label">Moisture</p><p class="scorecard-note">' +
      SCORECARD_EXPLANATIONS.moisture +
      "</p></article>" +
      '<article class="scorecard-item"><p class="scorecard-value">' +
      listing.scorecard.ashContent.toFixed(1) +
      '%</p><p class="scorecard-label">Ash Content</p><p class="scorecard-note">' +
      SCORECARD_EXPLANATIONS.ashContent +
      "</p></article>" +
      '<article class="scorecard-item"><p class="scorecard-value">' +
      listing.scorecard.electricalConductivity.toFixed(1) +
      ' dS/m</p><p class="scorecard-label">Electrical Conductivity</p><p class="scorecard-note">' +
      SCORECARD_EXPLANATIONS.electricalConductivity +
      "</p></article>" +
      "</div>" +
      "</section>" +
      '<section class="suitability-section"><h2>Suitable For</h2><div class="suitable-tags">' +
      suitableTags +
      "</div></section>" +
      '<section class="description-section"><h2>About This Material</h2><p>' +
      listing.description +
      "</p></section>" +
      '<section class="availability-section"><h2>Availability</h2><div class="availability-list">' +
      "<p>Available From: " +
      formatDate(listing.availableFrom) +
      "</p>" +
      "<p>Available Until: " +
      formatDate(listing.availableUntil) +
      "</p>" +
      "<p>Available Tonnes: " +
      listing.availableTonnes +
      "</p>" +
      "<p>Minimum order: " +
      listing.minOrderTonnes +
      " tonnes</p>" +
      "<p>" +
      leadTimeText +
      "</p>" +
      "</div></section>" +
      '<section class="inquiry-section">' +
      "<h2>Enter Deal Room</h2>" +
      '<div id="deal-entry"></div>' +
      "</section>" +
      "</div>";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var container = document.getElementById("listing-detail");
    if (!container) {
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id") || "";
    var listingId = id;
    var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS : [];
    var listing = listings.find(function (item) {
      return item.id === id;
    });

    if (!listing) {
      renderNotFound(container);
      return;
    }

    renderListing(container, listing);
    var dealEntry = document.getElementById("deal-entry");
    if (dealEntry) {
      dealEntry.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm)">Loading...</p>';
    }

    auth.onAuthStateChanged(function (user) {
      var dealEntryEl = document.getElementById("deal-entry");
      if (!dealEntryEl) return;

      var currentListing = (window.LISTINGS || []).find(function (l) { return l.id === listingId; });
      if (!currentListing) return;

      var topCardActions = document.getElementById("top-card-actions");
      if (topCardActions) {
        if (user) {
          topCardActions.innerHTML =
            '<div style="display:flex;gap:var(--space-3);margin-top:var(--space-5)">' +
              '<a href="dealroom.html?listingId=' + listing.id + '" class="btn btn-primary">Make an offer</a>' +
              '<a href="dealroom.html?listingId=' + listing.id + '&buynow=true" class="btn btn-secondary">Buy now at $' + listing.pricePerTonne + '/tonne</a>' +
            '</div>';
        } else {
          topCardActions.innerHTML =
            '<div style="margin-top:var(--space-5)">' +
              '<a href="auth.html?role=buyer" class="btn btn-primary">Create account to buy</a>' +
            '</div>';
        }
      }

      if (user) {
        dealEntryEl.innerHTML =
          '<h2 style="font-size:var(--font-size-xl);font-weight:var(--font-weight-bold);margin-bottom:var(--space-4)">Make a move</h2>' +
          '<p style="color:var(--color-text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-6)">Your inquiry goes directly to the producer. We introduce you within 24 hours.</p>' +
          '<div style="display:flex;gap:var(--space-4);flex-wrap:wrap">' +
            '<a href="dealroom.html?listingId=' + currentListing.id + '" class="btn btn-primary">Make an offer</a>' +
            '<a href="dealroom.html?listingId=' + currentListing.id + '&buynow=true" class="btn btn-secondary">Buy now at $' + currentListing.pricePerTonne + '/tonne</a>' +
          "</div>";
      } else {
        dealEntryEl.innerHTML =
          '<div style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-8);text-align:center">' +
            '<p style="color:var(--color-text-secondary);margin-bottom:var(--space-5)">Create a free account to make an offer or buy now.</p>' +
            '<a href="auth.html?role=buyer" class="btn btn-primary">Create free account</a>' +
            '<p style="margin-top:var(--space-3);font-size:var(--font-size-sm)"><a href="auth.html" style="color:var(--color-accent)">Already have an account? Log in</a></p>' +
          "</div>";
      }
    });
  });
})();
