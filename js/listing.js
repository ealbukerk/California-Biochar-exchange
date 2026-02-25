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
      "<h2>Enter Deal Room</h2>" +
      (window.currentUser
        ? '<div class="deal-entry-buttons" style="display:flex;gap:var(--space-4);margin-top:var(--space-4);flex-wrap:wrap;">' +
          '<button id="make-offer-btn" class="btn btn-primary" type="button">Make an offer</button>' +
          '<button id="quick-buy-btn" class="btn btn-secondary" type="button">Buy now at $' +
          listing.pricePerTonne +
          '/tonne</button>' +
          "</div>" +
          '<div id="quick-buy-panel" class="buynow-quick" style="display:none;margin-top:var(--space-4);max-width:560px;">' +
          '<div><label for="quick-volume">Volume (tonnes)</label><input id="quick-volume" type="number" min="' +
          listing.minOrderTonnes +
          '" placeholder="Min ' +
          listing.minOrderTonnes +
          ' tonnes"></div>' +
          '<div style="margin-top:var(--space-4);"><label for="quick-delivery-method">Delivery method</label><select id="quick-delivery-method"><option>Buyer collects</option><option>Producer delivers</option><option>Third party freight</option></select></div>' +
          '<div style="margin-top:var(--space-4);"><label for="quick-delivery-date">Target delivery date</label><input id="quick-delivery-date" type="date"></div>' +
          '<button id="confirm-quick-buy-btn" class="btn btn-primary" type="button" style="margin-top:var(--space-4);">Confirm purchase</button>' +
          "</div>"
        : '<p style="margin-top:var(--space-3);">Create a free account to send an offer or buy now.</p>' +
          '<a class="btn btn-primary" href="auth.html?role=buyer" style="margin-top:var(--space-4);">Create account</a>') +
      '<p id="deal-entry-error" style="display:none;color:var(--color-warning);margin-top:var(--space-3);">Could not create deal room. Please try again.</p>' +
      "</section>" +
      "</div>";

    if (window.currentUser) {
      var dealError = document.getElementById("deal-entry-error");
      var makeOfferBtn = document.getElementById("make-offer-btn");
      var quickBuyBtn = document.getElementById("quick-buy-btn");
      var quickPanel = document.getElementById("quick-buy-panel");
      var confirmQuickBuyBtn = document.getElementById("confirm-quick-buy-btn");
      var currentUserUID =
        window.currentUser && window.currentUser.uid ? window.currentUser.uid : window.currentUser;
      var buyerName =
        (window.userProfile && (window.userProfile.businessName || window.userProfile.name)) || "Buyer";

      function showDealError() {
        if (dealError) {
          dealError.style.display = "block";
        }
      }

      if (makeOfferBtn) {
        makeOfferBtn.addEventListener("click", async function () {
          if (dealError) {
            dealError.style.display = "none";
          }
          try {
            var dealId = await createDealRoom(listing, window.userProfile || {}, currentUserUID);
            window.location.href = "dealroom.html?id=" + encodeURIComponent(dealId);
          } catch (error) {
            showDealError();
          }
        });
      }

      if (quickBuyBtn && quickPanel) {
        quickBuyBtn.addEventListener("click", function () {
          quickPanel.style.display = quickPanel.style.display === "none" ? "block" : "none";
        });
      }

      if (confirmQuickBuyBtn) {
        confirmQuickBuyBtn.addEventListener("click", async function () {
          var volumeEl = document.getElementById("quick-volume");
          var deliveryMethodEl = document.getElementById("quick-delivery-method");
          var deliveryDateEl = document.getElementById("quick-delivery-date");
          var volume = Number(volumeEl && volumeEl.value ? volumeEl.value : 0);

          if (!volume || volume < listing.minOrderTonnes) {
            showDealError();
            return;
          }

          if (dealError) {
            dealError.style.display = "none";
          }

          try {
            var dealId = await createDealRoom(listing, window.userProfile || {}, currentUserUID);
            await buyNow(
              dealId,
              currentUserUID,
              buyerName,
              volume,
              deliveryMethodEl ? deliveryMethodEl.value : "Buyer collects",
              deliveryDateEl ? deliveryDateEl.value : ""
            );
            window.location.href = "dealroom.html?id=" + encodeURIComponent(dealId);
          } catch (error) {
            showDealError();
          }
        });
      }
    }
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
