(function () {
  var CROP_OPTIONS = [
    "Almond Orchards",
    "Walnut Orchards",
    "Pistachio Orchards",
    "Grapevine / Vineyards",
    "Corn",
    "Wheat",
    "Rice",
    "Row Crops",
    "Pasture",
    "Forestry"
  ];

  var GOAL_OPTIONS = [
    "Improve Water Retention",
    "Increase Nutrient Holding",
    "Raise Soil pH",
    "Reduce Fertilizer Use",
    "Carbon Sequestration"
  ];

  var state = {
    user: null,
    profile: null,
    editingAccount: false,
    cropSelect: null,
    goalSelect: null,
    repeatTarget: null
  };

  function toDateLabel(value) {
    if (!value) {
      return "-";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function toNumber(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      var cleaned = value.replace(/[$,]/g, "").trim();
      if (!cleaned) return 0;
      var parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function toCurrency(value, fractionDigits) {
    return Number(value || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    });
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

    var key = Object.keys(buckets).find(function (bucketKey) {
      return buckets[bucketKey].indexOf(stateName) !== -1;
    });

    return key || "";
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

    var key = Object.keys(regionBuckets).find(function (bucketKey) {
      return regionBuckets[bucketKey].indexOf(regionName) !== -1;
    });

    return key || "";
  }

  function isBroadRegionMatch(stateName, listingRegion) {
    var stateBucket = getStateRegionBucket(stateName);
    var listingBucket = getListingRegionBucket(listingRegion);
    return stateBucket && listingBucket && stateBucket === listingBucket;
  }

  function scoreListingWithProfile(listing, profile) {
    var score = 0;
    var reasons = [];

    var cropTypes = Array.isArray(profile.cropTypes) ? profile.cropTypes : [];
    var cropMatches = cropTypes.filter(function (crop) {
      return listing.suitableFor.indexOf(crop) !== -1;
    });

    if (cropMatches.length > 0) {
      score += 30;
      reasons.push("suitable for " + cropMatches[0].toLowerCase());
    }

    var soilPH = profile.soilPH || "";
    if (soilPH === "Below 5.5" && listing.scorecard.pH > 7.0) {
      score += 20;
      reasons.push("alkaline profile aligns with low-pH soil");
    } else if (soilPH === "5.5–6.5" && listing.scorecard.pH >= 6.5 && listing.scorecard.pH <= 8.0) {
      score += 20;
      reasons.push("pH compatibility in your target range");
    } else if (soilPH === "Above 8.5" && listing.scorecard.pH < 7.5) {
      score += 10;
      reasons.push("more neutral pH for high-alkaline soils");
    } else {
      score += 10;
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

    var goals = Array.isArray(profile.goals) ? profile.goals : [];
    if (goals.indexOf("Improve Water Retention") !== -1 && listing.scorecard.surfaceArea >= 300) {
      score += 5;
      reasons.push("high surface area for water retention");
    }
    if (goals.indexOf("Increase Nutrient Holding") !== -1 && listing.scorecard.surfaceArea >= 280) {
      score += 5;
      reasons.push("porosity supports nutrient holding");
    }
    if (goals.indexOf("Raise Soil pH") !== -1 && listing.scorecard.pH >= 7.0) {
      score += 5;
      reasons.push("alkaline profile supports pH correction");
    }
    if (goals.indexOf("Reduce Fertilizer Use") !== -1 && listing.scorecard.surfaceArea >= 280) {
      score += 5;
      reasons.push("supports nutrient retention efficiency");
    }
    if (goals.indexOf("Carbon Sequestration") !== -1 && listing.scorecard.carbonContent >= 70) {
      score += 5;
      reasons.push("strong sequestration potential");
    }

    if (profile.annualVolume && listing.availableTonnes >= Number(profile.annualVolume)) {
      score += 15;
      reasons.push("available in sufficient volume");
    }

    if (
      String(profile.organicCertified || "").toLowerCase() === "yes" &&
      (listing.certifications.indexOf("OMRI Listed") !== -1 || listing.certifications.indexOf("California Organic") !== -1)
    ) {
      score += 15;
      reasons.push("organic-compatible certification");
    }

    if (isBroadRegionMatch(profile.state, listing.region)) {
      score += 10;
      reasons.push("regional proximity advantage");
    } else {
      score += 5;
    }

    return {
      listing: listing,
      score: Math.min(score, 100),
      explanation: reasons.length
        ? "Strong match - " + reasons.join(", ") + "."
        : "Possible match based on baseline compatibility."
    };
  }

  function setStatus(id, message, isError) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.className = "status-message " + (isError ? "status-error" : "status-success");
  }

  function renderAccountInfo() {
    var profile = state.profile || {};
    var grid = document.getElementById("account-info-grid");
    var editing = state.editingAccount;

    grid.innerHTML =
      '<div class="info-item"><label>Full Name</label>' +
      (editing
        ? '<input id="profile-name" value="' + (profile.name || "") + '">' 
        : '<span>' + (profile.name || "-") + '</span>') +
      '</div>' +
      '<div class="info-item"><label>Business Name</label>' +
      (editing
        ? '<input id="profile-business" value="' + (profile.businessName || "") + '">' 
        : '<span>' + (profile.businessName || "-") + '</span>') +
      '</div>' +
      '<div class="info-item"><label>Email</label><span>' + (profile.email || state.user.email || "-") + '</span></div>' +
      '<div class="info-item"><label>Role</label><span class="role-badge">' + ((profile.role || "").toLowerCase() === "seller" ? "Seller" : "Buyer") + '</span></div>' +
      '<div class="info-item"><label>County</label>' +
      (editing
        ? '<input id="profile-county" value="' + (profile.county || "") + '">' 
        : '<span>' + (profile.county || "-") + '</span>') +
      '</div>' +
      '<div class="info-item"><label>State</label>' +
      (editing
        ? '<input id="profile-state" value="' + (profile.state || "") + '">' 
        : '<span>' + (profile.state || "-") + '</span>') +
      '</div>';

    document.getElementById("edit-account-btn").hidden = editing;
    document.getElementById("save-account-btn").hidden = !editing;
  }

  async function saveAccountInfo() {
    var updates = {
      name: document.getElementById("profile-name").value.trim(),
      businessName: document.getElementById("profile-business").value.trim(),
      county: document.getElementById("profile-county").value.trim(),
      state: document.getElementById("profile-state").value.trim()
    };

    try {
      await db.collection("users").doc(state.user.uid).update(updates);
      Object.assign(state.profile, updates);
      state.editingAccount = false;
      renderAccountInfo();
      setStatus("account-status", "Profile updated.", false);
    } catch (error) {
      setStatus("account-status", "Failed to save profile changes.", true);
    }
  }

  function initPreferencesSection() {
    var isBuyer = (state.profile.role || "buyer").toLowerCase() === "buyer";
    document.getElementById("prefs-section").hidden = !isBuyer;
    document.getElementById("matches-section").hidden = !isBuyer;
    document.getElementById("scheduled-section").hidden = !isBuyer;

    if (!isBuyer) {
      return;
    }

    var cropEl = document.getElementById("ms-profile-crops");
    var goalEl = document.getElementById("ms-profile-goals");

    makeMultiSelect(cropEl, CROP_OPTIONS, "Select crop types");
    makeMultiSelect(goalEl, GOAL_OPTIONS, "Select goals");

    state.cropSelect = cropEl;
    state.goalSelect = goalEl;

    cropEl.setValue(Array.isArray(state.profile.cropTypes) && state.profile.cropTypes.length ? state.profile.cropTypes : ["All"]);
    goalEl.setValue(Array.isArray(state.profile.goals) && state.profile.goals.length ? state.profile.goals : ["All"]);

    document.getElementById("profile-soil").value = state.profile.soilPH || "Not sure";
    document.getElementById("profile-timeline").value = state.profile.timeline || "Planning only";
  }

  async function savePreferences() {
    var cropTypes = state.cropSelect.getValue().filter(function (value) { return value !== "All"; });
    var goals = state.goalSelect.getValue().filter(function (value) { return value !== "All"; });
    var soilPH = document.getElementById("profile-soil").value;
    var timeline = document.getElementById("profile-timeline").value;

    var updates = {
      cropTypes: cropTypes,
      goals: goals,
      soilPH: soilPH,
      timeline: timeline
    };

    try {
      await db.collection("users").doc(state.user.uid).update(updates);
      Object.assign(state.profile, updates);
      setStatus("prefs-status", "Preferences saved.", false);
      renderMatches();
    } catch (error) {
      setStatus("prefs-status", "Failed to save preferences.", true);
    }
  }

  function renderMatches() {
    var wrap = document.getElementById("matched-listings");
    var empty = document.getElementById("matches-empty");

    if (!(state.profile.cropTypes && state.profile.cropTypes.length) && !state.profile.soilPH && !(state.profile.goals && state.profile.goals.length)) {
      wrap.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS : [];
    var ranked = listings
      .map(function (listing) {
        return scoreListingWithProfile(listing, state.profile);
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 6);

    wrap.innerHTML = ranked
      .map(function (item) {
        var listing = item.listing;
        var certText = listing.certifications.length ? listing.certifications.join(", ") : "-";
        var suitableText = listing.suitableFor.slice(0, 3).join(", ");

        return (
          '<article class="listing-card">' +
          '<h3>' + listing.producerName + '</h3>' +
          '<p class="listing-meta">' + listing.county + ' County · ' + listing.region + '</p>' +
          '<span class="feedstock-tag">' + listing.feedstock + '</span>' +
          '<p><strong>$' + listing.pricePerTonne + '</strong> /tonne</p>' +
          '<p class="listing-meta">Available: ' + listing.availableTonnes + ' tonnes</p>' +
          '<p class="listing-meta">Availability: ' + toDateLabel(listing.availableFrom) + ' - ' + toDateLabel(listing.availableUntil) + '</p>' +
          '<p class="listing-meta">C: ' + listing.scorecard.carbonContent.toFixed(1) + '% · pH: ' + listing.scorecard.pH.toFixed(1) + ' · ' + listing.scorecard.surfaceArea + ' m²/g</p>' +
          '<p class="listing-meta">Certifications: ' + certText + '</p>' +
          '<p class="listing-meta">Suitable for: ' + (suitableText || "-") + '</p>' +
          '<p class="listing-meta">' + listing.transactionsCompleted + ' transactions · ' + (listing.averageRating == null ? "No rating yet" : listing.averageRating.toFixed(1)) + '</p>' +
          '<p class="match-score-label">Match score: ' + item.score + '%</p>' +
          '<div class="match-score-bar"><div class="match-score-fill" style="width:' + item.score + '%"></div></div>' +
          '<p class="match-explanation">' + item.explanation + '</p>' +
          '<a class="btn btn-primary" href="listing.html?id=' + listing.id + '">View & Inquire</a>' +
          '</article>'
        );
      })
      .join("");
  }

  function normalizeTransaction(tx, id) {
    return {
      id: id,
      date: tx.date || tx.dateInitiated || tx.createdAt || tx["Date Initiated"] || tx["Date Applied"] || null,
      producer: tx.producerName || tx.producer || tx["Producer"] || tx["Feedstock"] || "-",
      feedstock: tx.feedstock || tx["Feedstock"] || "-",
      tonnes: tx.tonnes || tx["Tonnes"] || "-",
      totalValue: tx.totalValue || tx["Total Value"] || "-",
      transactionValue: tx.transactionValue || tx["Transaction Value"] || "",
      commission: tx.commission || tx["Commission"] || "-",
      status: tx.status || tx["Status"] || "-",
      listingID: tx.listingID || tx.listing_id || tx["Listing ID"] || "",
      pricePerTonne: tx.pricePerTonne || tx["Price Per Tonne"] || "",
      producerName: tx.producerName || tx.producer || tx["Producer"] || "",
      buyerUID: tx.buyerUID || "",
      producerUID: tx.producerUID || ""
    };
  }

  function getTransactionValue(tx) {
    var direct = toNumber(tx.transactionValue);
    if (direct > 0) return direct;

    var total = toNumber(tx.totalValue);
    if (total > 0) return total;

    var tonnes = toNumber(tx.tonnes);
    if (!(tonnes > 0)) return 0;

    var explicitPrice = toNumber(tx.pricePerTonne);
    if (explicitPrice > 0) return tonnes * explicitPrice;

    var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS : [];
    var listing = listings.find(function (item) {
      return item.id === tx.listingID;
    });

    if (listing && Number(listing.pricePerTonne) > 0) {
      return tonnes * Number(listing.pricePerTonne);
    }

    return 0;
  }

  async function loadTransactions() {
    var wrap = document.getElementById("order-history-wrap");

    try {
      var results = await Promise.all([
        db.collection("transactions").where("buyerUID", "==", state.user.uid).get(),
        db.collection("transactions").where("producerUID", "==", state.user.uid).get()
      ]);

      var byId = {};
      results.forEach(function (snapshot) {
        snapshot.forEach(function (doc) {
          byId[doc.id] = normalizeTransaction(doc.data(), doc.id);
        });
      });

      var transactions = Object.keys(byId)
        .map(function (id) {
          return byId[id];
        })
        .sort(function (a, b) {
          return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
        });

      if (!transactions.length) {
        wrap.innerHTML = '<p class="empty-state">No transactions yet.</p>';
        return;
      }

      wrap.innerHTML =
        '<div class="table-shell"><table><thead><tr>' +
        '<th>Date</th><th>Producer</th><th>Feedstock</th><th>Tonnes</th><th>Total Value</th><th>Commission</th><th>Status</th><th>Actions</th>' +
        '</tr></thead><tbody>' +
        transactions
          .map(function (tx) {
            var actions = "";
            if (String(tx.status).toLowerCase() === "completed" && tx.listingID) {
              actions =
                '<button class="btn btn-secondary reorder-btn" data-listing-id="' + tx.listingID + '" data-producer="' + (tx.producerName || "") + '" data-feedstock="' + (tx.feedstock || "") + '" data-tonnes="' + (tx.tonnes || "") + '">Reorder</button> ' +
                '<button class="btn btn-primary schedule-btn" data-listing-id="' + tx.listingID + '" data-producer="' + (tx.producerName || "") + '" data-feedstock="' + (tx.feedstock || "") + '" data-tonnes="' + (tx.tonnes || "") + '">Schedule Repeat</button>';
            }

            return (
              (function () {
                var transactionValue = getTransactionValue(tx);
                var commissionLabel = "-";
                var totalValueLabel = tx.totalValue;

                if (transactionValue > 0) {
                  totalValueLabel = toCurrency(transactionValue, 0);
                  if (typeof calculateCommission === "function") {
                    commissionLabel = toCurrency(calculateCommission(transactionValue).commissionAmount, 2);
                  }
                }

                return (
              '<tr>' +
              '<td>' + toDateLabel(tx.date) + '</td>' +
              '<td>' + tx.producer + '</td>' +
              '<td>' + tx.feedstock + '</td>' +
              '<td>' + tx.tonnes + '</td>' +
              '<td>' + totalValueLabel + '</td>' +
              '<td>' + commissionLabel + '</td>' +
              '<td>' + tx.status + '</td>' +
              '<td>' + actions + '</td>' +
              '</tr>'
                );
              })()
            );
          })
          .join("") +
        '</tbody></table></div>';

      wrap.querySelectorAll(".reorder-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var payload = {
            listingID: btn.getAttribute("data-listing-id"),
            producerName: btn.getAttribute("data-producer"),
            feedstock: btn.getAttribute("data-feedstock"),
            tonnes: btn.getAttribute("data-tonnes")
          };

          sessionStorage.setItem("reorderPayload", JSON.stringify(payload));
          window.location.href = "listing.html?id=" + payload.listingID + "&reorder=true";
        });
      });

      wrap.querySelectorAll(".schedule-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.repeatTarget = {
            listingID: btn.getAttribute("data-listing-id"),
            producerName: btn.getAttribute("data-producer"),
            feedstock: btn.getAttribute("data-feedstock"),
            tonnes: Number(btn.getAttribute("data-tonnes") || 0)
          };
          openRepeatModal();
        });
      });
    } catch (error) {
      wrap.innerHTML = '<p class="empty-state">No transactions yet.</p>';
    }
  }

  async function loadScheduledOrders() {
    if ((state.profile.role || "buyer").toLowerCase() !== "buyer") {
      return;
    }

    var wrap = document.getElementById("scheduled-orders-wrap");

    try {
      var snapshot = await db.collection("scheduled_orders").where("userUID", "==", state.user.uid).get();
      var rows = [];
      snapshot.forEach(function (doc) {
        var data = doc.data() || {};
        rows.push({ id: doc.id, data: data });
      });

      if (!rows.length) {
        wrap.innerHTML = '<p class="empty-state">No scheduled orders yet.</p>';
        return;
      }

      wrap.innerHTML =
        '<div class="table-shell"><table><thead><tr><th>Producer</th><th>Feedstock</th><th>Tonnes</th><th>Frequency</th><th>Next Order Date</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
        rows
          .map(function (row) {
            return (
              '<tr>' +
              '<td>' + (row.data.producerName || "-") + '</td>' +
              '<td>' + (row.data.feedstock || "-") + '</td>' +
              '<td>' + (row.data.tonnes || "-") + '</td>' +
              '<td>' + (row.data.frequency || "-") + '</td>' +
              '<td>' + toDateLabel(row.data.nextOrderDate) + '</td>' +
              '<td>' + (row.data.status || "-") + '</td>' +
              '<td>' + ((row.data.status || "").toLowerCase() === "cancelled" ? "-" : '<button class="btn btn-secondary cancel-scheduled" data-id="' + row.id + '">Cancel</button>') + '</td>' +
              '</tr>'
            );
          })
          .join("") +
        '</tbody></table></div>';

      wrap.querySelectorAll(".cancel-scheduled").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          await db.collection("scheduled_orders").doc(btn.getAttribute("data-id")).update({ status: "Cancelled" });
          loadScheduledOrders();
        });
      });
    } catch (error) {
      wrap.innerHTML = '<p class="empty-state">No scheduled orders yet.</p>';
    }
  }

  function openRepeatModal() {
    document.getElementById("repeat-modal-backdrop").style.display = "flex";
  }

  function closeRepeatModal() {
    document.getElementById("repeat-modal-backdrop").style.display = "none";
  }

  async function scheduleRepeatOrder() {
    if (!state.repeatTarget) return;

    var frequency = document.getElementById("repeat-frequency").value;
    var nextOrderDate = document.getElementById("repeat-date").value;

    if (!nextOrderDate) {
      return;
    }

    await db.collection("scheduled_orders").add({
      userUID: state.user.uid,
      listingID: state.repeatTarget.listingID,
      producerName: state.repeatTarget.producerName,
      feedstock: state.repeatTarget.feedstock,
      tonnes: state.repeatTarget.tonnes,
      frequency: frequency,
      nextOrderDate: nextOrderDate,
      status: "Scheduled"
    });

    closeRepeatModal();
    loadScheduledOrders();
  }

  async function loadProfileAndRender(user) {
    state.user = user;

    var doc = await db.collection("users").doc(user.uid).get();
    state.profile = doc.exists ? doc.data() : { role: "buyer", email: user.email };

    if (!state.profile.email) {
      state.profile.email = user.email;
    }

    renderAccountInfo();
    initPreferencesSection();
    renderMatches();
    await loadTransactions();
    await loadScheduledOrders();
  }

  function initActions() {
    document.getElementById("edit-account-btn").addEventListener("click", function () {
      state.editingAccount = true;
      renderAccountInfo();
    });

    document.getElementById("save-account-btn").addEventListener("click", function () {
      saveAccountInfo();
    });

    document.getElementById("save-prefs-btn").addEventListener("click", function () {
      savePreferences();
    });

    document.getElementById("repeat-cancel").addEventListener("click", function () {
      closeRepeatModal();
    });

    document.getElementById("repeat-save").addEventListener("click", function () {
      scheduleRepeatOrder();
    });

    document.getElementById("repeat-modal-backdrop").addEventListener("click", function (event) {
      if (event.target.id === "repeat-modal-backdrop") {
        closeRepeatModal();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initActions();

    auth.onAuthStateChanged(function (user) {
      if (!user) {
        window.location.href = "auth.html";
        return;
      }

      loadProfileAndRender(user).catch(function () {
        window.location.href = "auth.html";
      });
    });
  });
})();
