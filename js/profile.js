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

  function htmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  function getSortTime(value) {
    if (!value) return 0;
    if (value.toDate && typeof value.toDate === "function") {
      return value.toDate().getTime();
    }
    var parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function getDealStatusClass(status) {
    if (status === "Open") return "deal-status-open";
    if (status === "Agreed") return "deal-status-agreed";
    if (status === "Expired") return "deal-status-expired";
    if (status === "Cancelled") return "deal-status-cancelled";
    return "deal-status-expired";
  }

  function isClosingSoon(expiryDate, status) {
    if (status !== "Open" || !expiryDate) return false;
    var expiry = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate);
    var ms = expiry.getTime() - Date.now();
    return ms > 0 && ms <= 48 * 60 * 60 * 1000;
  }

  async function loadDealRooms() {
    var wrap = document.getElementById("dealrooms-wrap");
    if (!wrap) return;

    try {
      var snapshots = await Promise.all([
        db.collection("deals").where("buyerUID", "==", state.user.uid).get(),
        db.collection("deals").where("producerUID", "==", state.user.uid).get()
      ]);

      var byId = {};
      snapshots.forEach(function (snapshot) {
        snapshot.forEach(function (doc) {
          var data = doc.data() || {};
          byId[doc.id] = { id: doc.id, data: data };
        });
      });

      var deals = Object.keys(byId)
        .map(function (id) {
          return byId[id];
        })
        .sort(function (a, b) {
          return getSortTime(b.data.createdAt) - getSortTime(a.data.createdAt);
        });

      if (!deals.length) {
        wrap.innerHTML = '<p class="empty-state">No deal rooms yet.</p>';
        return;
      }

      wrap.innerHTML = deals
        .map(function (deal) {
          var d = deal.data;
          var status = d.status || "Open";
          var otherParty = state.user.uid === d.buyerUID ? (d.producerName || "-") : (d.buyerName || "-");
          var roundX = Number(d.roundsUsed || 0) + 1;
          var roundY = Number(d.maxRounds || (d.complexity && d.complexity.maxRounds) || 1);
          var badgeClass = getDealStatusClass(status);
          var soon = isClosingSoon(d.expiryDate, status);
          var actionText = status === "Open" ? "Enter deal room" : (status === "Agreed" ? "View deal" : "");
          var actionClass = status === "Open" ? "btn btn-primary" : "btn btn-secondary";
          var actionHtml = actionText
            ? '<a class="' + actionClass + '" href="dealroom.html?id=' + encodeURIComponent(deal.id) + '">' + htmlEscape(actionText) + "</a>"
            : "";

          return (
            '<div class="deal-row">' +
            '<div class="deal-left-meta">' +
            '<span class="deal-chip">' + htmlEscape(d.feedstock || "-") + "</span>" +
            "<strong>" + htmlEscape(otherParty) + "</strong>" +
            '<span class="deal-round">Round ' + roundX + "/" + roundY + "</span>" +
            "</div>" +
            '<div class="deal-right-meta">' +
            '<span class="deal-status ' + badgeClass + '">' + htmlEscape(status) + "</span>" +
            (soon ? '<span class="deal-close-warning">Closes soon</span>' : "") +
            actionHtml +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    } catch (error) {
      wrap.innerHTML = '<p class="empty-state">Unable to load deal rooms right now.</p>';
    }
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

  function setStatus(id, message, isError) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.className = "status-message " + (isError ? "status-error" : "status-success");
  }

  function getVerificationProgressText(profile) {
    var stats = (profile && profile.verifiedStats) || {};
    var total = Number(stats.totalTransactions || 0);
    var confirmationRate = Number(stats.confirmationRate || 0);
    var averageRating = Number(stats.averageRating || 0);

    if (profile && profile.verified === true) {
      return confirmationRate + "% delivery confirmation · " + averageRating.toFixed(1) + " avg rating · " + total + " transactions";
    }

    if (total < 3) {
      return "Verified status: " + total + "/3 transactions completed";
    }
    if (confirmationRate < 90) {
      return "Verified status: Delivery confirmation rate below 90%";
    }
    if (averageRating < 4) {
      return "Verified status: Average rating below 4.0";
    }
    return "Verified status: Requirements in progress";
  }

  function renderAccountInfo() {
    var profile = state.profile || {};
    var grid = document.getElementById("account-info-grid");
    var editing = state.editingAccount;
    var isVerified = window.userVerified === true || profile.verified === true;
    var verifiedBadge = isVerified && typeof window.renderVerifiedBadge === "function"
      ? window.renderVerifiedBadge()
      : "";
    var verificationText = getVerificationProgressText(profile);

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
      '<div style="margin-top:var(--space-2);display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;">' +
      verifiedBadge +
      '</div>' +
      '<p style="margin-top:var(--space-2);color:var(--color-text-muted);font-size:var(--font-size-sm);">' + htmlEscape(verificationText) + "</p>" +
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
    } catch (error) {
      setStatus("prefs-status", "Failed to save preferences.", true);
    }
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
    await loadTransactions();
    await loadDealRooms();
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

    document.getElementById("logout-btn").addEventListener("click", function () {
      auth.signOut().then(function () {
        window.location.href = "index.html";
      });
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
