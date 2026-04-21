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

  function toDateOnly(value) {
    if (!value) return null;
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function daysBetween(start, end) {
    return Math.round((end - start) / 86400000);
  }

  function getAvailabilityMeta(listing) {
    var today = toDateOnly(new Date());
    var from = toDateOnly(listing.availableFrom);
    var until = toDateOnly(listing.availableUntil);
    var indicatorText = "Availability on request";
    var indicatorClass = "muted";
    if (from && from > today) {
      var daysUntil = daysBetween(today, from);
      if (daysUntil <= 30) {
        indicatorText = "🕐 Available in " + daysUntil + " day" + (daysUntil !== 1 ? "s" : "");
        indicatorClass = "warn";
      } else {
        indicatorText = "Available " + from.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      }
    } else if (until) {
      var daysLeft = daysBetween(today, until);
      if (daysLeft <= 14) {
        indicatorText = "⚠ Available now · Expires in " + Math.max(daysLeft, 0) + " day" + (Math.max(daysLeft, 0) !== 1 ? "s" : "");
        indicatorClass = "warn";
      } else {
        indicatorText = "✓ Available now · Until " + formatDate(until);
        indicatorClass = "ready";
      }
    }

    var fillPercent = 100;
    if (from && until && until > from) {
      if (today <= from) fillPercent = 0;
      else if (today >= until) fillPercent = 100;
      else fillPercent = Math.max(0, Math.min(100, Math.round(((today - from) / (until - from)) * 100)));
    }

    var timeline =
      '<div class="availability-timeline">' +
      '<div class="availability-timeline-head">' +
      '<div><span class="availability-timeline-label">From</span><strong>' + (from ? formatDate(from) : 'Now') + '</strong></div>' +
      '<div style="text-align:right"><span class="availability-timeline-label">Until</span><strong>' + (until ? formatDate(until) : 'Open ended') + '</strong></div>' +
      '</div>' +
      '<div class="availability-bar"><div class="availability-bar-fill" style="width:' + fillPercent + '%"></div></div>' +
      '<div class="availability-indicator ' + indicatorClass + '">' + indicatorText + '</div>' +
      '</div>';

    return {
      summary: '<div class="availability-indicator ' + indicatorClass + '">' + indicatorText + '</div>',
      timeline: timeline
    };
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

  function getVerificationDisplay(listing) {
    if (listing.verifiedLevel1 && listing.verifiedLevel2) {
      return {
        badge: '<span class="verification-badge verification-badge--trusted">✓✓ Trusted Seller</span>',
        explanation: 'Reviewed by the platform and earned trusted status through repeat transactions and strong ratings.'
      };
    }
    if (listing.verifiedLevel1 || (listing.verified === true && !listing.verifiedLevel1)) {
      return {
        badge: '<span class="verification-badge verification-badge--reviewed">✓ Reviewed</span>',
        explanation: 'Reviewed by the platform for basic listing and seller information.'
      };
    }
    if (listing.verified === false) {
      return {
        badge: '<span class="verification-badge verification-badge--unverified">Unverified</span>',
        explanation: 'This listing is live but has not yet been reviewed by the platform.'
      };
    }
    return null;
  }

  function renderNotFound(container) {
    if (window.UIUtils) {
      UIUtils.showError(container, "Listing not found.", function () { window.location.reload(); });
      return;
    }
    container.innerHTML = '<p class="not-found">Listing not found.</p>';
  }

  function getDemoListingById(id) {
    var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS : [];
    return listings.find(function (item) {
      return String(item.id) === String(id);
    }) || null;
  }

  function loadFirestoreListing(id) {
    return firebase.firestore().collection("listings").doc(id).get().then(function (doc) {
      if (!doc.exists) return null;
      var listing = doc.data() || {};
      listing.id = doc.id;
      return listing;
    });
  }

  function renderListing(container, listing) {
    var suitableList = Array.isArray(listing.suitableFor) ? listing.suitableFor : [];
    var suitableTags = suitableList
      .map(function (item) {
        return '<span class="suitable-tag">' + item + "</span>";
      })
      .join("");
    var headerClass = "listing-header";
    var headerStyle = "";
    if (listing.photos && listing.photos.length) {
      headerClass += " has-hero";
      headerStyle = ' style="background-image:url(' + listing.photos[0] + ')"';
    }
    var photoStrip = "";
    if (listing.photos && listing.photos.length > 1) {
      photoStrip = '<div class="listing-photo-strip">' +
        listing.photos.slice(1).map(function (p) {
          return '<button type="button" class="listing-photo-thumb" data-photo="' + p + '" style="border:none;background:none;padding:0;cursor:pointer"><img src="' + p + '" alt="Listing photo"></button>';
        }).join("") +
        "</div>";
    }

    var txCount = Number(listing.transactionsCompleted) || 0;
    var ratingLine = "No transactions yet";
    if (txCount > 0) {
      var rating = listing.averageRating == null ? "N/A" : listing.averageRating.toFixed(1);
      ratingLine =
        txCount +
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
    var listingVerification = getVerificationDisplay(listing);
    var availabilityMeta = getAvailabilityMeta(listing);

    var locationText = [listing.county ? listing.county + " County" : "", listing.state || ""].filter(Boolean).join(", ");

    container.innerHTML =
      '<div class="listing-shell">' +
      '<section class="' + headerClass + '"' + headerStyle + ">" +
      "<h1>" +
      listing.producerName +
      "</h1>" +
      '<p class="listing-location">' +
      locationText +
      "</p>" +
      '<div class="listing-top-meta"><span class="feedstock-tag">' +
      listing.feedstock +
      '</span><div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:var(--space-2)">' + getServiceAreaText(listing) + '</div></div>' +
      '<div class="headline-row">' +
      '<span class="headline-price">$' + listing.pricePerTonne + '</span><span class="headline-unit">/tonne</span>' +
      '<span class="headline-detail">' + listing.availableTonnes + ' t available &nbsp;·&nbsp; Min order: ' + listing.minOrderTonnes + ' t</span>' +
      '</div>' +
      '<div style="margin-top:var(--space-3)">' + availabilityMeta.summary + '</div>' +
      '<p class="rating-line">' +
      ratingLine +
      '<span style="margin-left:12px;color:' + (listing.certifications && listing.certifications.length > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)') + ';font-weight:500">' +
      (listing.certifications && listing.certifications.length > 0 ? '✓ Certified' : 'Not certified') +
      '</span></p>' +
      (listingVerification
        ? '<div style="margin-top:var(--space-3)">' +
            listingVerification.badge +
            '<div style="font-size:var(--font-size-xs);color:' + (headerClass.indexOf("has-hero") !== -1 ? 'rgba(255,255,255,0.88)' : 'var(--color-text-muted)') + ';margin-top:6px">' + listingVerification.explanation + '</div>' +
          '</div>'
        : '') +
      photoStrip +
      '<div id="top-card-actions"></div>' +
      '<div id="complete-loop-banner"></div>' +
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
      '<section class="description-section">' +
      '<h2>About this material</h2>' +
      '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-4)">' +
      suitableTags +
      '</div>' +
      '<p style="color:var(--color-text-secondary);line-height:1.7">' + listing.description + '</p>' +
      '</section>' +
      '<section class="availability-section"><h2>Delivery</h2><div class="availability-list">' +
      "<p>" + leadTimeText + "</p>" +
      '</div>' +
      availabilityMeta.timeline +
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
    if (window.UIUtils) UIUtils.showLoading(container, "Loading listing...");

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id") || "";
    var listingId = id;
    function bindListingInteractions(activeListing) {
      document.addEventListener('click', function (event) {
        var thumb = event.target.closest('.listing-photo-thumb');
        if (!thumb) return;
        var photo = thumb.getAttribute('data-photo');
        var hero = document.querySelector('.listing-header');
        if (!photo || !hero) return;
        hero.classList.add('has-hero');
        hero.style.backgroundImage = 'url(' + photo + ')';
      });
      var dealEntry = document.getElementById("deal-entry");
      if (dealEntry) {
        dealEntry.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm)">Loading...</p>';
      }

      auth.onAuthStateChanged(function (user) {
      var dealEntryEl = document.getElementById("deal-entry");
      if (!dealEntryEl) return;

      var currentListing = activeListing;
      if (!currentListing) return;

      var topCardActions = document.getElementById("top-card-actions");
      if (topCardActions) {
        if (user) {
          topCardActions.innerHTML =
            '<div style="display:flex;gap:var(--space-3);margin-top:var(--space-5)">' +
              '<a href="dealroom.html?listingId=' + currentListing.id + '" class="btn btn-primary">Make an offer</a>' +
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
          "</div>";
      } else {
        dealEntryEl.innerHTML =
          '<div style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-8);text-align:center">' +
            '<p style="color:var(--color-text-secondary);margin-bottom:var(--space-5)">Create a free account to make an offer or buy now.</p>' +
            '<a href="auth.html?role=buyer" class="btn btn-primary">Create free account</a>' +
            '<p style="margin-top:var(--space-3);font-size:var(--font-size-sm)"><a href="auth.html" style="color:var(--color-accent)">Already have an account? Log in</a></p>' +
          "</div>";
      }

      var profile = window.AuthState.profile;
      if (profile && profile.hasBiomassAvailable && profile._biomassListings && profile._biomassListings.length) {
        var banner = document.getElementById('complete-loop-banner');
        if (banner) {
          var biomassNames = profile._biomassListings.slice(0, 2).map(function(l) {
            return (l.biomassType || 'biomass').replace(/_/g, ' ');
          }).join(', ');
          banner.innerHTML =
            '<div style="margin-top:12px;padding:14px 18px;background:linear-gradient(135deg,#ECFDF5,#F0FDF4);border:1px solid #6EE7B7;border-radius:10px;display:flex;align-items:flex-start;gap:12px">' +
              '<span style="font-size:1.4rem;flex-shrink:0">🔄</span>' +
              '<div style="flex:1">' +
                '<div style="font-weight:700;font-size:14px;color:#065F46;margin-bottom:4px">Complete the loop — reduce your net transport cost</div>' +
                '<div style="font-size:13px;color:#047857;margin-bottom:10px">You have <strong>' + biomassNames + '</strong> listed on the Biomass Market. A producer picking up this biochar order could collect your biomass on the same run — cutting net transport cost for both parties.</div>' +
                '<a href="feedstock.html" style="font-size:12px;font-weight:600;color:#065F46;background:white;border:1px solid #6EE7B7;padding:5px 14px;border-radius:20px;text-decoration:none;display:inline-block">View your feedstock listings →</a>' +
              '</div>' +
            '</div>';
        }
      }
      });
    }

    var listing = getDemoListingById(id);
    if (listing) {
      renderListing(container, listing);
      bindListingInteractions(listing);
      return;
    }

    loadFirestoreListing(id).then(function (liveListing) {
      if (!liveListing) {
        renderNotFound(container);
        return;
      }
      renderListing(container, liveListing);
      bindListingInteractions(liveListing);
    }).catch(function () {
      renderNotFound(container);
    });
  });
})();
