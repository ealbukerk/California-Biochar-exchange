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
    var certBadges = listing.certifications
      .map(function (cert) {
        return '<span class="cert-badge">' + cert + "</span>";
      })
      .join("");

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
      '<span class="headline-detail">' +
      formatDate(listing.availableFrom) +
      " – " +
      formatDate(listing.availableUntil) +
      "</span>" +
      "</div>" +
      '<div class="badge-row">' +
      certBadges +
      "</div>" +
      '<p class="rating-line">' +
      ratingLine +
      "</p>" +
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
      "<h2>Send an Inquiry</h2>" +
      "<p>Your inquiry goes to the Biochar.market team. We introduce you to the producer within 24 hours.</p>" +
      '<form id="inquiry-form">' +
      '<input type="hidden" name="listing_id" value="' +
      listing.id +
      '">' +
      '<input type="hidden" name="producer_name" value="' +
      listing.producerName +
      '">' +
      '<input type="hidden" name="pricePerTonne" value="' +
      listing.pricePerTonne +
      '">' +
      '<div><label for="inq-name">Your name</label><input id="inq-name" type="text" name="name" required></div>' +
      '<div><label for="inq-email">Your email</label><input id="inq-email" type="email" name="email" required></div>' +
      '<div><label for="inq-business">Farm or business name</label><input id="inq-business" type="text" name="businessName" required></div>' +
      '<div><label for="inq-volume">Volume needed (tonnes)</label><input id="inq-volume" type="number" name="volume" required></div>' +
      '<div id="commission-preview" hidden></div>' +
      '<div><label for="inq-notes">Soil conditions or questions</label><textarea id="inq-notes" name="notes" rows="3"></textarea></div>' +
      '<button class="btn btn-primary" type="submit">Send Inquiry</button>' +
      "</form>" +
      '<div id="form-success" hidden><p>Thank you — we\'ll be in touch within 24 hours.</p></div>' +
      '<div id="form-error" hidden></div>' +
      "</section>" +
      "</div>";

    var form = document.getElementById("inquiry-form");
    form.addEventListener("submit", handleInquiryForm);
    var volumeInput = document.getElementById("inq-volume");
    var commissionPreview = document.getElementById("commission-preview");

    function updateCommissionPreview() {
      var volume = Number(volumeInput.value);
      if (!(volume > 0) || typeof calculateCommission !== "function") {
        commissionPreview.hidden = true;
        commissionPreview.innerHTML = "";
        return;
      }

      var transactionValue = volume * Number(listing.pricePerTonne || 0);
      var commission = calculateCommission(transactionValue);

      commissionPreview.hidden = false;
      commissionPreview.innerHTML =
        "<p>Estimated transaction value: " +
        formatCurrency(transactionValue, 0) +
        "</p>" +
        "<p>Platform commission: " +
        commission.rateDisplay +
        " (" +
        formatCurrency(commission.commissionAmount, 2) +
        ") — " +
        commission.bracketLabel +
        "</p>" +
        "<p>You pay: " +
        formatCurrency(transactionValue, 0) +
        "</p>";
    }

    volumeInput.addEventListener("input", updateCommissionPreview);
    volumeInput.addEventListener("change", updateCommissionPreview);

    var params = new URLSearchParams(window.location.search);
    if (params.get("reorder") === "true") {
      var payload = null;
      try {
        payload = JSON.parse(sessionStorage.getItem("reorderPayload") || "null");
      } catch (error) {
        payload = null;
      }

      var notesInput = document.getElementById("inq-notes");
      var businessInput = document.getElementById("inq-business");

      if (payload && payload.listingID === listing.id) {
        if (volumeInput && payload.tonnes) {
          volumeInput.value = payload.tonnes;
        }
        if (notesInput) {
          notesInput.value = "Reorder request for " + (payload.feedstock || listing.feedstock) + " from " + (payload.producerName || listing.producerName) + ".";
        }
      } else if (notesInput) {
        notesInput.value = "Reorder request for " + listing.feedstock + " from " + listing.producerName + ".";
      }

      if (businessInput && window.userProfile && window.userProfile.businessName) {
        businessInput.value = window.userProfile.businessName;
      }
    }

    updateCommissionPreview();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var container = document.getElementById("listing-detail");
    if (!container) {
      return;
    }

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id") || "";
    var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS : [];
    var listing = listings.find(function (item) {
      return item.id === id;
    });

    if (!listing) {
      renderNotFound(container);
      return;
    }

    renderListing(container, listing);
  });
})();
