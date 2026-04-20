(function () {
  var COUNTY_COORDS = {
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
    Yuba: [39.2, -121.4]
  };

  var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS.slice() : [];
  var sortState = {
    key: "availableTonnes",
    direction: "desc"
  };

  function valueOrNA(value) {
    return value == null ? "N/A" : value;
  }

  function averagePrice(items) {
    if (!items.length) {
      return 0;
    }

    var total = items.reduce(function (sum, item) {
      return sum + item.pricePerTonne;
    }, 0);

    return Math.round(total / items.length);
  }

  function initMap() {
    var map = L.map("map").setView([36.7783, -119.4179], 6);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    listings.forEach(function (listing) {
      var coords = COUNTY_COORDS[listing.county];
      if (!coords) {
        return;
      }

      var marker = L.circleMarker(coords, {
        radius: 12,
        color: "#3D6B45",
        fillColor: "#3D6B45",
        fillOpacity: 0.95,
        weight: 1
      }).addTo(map);

      var certifications = listing.certifications.join(", ");
      var rating = listing.averageRating == null ? "N/A" : listing.averageRating.toFixed(1);

      marker.bindPopup(
        "<strong>" + listing.producerName + "</strong><br>" +
          "Feedstock: " + listing.feedstock + "<br>" +
          "Available Tonnes: " + listing.availableTonnes + "<br>" +
          "Price Per Tonne: $" + listing.pricePerTonne + "<br>" +
          "Carbon Content: " + listing.scorecard.carbonContent.toFixed(1) + "% carbon<br>" +
          "Certifications: " + certifications + "<br>" +
          "Transactions Completed: " + listing.transactionsCompleted + "<br>" +
          "Average Rating: " + rating + "<br>" +
          "Available From to Available Until: " + listing.availableFrom + " to " + listing.availableUntil
      );
    });

    var statsControl = L.control({ position: "bottomleft" });
    statsControl.onAdd = function () {
      var container = L.DomUtil.create("div", "map-stats-panel");

      var totalListings = listings.length;
      var totalTonnes = listings.reduce(function (sum, item) {
        return sum + item.availableTonnes;
      }, 0);
      var avgPrice = averagePrice(listings);
      var uniqueCountyCount = new Set(
        listings.map(function (item) {
          return item.county;
        })
      ).size;

      container.innerHTML =
        "<p>Total Active Listings: " +
        totalListings +
        "</p>" +
        "<p>Total Available Tonnes: " +
        totalTonnes +
        "</p>" +
        "<p>Avg Price Per Tonne: $" +
        avgPrice +
        "</p>" +
        "<p>Counties Covered: " +
        uniqueCountyCount +
        "</p>";

      return container;
    };

    statsControl.addTo(map);
  }

  function getSortValue(item, key) {
    if (key === "rank") {
      return item.availableTonnes;
    }

    if (key === "carbonContent") {
      return item.scorecard.carbonContent;
    }

    if (key === "averageRating") {
      return item.averageRating == null ? -1 : item.averageRating;
    }

    return item[key];
  }

  function sortListings() {
    listings.sort(function (a, b) {
      var aVal = getSortValue(a, sortState.key);
      var bVal = getSortValue(b, sortState.key);

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortState.direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortState.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }

  function renderTable() {
    sortListings();

    var tbody = document.getElementById("listings-table-body");
    tbody.innerHTML = listings
      .map(function (item, idx) {
        var rating = item.averageRating == null ? "N/A" : item.averageRating.toFixed(1);
        return (
          '<tr class="' +
          (idx === 0 ? "top-row" : "") +
          '">' +
          "<td>" +
          (idx + 1) +
          "</td>" +
          "<td>" +
          item.producerName +
          "</td>" +
          "<td>" +
          item.county +
          "</td>" +
          "<td>" +
          item.feedstock +
          "</td>" +
          "<td>" +
          item.availableTonnes +
          "</td>" +
          "<td>$" +
          item.pricePerTonne +
          "</td>" +
          "<td>" +
          item.scorecard.carbonContent.toFixed(1) +
          "%</td>" +
          "<td>" +
          item.transactionsCompleted +
          "</td>" +
          "<td>" +
          valueOrNA(rating) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function bindSorting() {
    var headers = document.querySelectorAll("#listings-table th[data-key]");

    headers.forEach(function (header) {
      header.addEventListener("click", function () {
        var key = header.getAttribute("data-key");

        if (sortState.key === key) {
          sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
        } else {
          sortState.key = key;
          sortState.direction = "asc";
        }

        renderTable();
      });
    });
  }

  function mostFrequent(items, field) {
    var counts = {};
    var highest = 0;
    var winner = "-";

    items.forEach(function (item) {
      var value = item[field];
      counts[value] = (counts[value] || 0) + 1;

      if (counts[value] > highest) {
        highest = counts[value];
        winner = value;
      }
    });

    return winner;
  }

  function renderSignals() {
    if (!listings.length) {
      document.getElementById("signal-feedstock").textContent = "-";
      document.getElementById("signal-price-range").textContent = "-";
      document.getElementById("signal-county").textContent = "-";
      return;
    }

    var minPrice = Math.min.apply(
      null,
      listings.map(function (item) {
        return item.pricePerTonne;
      })
    );

    var maxPrice = Math.max.apply(
      null,
      listings.map(function (item) {
        return item.pricePerTonne;
      })
    );

    document.getElementById("signal-feedstock").textContent = mostFrequent(listings, "feedstock");
    document.getElementById("signal-price-range").textContent = "$" + minPrice + " — $" + maxPrice + " per tonne";
    document.getElementById("signal-county").textContent = mostFrequent(listings, "county");
  }

  var db = firebase.firestore();

  function loadPendingListings() {
    var wrap = document.getElementById('pending-listings-wrap');
    var countEl = document.getElementById('pending-count');
    if (!wrap) return;

    db.collection('listings').where('verified', '==', false).orderBy('createdAt', 'desc').get()
      .then(function(snap) {
        if (snap.empty) {
          wrap.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm);padding:var(--space-4) 0">No listings pending review.</p>';
          if (countEl) countEl.textContent = '0 pending';
          return;
        }
        if (countEl) countEl.textContent = snap.size + ' pending';
        var rows = [];
        snap.forEach(function(doc) {
          var d = doc.data();
          var id = doc.id;
          var feedstocks = Array.isArray(d.feedstock) ? d.feedstock.join(', ') : (d.feedstock || '—');
          var created = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleDateString() : '—';
          rows.push(
            '<div id="pending-row-' + id + '" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-5);margin-bottom:var(--space-4)">' +
              '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap">' +
                '<div style="flex:1;min-width:240px">' +
                  '<div style="font-weight:700;font-size:var(--font-size-base)">' + (d.producerName || '—') + '</div>' +
                  '<div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-top:2px">' + (d.contactEmail || '—') + ' · ' + (d.state || '—') + ' · Submitted ' + created + '</div>' +
                  '<div style="margin-top:var(--space-3);display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3)">' +
                    '<div><div style="font-size:var(--font-size-xs);color:var(--color-text-muted);text-transform:uppercase;font-weight:600">Feedstock</div><div style="font-weight:600;font-size:var(--font-size-sm);margin-top:2px">' + feedstocks + '</div></div>' +
                    '<div><div style="font-size:var(--font-size-xs);color:var(--color-text-muted);text-transform:uppercase;font-weight:600">Price</div><div style="font-weight:600;font-size:var(--font-size-sm);margin-top:2px">$' + (d.pricePerTonne || '—') + '/t</div></div>' +
                    '<div><div style="font-size:var(--font-size-xs);color:var(--color-text-muted);text-transform:uppercase;font-weight:600">Volume</div><div style="font-weight:600;font-size:var(--font-size-sm);margin-top:2px">' + (d.availableTonnes || '—') + 't</div></div>' +
                    '<div><div style="font-size:var(--font-size-xs);color:var(--color-text-muted);text-transform:uppercase;font-weight:600">EIN</div><div style="font-weight:600;font-size:var(--font-size-sm);margin-top:2px">' + (d.ein || '—') + '</div></div>' +
                  '</div>' +
                  (d.description ? '<div style="margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--color-text-secondary);line-height:1.6">' + d.description.slice(0, 200) + (d.description.length > 200 ? '…' : '') + '</div>' : '') +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:var(--space-2);min-width:140px">' +
                  '<button onclick="approveListing(&quot;' + id + '&quot;, &quot;' + (d.contactEmail || '') + '&quot;)" style="padding:var(--space-2) var(--space-4);background:var(--color-accent);color:white;border:none;border-radius:var(--radius-md);font-size:var(--font-size-sm);font-weight:600;cursor:pointer">✓ Level 1 Verify</button>' +
                  '<button onclick="rejectListing(&quot;' + id + '&quot;, &quot;' + (d.contactEmail || '') + '&quot;)" style="padding:var(--space-2) var(--space-4);background:none;border:1px solid #DC2626;color:#DC2626;border-radius:var(--radius-md);font-size:var(--font-size-sm);font-weight:600;cursor:pointer">✗ Remove</button>' +
                '</div>' +
              '</div>' +
              '<div id="pending-status-' + id + '" style="margin-top:var(--space-2);font-size:var(--font-size-sm)"></div>' +
            '</div>'
          );
        });
        wrap.innerHTML = rows.join('');
      })
      .catch(function(err) {
        wrap.innerHTML = '<p style="color:#DC2626;font-size:var(--font-size-sm)">Error loading listings: ' + err.message + '</p>';
      });
  }

  window.approveListing = function(id, email) {
    var statusEl = document.getElementById('pending-status-' + id);
    if (statusEl) { statusEl.textContent = 'Approving…'; statusEl.style.color = 'var(--color-text-muted)'; }
    var listingRef = db.collection('listings').doc(id);
    var listingData = null;
    listingRef.get()
      .then(function(doc) {
        listingData = doc.exists ? doc.data() : null;
        return listingRef.update({
          status: 'active',
          verified: true,
          verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
          verifiedLevel1: true,
          verifiedLevel1At: firebase.firestore.FieldValue.serverTimestamp()
        });
      })
      .then(function() {
        if (!listingData || !listingData.producerUID) return null;
        return db.collection('users').doc(listingData.producerUID).get().then(function(userDoc) {
          if (!userDoc.exists) return null;
          var userData = userDoc.data() || {};
          var stats = userData.verifiedStats || {};
          var txCount = Number(stats.transactionsCompleted || stats.totalTransactions || userData.transactionsCompleted || 0);
          var avgRating = Number(stats.averageRating || userData.averageRating || 0);
          if (txCount >= 3 && avgRating >= 4.0) {
            return listingRef.update({
              verifiedLevel2: true,
              verifiedLevel2At: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
          return null;
        });
      })
      .then(function() {
        var row = document.getElementById('pending-row-' + id);
        if (row) {
          row.style.opacity = '0.5';
          row.style.pointerEvents = 'none';
        }
        if (statusEl) { statusEl.textContent = '✓ Level 1 verified — listing is now live.'; statusEl.style.color = 'var(--color-accent)'; }
        var countEl = document.getElementById('pending-count');
        if (countEl) {
          var n = parseInt(countEl.textContent) || 1;
          countEl.textContent = Math.max(0, n - 1) + ' pending';
        }
      })
      .catch(function(err) {
        if (statusEl) { statusEl.textContent = 'Failed: ' + err.message; statusEl.style.color = '#DC2626'; }
      });
  };

  window.rejectListing = function(id, email) {
    var reason = prompt('Optional: enter a reason for rejection (shown in status, not emailed yet):');
    if (reason === null) return;
    var statusEl = document.getElementById('pending-status-' + id);
    if (statusEl) { statusEl.textContent = 'Rejecting…'; statusEl.style.color = 'var(--color-text-muted)'; }
    db.collection('listings').doc(id).update({
      status: 'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
      rejectionReason: reason || 'Did not meet listing requirements'
    })
      .then(function() {
        var row = document.getElementById('pending-row-' + id);
        if (row) {
          row.style.opacity = '0.5';
          row.style.pointerEvents = 'none';
        }
        if (statusEl) { statusEl.textContent = '✗ Rejected' + (reason ? ' — ' + reason : '') + '.'; statusEl.style.color = '#DC2626'; }
        var countEl = document.getElementById('pending-count');
        if (countEl) {
          var n = parseInt(countEl.textContent) || 1;
          countEl.textContent = Math.max(0, n - 1) + ' pending';
        }
      })
      .catch(function(err) {
        if (statusEl) { statusEl.textContent = 'Failed: ' + err.message; statusEl.style.color = '#DC2626'; }
      });
  };

  document.addEventListener("DOMContentLoaded", function () {
    initMap();
    bindSorting();
    renderTable();
    renderSignals();
    loadPendingListings();
  });
})();
