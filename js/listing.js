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
      '<section class="scorecard-section" style="margin-top:var(--space-6)">' +
      '<h2 class="section-title">Delivered Cost Estimate</h2>' +
      '<div id="dc-setup">' +
      '<div style="display:flex;flex-wrap:wrap;gap:var(--space-4);margin-bottom:var(--space-4);align-items:flex-end">' +
      '<div><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Your ZIP Code</label>' +
      '<input id="dc-buyer-zip" type="text" maxlength="5" placeholder="e.g. 94103" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:6px"></div>' +
      '<div><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Volume (tonnes)</label>' +
      '<input id="dc-tonnes" type="number" min="1" value="' + listing.minOrderTonnes + '" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:6px"></div>' +
      '<div><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Application Rate (tons/acre)</label>' +
      '<input id="dc-apprate" type="number" min="0" step="0.1" value="1" style="width:120px;padding:8px;border:1px solid var(--color-border);border-radius:6px"></div>' +
      '<div style="flex:1;min-width:220px"><label style="display:block;font-size:var(--font-size-sm);font-weight:500;margin-bottom:4px">Spreading Cost: $<span id="dc-spread-val">60</span>/tonne</label>' +
      '<input id="dc-spread" type="range" min="40" max="80" value="60" style="width:100%"></div>' +
      '<button id="dc-calc-btn" class="btn btn-primary" type="button">Calculate</button>' +
      '</div>' +
      '<div id="dc-result" style="display:none;background:var(--color-accent-light);border-radius:var(--radius-lg);padding:var(--space-5)">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-4);margin-bottom:var(--space-4)">' +
      '<div><p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin:0">Material Cost</p><p id="dc-material" style="font-size:var(--font-size-xl);font-weight:700;margin:0"></p></div>' +
      '<div><p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin:0">Transport Cost</p><p id="dc-transport" style="font-size:var(--font-size-xl);font-weight:700;margin:0"></p><p id="dc-distance" style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin:0"></p></div>' +
      '<div><p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin:0">Application Cost</p><p id="dc-application" style="font-size:var(--font-size-xl);font-weight:700;margin:0"></p></div>' +
      '<div style="border-left:2px solid var(--color-accent);padding-left:var(--space-4)"><p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin:0">Total Delivered</p>' +
      '<p id="dc-total" style="font-size:var(--font-size-xl);font-weight:700;color:var(--color-accent);margin:0"></p>' +
      '<p id="dc-per-acre" style="font-size:var(--font-size-sm);font-weight:600;color:var(--color-accent);margin:4px 0 0"></p></div>' +
      '</div></div></div>' +
      '</section>' +
      '<section class="suitability-section"><h2>Suitable For</h2><div class="suitable-tags">' +
      suitableTags +
      "</div></section>" +
      '<section class="description-section"><h2>About This Material</h2><p>' +
      listing.description +
      "</p></section>" +
      '<section class="availability-section"><h2>Availability &amp; Delivery</h2><div class="availability-list">' +
      "<p>Available From: " + formatDate(listing.availableFrom) + "</p>" +
      "<p>Available Until: " + formatDate(listing.availableUntil) + "</p>" +
      "<p>Available Tonnes: " + listing.availableTonnes + "</p>" +
      "<p>Minimum order: " + listing.minOrderTonnes + " tonnes</p>" +
      "<p>" + leadTimeText + "</p>" +
      '</div>' +
      '<div style="margin-top:var(--space-6);padding-top:var(--space-6);border-top:1px solid var(--color-border)">' +
        '<h3 style="font-size:var(--font-size-base);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-4)">Delivery options</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3)">' +
          '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-4);text-align:center">' +
            '<div style="font-size:1.5rem">🚜</div>' +
            '<div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);margin-top:var(--space-2)">Buyer collects</div>' +
            '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:4px">You arrange pickup from producer location</div>' +
          '</div>' +
          '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-4);text-align:center">' +
            '<div style="font-size:1.5rem">🚚</div>' +
            '<div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);margin-top:var(--space-2)">Producer delivers</div>' +
            '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:4px">Producer arranges delivery to your farm</div>' +
          '</div>' +
          '<div style="background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-4);text-align:center">' +
            '<div style="font-size:1.5rem">🏢</div>' +
            '<div style="font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);margin-top:var(--space-2)">Third party freight</div>' +
            '<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:4px">Independent carrier coordinates transport</div>' +
          '</div>' +
        '</div>' +
        '<p style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-3)">Delivery method is agreed between buyer and producer in the deal room before confirming. Listing price does not include transport.</p>' +
      '</div>' +
      '</section>' +
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
    (function() {
      document.addEventListener('DOMContentLoaded', function() {
      var spreadSlider = document.getElementById('dc-spread');
      var spreadVal = document.getElementById('dc-spread-val');
      if (spreadSlider && spreadVal) {
        spreadSlider.addEventListener('input', function() {
          spreadVal.textContent = spreadSlider.value;
        });
      }

      // Autofill from Firebase profile if available
      firebase.auth().onAuthStateChanged(function(user) {
        if (!user) return;
        firebase.firestore().collection('users').doc(user.uid).get().then(function(doc) {
          if (!doc.exists) return;
          var profile = doc.data();
          if (profile.zipcode) document.getElementById('dc-buyer-zip').value = profile.zipcode;
          if (profile.applicationRate) document.getElementById('dc-apprate').value = profile.applicationRate;
        });
      });

      var calcBtn = document.getElementById('dc-calc-btn');
      if (calcBtn) {
        calcBtn.addEventListener('click', function() {
          var buyerZip = document.getElementById('dc-buyer-zip').value.trim();
          var tonnes = parseFloat(document.getElementById('dc-tonnes').value) || listing.minOrderTonnes;
          var appRate = parseFloat(document.getElementById('dc-apprate').value) || 0;
          var spreadCost = parseFloat(document.getElementById('dc-spread').value) || 60;

          if (!buyerZip || buyerZip.length !== 5) {
            alert('Please enter a valid 5-digit ZIP code.');
            return;
          }
          if (!listing.producerZip) {
            alert('Producer ZIP not available for this listing.');
            return;
          }

          calcBtn.textContent = 'Calculating...';
          calcBtn.disabled = true;

          window.DeliveredCost.calc({
            producerZip: listing.producerZip,
            buyerZip: buyerZip,
            pricePerTonne: listing.pricePerTonne,
            tonnes: tonnes,
            applicationRate: appRate,
            spreadCostPerTonne: spreadCost
          }).then(function(r) {
            document.getElementById('dc-material').textContent = '$' + Math.round(r.materialCost).toLocaleString();
            document.getElementById('dc-transport').textContent = '$' + Math.round(r.transportCost).toLocaleString();
            document.getElementById('dc-distance').textContent = r.distance + ' mi · ' + r.truckloads + ' truckload' + (r.truckloads > 1 ? 's' : '');
            document.getElementById('dc-application').textContent = '$' + Math.round(r.applicationCost).toLocaleString();
            document.getElementById('dc-total').textContent = '$' + Math.round(r.totalCost).toLocaleString();
            var perAcreEl = document.getElementById('dc-per-acre');
            perAcreEl.textContent = r.costPerAcre ? '$' + Math.round(r.costPerAcre).toLocaleString() + ' / acre' : '';
            document.getElementById('dc-result').style.display = 'block';
            calcBtn.textContent = 'Recalculate';
            calcBtn.disabled = false;
          }).catch(function() {
            alert('Could not calculate — check ZIP codes and try again.');
            calcBtn.textContent = 'Calculate';
            calcBtn.disabled = false;
          });
        });
      }
      }); // end DOMContentLoaded
    })();
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
