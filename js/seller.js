(function () {
  var state = {
    user: null,
    profile: null
  };

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

  function formatCurrency(value, digits) {
    return Number(value || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatDate(value) {
    if (!value) return "-";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
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
    var diff = expiry.getTime() - Date.now();
    return diff > 0 && diff <= 48 * 60 * 60 * 1000;
  }

  function formatDateRange(fromISO, untilISO) {
    var from = new Date(fromISO);
    var until = new Date(untilISO);

    if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
      return (fromISO || "-") + " - " + (untilISO || "-");
    }

    return (
      from.toLocaleDateString("en-US", { month: "short", year: "numeric" }) +
      " – " +
      until.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    );
  }

  function renderStars(rating) {
    if (rating == null) return "";
    var rounded = Math.round(rating);
    var stars = "";
    var i;
    for (i = 0; i < 5; i += 1) {
      stars += i < rounded ? "★" : "☆";
    }
    return stars;
  }

  function updateNav() {
    var login = document.getElementById("nav-login");
    var profile = document.getElementById("nav-profile");
    var logout = document.getElementById("nav-logout");

    if (!state.user) {
      login.classList.remove("hidden");
      profile.classList.add("hidden");
      logout.classList.add("hidden");
      return;
    }

    login.classList.add("hidden");
    profile.classList.remove("hidden");
    logout.classList.remove("hidden");
  }

  function updateHero() {
    var slot = document.getElementById("hero-auth-slot");
    if (!slot) return;

    if (!state.user) {
      slot.innerHTML = '<a class="btn" href="auth.html?role=seller">Apply to list</a>';
      return;
    }

    slot.innerHTML =
      '<p style="color:white;margin-top:var(--space-4);">Welcome back, ' +
      htmlEscape((state.profile && state.profile.businessName) || "") +
      "</p>";
  }

  function getProducerCoordinate(record) {
    if (record.county && countyCoords[record.county]) {
      return countyCoords[record.county];
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
    var mapEl = document.getElementById("seller-map");
    if (!mapEl || typeof L === "undefined") return;

    var map = L.map("seller-map").setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    db.collection("listings")
      .get()
      .then(function (snapshot) {
        snapshot.forEach(function (doc) {
          var listing = doc.data() || {};
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
              "<strong>Producer Name:</strong> " + htmlEscape(listing.producerName || "-") + "<br>" +
              "<strong>Feedstock:</strong> " + htmlEscape(listing.feedstock || "-") + "<br>" +
              "<strong>Available Tonnes:</strong> " + htmlEscape(listing.availableTonnes || "-") + "<br>" +
              "<strong>Price Per Tonne:</strong> $" + htmlEscape(listing.pricePerTonne || "-") + "<br>" +
              "<strong>Transactions Completed:</strong> " + htmlEscape(listing.transactionsCompleted || 0)
            );
        });
      })
      .catch(function () {
        return null;
      });

    db.collection("users")
      .where("role", "==", "buyer")
      .get()
      .then(function (snapshot) {
        var tasks = [];

        snapshot.forEach(function (doc) {
          var user = doc.data() || {};
          if (!user.county || !user.state) return;

          tasks.push(
            geocodeLocation(user.county, user.state).then(function (coords) {
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
                  "<strong>Business Name:</strong> " + htmlEscape(user.businessName || "-") + "<br>" +
                  "<strong>Crop Types:</strong> " + htmlEscape(Array.isArray(user.cropTypes) ? user.cropTypes.join(", ") : "") + "<br>" +
                  "<strong>County:</strong> " + htmlEscape(user.county || "") + "<br>" +
                  "<strong>State:</strong> " + htmlEscape(user.state || "")
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

  function renderListingStatusSection() {
    var section = document.getElementById("listing-status-section");
    var container = document.getElementById("listing-status-content");
    if (!section || !container) return;

    if (!state.user || String((state.profile && state.profile.role) || "").toLowerCase() !== "seller") {
      section.classList.add("hidden");
      container.innerHTML = "";
      return;
    }

    section.classList.remove("hidden");

    db.collection("listings")
      .where("producerUID", "==", state.user.uid)
      .limit(1)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          container.innerHTML = '<p class="muted">Your application is under review. We will notify you when your listing goes live.</p>';
          return;
        }

        var doc = snapshot.docs[0];
        var listing = doc.data() || {};
        var status = String(listing.status || "Pending Review");
        var statusClass = "status-pending";
        if (status.toLowerCase() === "active") statusClass = "status-active";
        if (status.toLowerCase() === "rejected") statusClass = "status-rejected";

        var certs = Array.isArray(listing.certifications) ? listing.certifications : [];
        var suitableFor = Array.isArray(listing.suitableFor) ? listing.suitableFor : [];
        var ratingValue = listing.averageRating == null ? "No rating yet" : Number(listing.averageRating).toFixed(1);

        container.innerHTML =
          '<span class="status-badge ' + statusClass + '">' + htmlEscape(status) + "</span>" +
          '<article class="listing-card">' +
          '<h3>' + htmlEscape(listing.producerName || (state.profile.businessName || "Your Listing")) + "</h3>" +
          '<p class="listing-meta">' + htmlEscape((listing.county || "") + " County · " + (listing.region || "")) + "</p>" +
          '<span class="feedstock-tag">' + htmlEscape(listing.feedstock || "-") + "</span>" +
          '<p><strong>$' + htmlEscape(listing.pricePerTonne || "-") + '</strong> /tonne</p>' +
          '<p class="listing-meta">Available: ' + htmlEscape(listing.availableTonnes || "-") + " tonnes</p>" +
          '<p class="listing-meta">Availability: ' + htmlEscape(formatDateRange(listing.availableFrom, listing.availableUntil)) + "</p>" +
          '<p class="listing-meta">Certifications: ' + htmlEscape(certs.join(", ")) + "</p>" +
          '<p class="listing-meta">Suitable for: ' + htmlEscape(suitableFor.join(", ")) + "</p>" +
          '<p class="listing-meta">' + htmlEscape(listing.transactionsCompleted || 0) + " transactions · " + htmlEscape(ratingValue) + " " + htmlEscape(renderStars(listing.averageRating)) + "</p>" +
          '<p>' + htmlEscape(listing.description || "") + "</p>" +
          '<div style="display:flex;gap:var(--space-3);margin-top:var(--space-3);">' +
          '<button id="edit-listing-btn" class="btn btn-secondary" type="button">Edit</button>' +
          '<button id="save-listing-btn" class="btn btn-primary hidden" type="button">Save</button>' +
          "</div>" +
          '<div id="listing-edit-grid" class="edit-grid hidden">' +
          '<div><label for="edit-available">Available Tonnes</label><input id="edit-available" type="number" min="0" value="' + htmlEscape(listing.availableTonnes || 0) + '" /></div>' +
          '<div><label for="edit-price">Price Per Tonne</label><input id="edit-price" type="number" min="0" value="' + htmlEscape(listing.pricePerTonne || 0) + '" /></div>' +
          '<div><label for="edit-from">Available From</label><input id="edit-from" type="date" value="' + htmlEscape(listing.availableFrom || "") + '" /></div>' +
          '<div><label for="edit-until">Available Until</label><input id="edit-until" type="date" value="' + htmlEscape(listing.availableUntil || "") + '" /></div>' +
          '<div class="full-col"><label for="edit-description">Description</label><textarea id="edit-description">' + htmlEscape(listing.description || "") + '</textarea></div>' +
          "</div>" +
          '<p id="listing-status-msg" class="muted" style="margin-top:var(--space-3);"></p>' +
          "</article>";

        var editBtn = document.getElementById("edit-listing-btn");
        var saveBtn = document.getElementById("save-listing-btn");
        var editGrid = document.getElementById("listing-edit-grid");
        var statusMsg = document.getElementById("listing-status-msg");

        editBtn.addEventListener("click", function () {
          editGrid.classList.remove("hidden");
          saveBtn.classList.remove("hidden");
          editBtn.classList.add("hidden");
        });

        saveBtn.addEventListener("click", function () {
          var updates = {
            availableTonnes: Number(document.getElementById("edit-available").value || 0),
            pricePerTonne: Number(document.getElementById("edit-price").value || 0),
            availableFrom: document.getElementById("edit-from").value,
            availableUntil: document.getElementById("edit-until").value,
            description: document.getElementById("edit-description").value
          };

          db.collection("listings")
            .doc(doc.id)
            .update(updates)
            .then(function () {
              statusMsg.textContent = "Listing updated.";
              renderListingStatusSection();
            })
            .catch(function () {
              statusMsg.textContent = "Could not save listing updates.";
            });
        });
      })
      .catch(function () {
        container.innerHTML = '<p class="muted">Unable to load listing status right now.</p>';
      });
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

  function renderTransactionsSection() {
    var section = document.getElementById("transaction-section");
    var container = document.getElementById("transaction-content");
    if (!section || !container) return;

    if (!state.user) {
      section.classList.add("hidden");
      container.innerHTML = "";
      return;
    }

    section.classList.remove("hidden");

    db.collection("transactions")
      .where("producerUID", "==", state.user.uid)
      .get()
      .then(function (snapshot) {
        var rows = [];
        snapshot.forEach(function (doc) {
          rows.push(doc.data() || {});
        });

        if (!rows.length) {
          container.innerHTML = '<p class="muted">No transactions yet. Your first inquiry will appear here.</p>';
          return;
        }

        var completedCount = 0;
        var totalRevenue = 0;
        var totalCommission = 0;

        var bodyRows = rows
          .sort(function (a, b) {
            return new Date(b["Date Initiated"] || b.date || 0).getTime() - new Date(a["Date Initiated"] || a.date || 0).getTime();
          })
          .map(function (tx) {
            var date = tx["Date Initiated"] || tx.date || tx.createdAt || "";
            var buyer = tx.buyerName || tx.buyerBusinessName || tx.buyer || tx["Buyer"] || "-";
            var feedstock = tx.feedstock || tx["Feedstock"] || "-";
            var tonnes = toNumber(tx.tonnes || tx["Tonnes"]);
            var value = toNumber(tx.transactionValue || tx["Transaction Value"] || tx.totalValue || tx["Total Value"]);
            var status = String(tx.status || tx["Status"] || "-");
            var commission = typeof calculateCommission === "function" ? calculateCommission(value) : { rateDisplay: "-", commissionAmount: 0 };

            if (status.toLowerCase() === "completed") {
              completedCount += 1;
              totalRevenue += value;
              totalCommission += commission.commissionAmount;
            }

            return (
              "<tr>" +
              "<td>" + htmlEscape(formatDate(date)) + "</td>" +
              "<td>" + htmlEscape(buyer) + "</td>" +
              "<td>" + htmlEscape(feedstock) + "</td>" +
              "<td>" + htmlEscape(tonnes || "-") + "</td>" +
              "<td>" + htmlEscape(formatCurrency(value, 0)) + "</td>" +
              "<td>" + htmlEscape(commission.rateDisplay) + "</td>" +
              "<td>" + htmlEscape(formatCurrency(commission.commissionAmount, 2)) + "</td>" +
              "<td>" + htmlEscape(status) + "</td>" +
              "</tr>"
            );
          })
          .join("");

        container.innerHTML =
          '<div class="summary-row">' +
          '<article class="summary-card"><p>Total transactions completed</p><p>' + htmlEscape(completedCount) + '</p></article>' +
          '<article class="summary-card"><p>Total revenue</p><p>' + htmlEscape(formatCurrency(totalRevenue, 0)) + '</p></article>' +
          '<article class="summary-card"><p>Total commission paid</p><p>' + htmlEscape(formatCurrency(totalCommission, 2)) + '</p></article>' +
          "</div>" +
          '<div class="table-shell"><table><thead><tr>' +
          "<th>Date</th><th>Buyer</th><th>Feedstock</th><th>Tonnes</th><th>Transaction Value</th><th>Commission Rate</th><th>Commission Amount</th><th>Status</th>" +
          "</tr></thead><tbody>" +
          bodyRows +
          "</tbody></table></div>";
      })
      .catch(function () {
        container.innerHTML = '<p class="muted">Unable to load transactions right now.</p>';
      });
  }

  function renderDealRoomsSection() {
    var section = document.getElementById("dealrooms-section");
    var container = document.getElementById("dealrooms-content");
    if (!section || !container) return;

    if (!state.user || String((state.profile && state.profile.role) || "").toLowerCase() !== "seller") {
      section.classList.add("hidden");
      container.innerHTML = "";
      return;
    }

    section.classList.remove("hidden");

    db.collection("deals")
      .where("producerUID", "==", state.user.uid)
      .get()
      .then(function (snapshot) {
        var deals = [];
        snapshot.forEach(function (doc) {
          deals.push({ id: doc.id, data: doc.data() || {} });
        });

        deals.sort(function (a, b) {
          return getSortTime(b.data.createdAt) - getSortTime(a.data.createdAt);
        });

        if (!deals.length) {
          container.innerHTML = '<p class="muted">No deal rooms yet.</p>';
          return;
        }

        container.innerHTML = deals
          .map(function (deal) {
            var d = deal.data;
            var status = d.status || "Open";
            var roundX = Number(d.roundsUsed || 0) + 1;
            var roundY = Number(d.maxRounds || (d.complexity && d.complexity.maxRounds) || 1);
            var statusClass = getDealStatusClass(status);
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
              "<strong>" + htmlEscape(d.buyerName || "-") + "</strong>" +
              '<span class="deal-round">Round ' + roundX + "/" + roundY + "</span>" +
              "</div>" +
              '<div class="deal-right-meta">' +
              '<span class="deal-status ' + statusClass + '">' + htmlEscape(status) + "</span>" +
              (soon ? '<span class="deal-close-warning">Closes soon</span>' : "") +
              actionHtml +
              "</div>" +
              "</div>"
            );
          })
          .join("");
      })
      .catch(function () {
        container.innerHTML = '<p class="muted">Unable to load deal rooms right now.</p>';
      });
  }

  function initApplicationForm() {
    var form = document.getElementById("producer-form");
    if (!form) return;

    var feedstockEl = document.getElementById("ms-feedstock-producer");
    var certsEl = document.getElementById("ms-certs-producer");
    var feedstockInput = document.getElementById("feedstock");
    var certsInput = document.getElementById("producer-certs");
    var certDocsInput = document.getElementById("cert-docs");
    var fileList = document.getElementById("file-list");
    var selectedFiles = [];

    function valuesToString(values) {
      return (values || [])
        .filter(function (value) {
          return value !== "All";
        })
        .join(", ");
    }

    makeMultiSelect(
      feedstockEl,
      ["Almond Shell", "Walnut Shell", "Pistachio Shell", "Vine Pruning", "Wood Chip", "Forest Thinning", "Rice Husk", "Corn Stover", "Wheat Straw"],
      "Select feedstock"
    );

    makeMultiSelect(certsEl, ["OMRI Listed", "IBI Certified", "California Organic", "None Yet"], "Select certifications");

    function syncMulti() {
      var feedstockValues = feedstockEl.getValue().filter(function (value) {
        return value !== "All";
      });
      feedstockInput.value = feedstockValues[0] || "";
      certsInput.value = valuesToString(certsEl.getValue());
    }

    feedstockEl.addEventListener("change", syncMulti);
    certsEl.addEventListener("change", syncMulti);

    function syncFileInput() {
      var dataTransfer = new DataTransfer();
      selectedFiles.forEach(function (file) {
        dataTransfer.items.add(file);
      });
      certDocsInput.files = dataTransfer.files;
    }

    function renderFiles() {
      fileList.innerHTML = "";
      selectedFiles.forEach(function (file, index) {
        var tag = document.createElement("span");
        tag.className = "file-tag";
        tag.textContent = file.name;

        var remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "x";
        remove.addEventListener("click", function () {
          selectedFiles.splice(index, 1);
          syncFileInput();
          renderFiles();
        });

        tag.appendChild(remove);
        fileList.appendChild(tag);
      });
    }

    certDocsInput.addEventListener("change", function () {
      var incoming = Array.from(certDocsInput.files || []);
      incoming.forEach(function (file) {
        var exists = selectedFiles.some(function (item) {
          return item.name === file.name && item.size === file.size && item.lastModified === file.lastModified;
        });
        if (!exists) {
          selectedFiles.push(file);
        }
      });
      syncFileInput();
      renderFiles();
    });

    feedstockEl.setValue(["Almond Shell"]);
    certsEl.setValue(["None Yet"]);
    syncMulti();

    form.addEventListener("submit", handleProducerForm);
  }

  function updateSectionVisibility() {
    var appSection = document.getElementById("application-section");
    var listingSection = document.getElementById("listing-status-section");
    var txnSection = document.getElementById("transaction-section");
    var dealSection = document.getElementById("dealrooms-section");

    if (!state.user) {
      appSection.classList.remove("hidden");
      listingSection.classList.add("hidden");
      txnSection.classList.add("hidden");
      if (dealSection) {
        dealSection.classList.add("hidden");
      }
      return;
    }

    appSection.classList.add("hidden");
    txnSection.classList.remove("hidden");

    if (String((state.profile && state.profile.role) || "").toLowerCase() === "seller") {
      listingSection.classList.remove("hidden");
      if (dealSection) {
        dealSection.classList.remove("hidden");
      }
    } else {
      listingSection.classList.add("hidden");
      if (dealSection) {
        dealSection.classList.add("hidden");
      }
    }
  }

  function refreshLoggedInSections() {
    renderListingStatusSection();
    renderTransactionsSection();
    renderDealRoomsSection();
  }

  function initAuthWatcher() {
    auth.onAuthStateChanged(function (user) {
      state.user = user || null;

      if (!user) {
        state.profile = null;
        updateNav();
        updateHero();
        updateSectionVisibility();
        return;
      }

      db.collection("users")
        .doc(user.uid)
        .get()
        .then(function (doc) {
          state.profile = doc.exists ? doc.data() : null;
          updateNav();
          updateHero();
          updateSectionVisibility();
          refreshLoggedInSections();
        })
        .catch(function () {
          state.profile = null;
          updateNav();
          updateHero();
          updateSectionVisibility();
          refreshLoggedInSections();
        });
    });
  }

  function init() {
    var logoutBtn = document.getElementById("nav-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        auth.signOut().then(function () {
          window.location.href = "index.html";
        });
      });
    }

    initApplicationForm();
    initMap();
    initAuthWatcher();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
