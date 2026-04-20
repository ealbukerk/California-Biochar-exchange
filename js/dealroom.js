(function () {
  "use strict";

  var CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload";
  var CLOUDINARY_RAW_UPLOAD_URL = "https://api.cloudinary.com/v1_1/dz5so5fgy/raw/upload";
  var CLOUDINARY_PRESET = "biochar_certs";
  var activeDealId = null;
  var unsubs = [];
  var rendered = false;

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function getContainer() {
    return document.getElementById("dealroom-container");
  }

  function getListing(state) {
    if (state.listing) return state.listing;
    var deal = state.deal || {};
    if (deal.listingData) return deal.listingData;
    return (window.LISTINGS || []).find(function (item) { return String(item.id) === String(deal.listingId); }) || null;
  }

  function setError(message) {
    DealroomState.setError(message);
    DealroomState.setLoading(false);
    if (window.UIUtils) UIUtils.toast(message, "error", 0);
  }

  function showSimple(message) {
    var container = getContainer();
    if (!container) return;
    if (window.UIUtils) {
      UIUtils.showError(container, message);
      return;
    }
    container.innerHTML = '<div style="padding:40px;text-align:center"><p>' + message + "</p></div>";
  }

  function isLikelyScreenshot(file) {
    if (!file) return false;
    var type = String(file.type || "").toLowerCase();
    if (type !== "image/png" && type !== "image/jpeg") return false;
    var name = String(file.name || "");
    return /screenshot|screen shot|screen_shot/i.test(name) || /^IMG_\d+/i.test(name);
  }

  function hav(a, b) {
    var R = 3958.8;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function getZipCoords(zip) {
    if (!zip) return Promise.resolve(null);
    var cache = window._dealroomZipGeo = window._dealroomZipGeo || {};
    if (cache[zip]) return cache[zip];
    cache[zip] = fetch("https://api.zippopotam.us/us/" + zip)
      .then(function (r) {
        if (!r.ok) throw new Error("ZIP not found");
        return r.json();
      })
      .then(function (d) {
        return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) };
      })
      .catch(function () {
        delete cache[zip];
        return null;
      });
    return cache[zip];
  }

  function getBuyerSellerDistanceMiles(state, listing) {
    var buyerZip = state.profile && state.profile.zipcode;
    var sellerZip = listing && (listing.producerZip || listing.zipcode);
    if (!buyerZip || !sellerZip) return Promise.resolve(null);
    return Promise.all([getZipCoords(buyerZip), getZipCoords(sellerZip)]).then(function (coords) {
      if (!coords[0] || !coords[1]) return null;
      return hav(coords[0], coords[1]);
    });
  }

  function isSelfPickupEligible(state, listing, distanceMiles) {
    var maxRadius = Number((state.profile && state.profile.maxPickupRadius) || 50);
    return !!(state.profile && state.profile.canSelfPickup && distanceMiles != null && distanceMiles <= maxRadius);
  }

  function renderMessageBody(msg) {
    if (msg.type === "attachment" && msg.fileUrl) {
      var isImage = /^image\//i.test(msg.fileType || "");
      if (isImage) {
        return '<div class="deal-attachment-card"><img src="' + msg.fileUrl + '" alt="' + (msg.fileName || "Attachment") + '" class="deal-attachment-thumb" /><div class="deal-attachment-meta"><div class="deal-attachment-name">' + (msg.fileName || "Image attachment") + '</div><a class="deal-attachment-link" href="' + msg.fileUrl + '" target="_blank" rel="noopener">View</a></div></div>';
      }
      return '<div class="deal-attachment-card"><div class="deal-attachment-thumb" style="display:flex;align-items:center;justify-content:center;font-size:28px;background:var(--color-bg)">📄</div><div class="deal-attachment-meta"><div class="deal-attachment-name">' + (msg.fileName || "Document") + '</div><a class="deal-attachment-link" href="' + msg.fileUrl + '" target="_blank" rel="noopener">View</a></div></div>';
    }
    return msg.text || "";
  }

  function dealStatusPill(status) {
    var config = {
      Open: { bg: "#DBEAFE", color: "#1D4ED8", label: "Open" },
      Agreed: { bg: "#DCFCE7", color: "#166534", label: "Agreed" },
      PaymentInitiated: { bg: "#FEF3C7", color: "#B45309", label: "PaymentInitiated" },
      PaymentConfirmed: { bg: "#DCFCE7", color: "#166534", label: "PaymentConfirmed" },
      Complete: { bg: "#166534", color: "#FFFFFF", label: "Complete" },
      Expired: { bg: "#E5E7EB", color: "#4B5563", label: "Expired" }
    }[status] || { bg: "#E5E7EB", color: "#4B5563", label: status || "Unknown" };
    return '<span style="display:inline-flex;align-items:center;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;background:' + config.bg + ";color:" + config.color + '">' + config.label + "</span>";
  }

  function queueConfirmationEmails(dealId, deal, agreedTerms) {
    var deliveryLabel = agreedTerms.deliveryMethod === "buyer_collects" ? "Buyer collects" : agreedTerms.deliveryMethod === "producer_delivers" ? "Producer delivers" : "Third-party freight";
    var totalFormatted = "$" + (agreedTerms.totalValue || 0).toLocaleString();
    var commissionFormatted = "$" + (agreedTerms.commissionAmount || 0).toLocaleString();
    var dealUrl = "https://ealbukerk.github.io/California-Biochar-exchange/dealroom.html?id=" + dealId;
    var sharedBody = "Deal terms:\n  Feedstock: " + (deal.feedstock || "—") + "\n  Volume: " + (agreedTerms.volume || "—") + " tonnes\n  Price: $" + (agreedTerms.pricePerTonne || "—") + "/tonne\n  Total value: " + totalFormatted + "\n  Platform commission: " + commissionFormatted + "\n  Delivery method: " + deliveryLabel + "\n  Delivery date: " + (agreedTerms.deliveryDate || "To be arranged") + "\n\nView your deal room: " + dealUrl + "\n\nNext steps: Both parties must confirm delivery once the shipment is received. If you need to arrange freight, visit the Carriers page on the platform.\n\n— Biochar.market";
    var writes = [];
    if (deal.buyerEmail) writes.push(DealroomFirebase.queueEmail({ to: deal.buyerEmail, message: { subject: "Deal confirmed — " + (deal.feedstock || "Biochar") + " · " + (agreedTerms.volume || "") + "t", text: "Hi " + (deal.buyerName || "Buyer") + ",\n\nYour deal with " + (deal.producerName || "the producer") + " has been confirmed.\n\nProducer contact: " + (deal.producerEmail || "Available in your deal room") + "\n\n" + sharedBody } }));
    if (deal.producerEmail) writes.push(DealroomFirebase.queueEmail({ to: deal.producerEmail, message: { subject: "Deal confirmed — " + (deal.feedstock || "Biochar") + " · " + (agreedTerms.volume || "") + "t", text: "Hi " + (deal.producerName || "Producer") + ",\n\nYour deal with " + (deal.buyerName || "the buyer") + " has been confirmed.\n\nBuyer contact: " + (deal.buyerEmail || "Available in your deal room") + "\n\n" + sharedBody } }));
    return Promise.all(writes);
  }

  function renderShell() {
    if (rendered) return;
    var container = getContainer();
    if (!container) return;
    container.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 400px;gap:28px;align-items:start;padding:var(--space-6) 0">' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
          '<div id="dr-info-card" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm)"></div>' +
          '<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-sm)">' +
            '<div style="padding:14px 20px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--color-surface)"><div style="font-size:14px;font-weight:700;color:var(--color-text-primary)">Deal Conversation</div><div id="dr-conversation-id" style="font-size:11px;color:var(--color-text-muted)"></div></div>' +
            '<div id="dr-chat-thread" style="padding:20px;min-height:280px;max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:10px"></div>' +
            '<div style="padding:12px 16px;border-top:1px solid var(--color-border);display:flex;gap:8px;background:var(--color-bg)">' +
              '<button id="dr-attach-btn" type="button" class="btn btn-secondary" style="min-width:44px;padding:0 12px;align-self:flex-end" aria-label="Attach file">📎</button>' +
              '<input id="dr-attach-input" type="file" accept=".pdf,.jpg,.jpeg,.png" style="display:none" />' +
              '<textarea id="dr-message-input" placeholder="Type a message..." style="flex:1;height:44px;resize:none;padding:10px 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;font-family:var(--font-sans);background:var(--color-surface)"></textarea>' +
              '<button id="dr-send-btn" class="btn btn-primary" style="white-space:nowrap;align-self:flex-end">Send</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="position:sticky;top:calc(60px + var(--space-4))"><div id="dr-bid-panel" style="background:var(--color-surface);border:1px solid var(--color-border);border-left:4px solid var(--color-accent);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm)"></div></div>' +
      "</div>";
    rendered = true;
  }

  function renderMessages(state) {
    var thread = document.getElementById("dr-chat-thread");
    var dealIdEl = document.getElementById("dr-conversation-id");
    if (dealIdEl) dealIdEl.textContent = activeDealId ? ("Deal ID " + activeDealId) : "";
    if (!thread) return;
    if (!state.messages.length) {
      thread.innerHTML = '<p style="color:var(--color-text-muted);font-size:14px;text-align:center;margin:auto">No messages yet. Start the conversation.</p>';
      return;
    }
    thread.innerHTML = state.messages.map(function (msg) {
      var isMine = state.currentUser && msg.senderUID === state.currentUser.uid;
      var createdAt = msg.createdAt && typeof msg.createdAt.toDate === "function" ? msg.createdAt.toDate() : (msg.createdAt ? new Date(msg.createdAt) : null);
      var timeLabel = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : "Just now";
      return '<div style="display:flex;flex-direction:column;align-items:' + (isMine ? "flex-end" : "flex-start") + ';gap:4px"><div style="background:' + (isMine ? "var(--color-accent-light)" : "white") + ";border:" + (isMine ? "1px solid transparent" : "1px solid var(--color-border)") + ";color:var(--color-text-primary);padding:10px 14px;border-radius:" + (isMine ? "12px 12px 4px 12px" : "12px 12px 12px 4px") + ';max-width:80%;font-size:14px;box-shadow:' + (isMine ? "none" : "0 1px 2px rgba(0,0,0,0.04)") + '">' + renderMessageBody(msg) + '</div><div style="font-size:11px;color:var(--color-text-muted)">' + (msg.senderName || "Unknown") + " · " + timeLabel + "</div></div>";
    }).join("");
    thread.scrollTop = thread.scrollHeight;
  }

  function updateSelfPickupNote(state) {
    var deliverySelect = document.getElementById("dr-delivery");
    var noteEl = document.getElementById("dr-self-pickup-note");
    var listing = getListing(state);
    if (!deliverySelect || !noteEl || !listing || deliverySelect.value !== "self_pickup" || !window.DeliveredCost || !state.profile || !state.profile.zipcode || !listing.producerZip) {
      if (noteEl) noteEl.style.display = "none";
      return;
    }
    noteEl.style.display = "block";
    noteEl.textContent = "Calculating self-pickup savings...";
    window.DeliveredCost.calc({
      producerZip: listing.producerZip,
      buyerZip: state.profile.zipcode,
      pricePerTonne: state.deal.listedPricePerTonne || listing.pricePerTonne,
      tonnes: parseFloat((document.getElementById("dr-volume") || {}).value) || listing.minOrderTonnes || 1,
      applicationRate: state.profile.applicationRate || 0,
      spreadCostPerTonne: 60
    }).then(function (result) {
      var saving = Math.round(result.transportCostPerTonne);
      noteEl.textContent = "Self-pickup saves about $" + saving + "/tonne versus delivered freight.";
    }).catch(function () {
      noteEl.textContent = "";
      noteEl.style.display = "none";
    });
  }

  function renderInfoCard(state) {
    var card = document.getElementById("dr-info-card");
    if (!card || !state.deal) return;
    var listing = getListing(state) || {};
    var deal = state.deal;
    var status = deal.status || "Open";
    card.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px"><div><p style="font-size:12px;color:var(--color-text-muted);margin:0 0 2px 0">' + (deal.producerName || listing.producerName || "—") + '</p><h2 style="margin:0;font-size:20px">' + (deal.feedstock || listing.feedstock || "—") + " Biochar</h2></div>" + dealStatusPill(status) + "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px"><div><p style="font-size:11px;color:var(--color-text-muted);margin:0">Listed price</p><p style="font-size:20px;font-weight:700;color:var(--color-accent);margin:0">$' + (deal.listedPricePerTonne || listing.pricePerTonne || "—") + '<span style="font-size:12px;font-weight:400">/t</span></p></div><div><p style="font-size:11px;color:var(--color-text-muted);margin:0">Available</p><p style="font-size:18px;font-weight:600;margin:0">' + (deal.availableTonnes || listing.availableTonnes || "—") + ' t</p></div><div><p style="font-size:11px;color:var(--color-text-muted);margin:0">Min order</p><p style="font-size:18px;font-weight:600;margin:0">' + (deal.minOrderTonnes || listing.minOrderTonnes || "—") + ' t</p></div></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;color:var(--color-text-muted)">' + (deal.dealComplexity || "—") + " deal · Round " + (Number(deal.roundsUsed || 0) + 1) + " of " + Number(deal.maxRounds || 6) + '</span>' + (deal.fairPriceMin && deal.fairPriceMax ? '<span style="font-size:13px;color:var(--color-text-muted)">Fair range: $' + deal.fairPriceMin + "–$" + deal.fairPriceMax + "/t</span>" : "") + "</div>" +
      '<div id="dr-delivered-cost" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--color-border);font-size:13px;color:var(--color-text-muted)">Calculating delivered cost...</div>';
    injectDeliveredCost(state);
  }

  function injectDeliveredCost(state) {
    var el = document.getElementById("dr-delivered-cost");
    var listing = getListing(state);
    if (!el || !listing || !listing.producerZip || !window.DeliveredCost || !state.profile || !state.profile.zipcode) { if (el) el.textContent = ""; return; }
    window.DeliveredCost.calc({ producerZip: listing.producerZip, buyerZip: state.profile.zipcode, pricePerTonne: state.deal.listedPricePerTonne || listing.pricePerTonne, tonnes: listing.minOrderTonnes, applicationRate: state.profile.applicationRate || 0, spreadCostPerTonne: 60 }).then(function (r) {
      el.innerHTML = '<strong style="color:var(--color-text-primary)">Delivered cost: ~$' + Math.round(r.deliveredPerTonne) + '/t</strong> &nbsp;·&nbsp; <span>Material $' + Math.round(r.materialCost).toLocaleString() + "</span> &nbsp;·&nbsp; <span>Transport $" + Math.round(r.transportCost).toLocaleString() + " (" + r.distance + " mi, " + r.truckloads + " truck" + (r.truckloads > 1 ? "s" : "") + ')</span><div id="dr-backhaul-panel"></div> &nbsp;·&nbsp; <span>Application $' + Math.round(r.applicationCost).toLocaleString() + "</span>" + (r.costPerAcre ? " &nbsp;·&nbsp; <strong>$" + Math.round(r.costPerAcre).toLocaleString() + "/acre</strong>" : "");
      renderBackhaulPanel(listing.producerZip, r.distance);
    }).catch(function () { el.textContent = ""; });
  }

  function renderBackhaulPanel(producerZip, distanceMiles) {
    var panel = document.getElementById("dr-backhaul-panel");
    if (!panel) return;
    var allFeedstock = (window.FEEDSTOCK_LISTINGS || []).filter(function (item) { return item.locationZip; });
    if (!allFeedstock.length) return;
    var cache = window._backhaulGeo = window._backhaulGeo || {};
    function geo(zip) { if (cache[zip]) return Promise.resolve(cache[zip]); return fetch("https://api.zippopotam.us/us/" + zip).then(function (r) { return r.json(); }).then(function (d) { cache[zip] = { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; return cache[zip]; }); }
    function hav(a, b) { var R = 3958.8, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2); return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
    geo(producerZip).then(function (producerCoords) {
      return Promise.all(allFeedstock.map(function (item) { return geo(item.locationZip).then(function (coords) { return hav(producerCoords, coords) <= Math.max(distanceMiles * 0.25, 30) ? item : null; }).catch(function () { return null; }); }));
    }).then(function (items) {
      var nearby = items.filter(Boolean);
      if (!nearby.length) return;
      panel.innerHTML = '<div style="margin-top:12px;padding:14px 16px;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:1.1rem">🔄</span><strong style="font-size:14px;color:#065F46">Available backhaul: ' + nearby.length + " feedstock listing" + (nearby.length > 1 ? "s" : "") + " nearby</strong></div><p style=\"font-size:13px;color:#047857;margin:0 0 8px 0\">Estimated net transport savings: ~$" + Math.round(distanceMiles * 3.25 * 0.35).toLocaleString() + ' if combined with a return pickup.</p></div>';
    }).catch(function () {});
  }

  function renderBidPanel(state) {
    var panel = document.getElementById("dr-bid-panel");
    if (!panel || !state.deal) return;
    var deal = state.deal;
    var listing = getListing(state) || {};
    var pendingBid = state.latestBid && state.latestBid.status === "Pending" ? state.latestBid : null;
    var isMyPending = pendingBid && state.currentUser && pendingBid.bidderUID === state.currentUser.uid;
    if (deal.status === "Agreed") {
      var agreed = deal.agreedBid || deal.agreedTerms || {};
      panel.innerHTML = '<div style="padding:20px"><div style="display:flex;justify-content:flex-start;margin-bottom:16px">' + dealStatusPill(deal.status || "Agreed") + '</div><div style="text-align:center;margin-bottom:16px"><div style="font-size:40px;margin-bottom:8px">✅</div><h3 style="color:#2E7D32;margin:0">Deal accepted</h3><p style="font-size:13px;color:var(--color-text-muted);margin-top:6px">Both parties have agreed to terms. A confirmation email with full contact details, delivery terms, and next steps has been sent to both parties.</p></div><div style="background:var(--color-bg);border-radius:8px;padding:16px;margin-bottom:16px"><p style="margin:0 0 8px 0;font-size:14px"><strong>Volume:</strong> ' + (agreed.volumeTonnes || agreed.volume || "—") + ' tonnes</p><p style="margin:0 0 8px 0;font-size:14px"><strong>Price:</strong> $' + (agreed.pricePerTonne || "—") + '/tonne</p><p style="margin:0;font-size:14px"><strong>Delivery:</strong> ' + (agreed.deliveryMethod || "—") + '</p></div><div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:14px;margin-bottom:16px"><p style="font-size:13px;font-weight:600;margin:0 0 4px 0">📄 Scale ticket / weight certificate</p><p style="font-size:12px;color:var(--color-text-muted);margin:0 0 10px 0">Upload a certified scale ticket to confirm delivery weight. Required for carbon credit programs.</p><div id="dr-scale-drop" style="border:2px dashed var(--color-border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;background:var(--color-bg)"><p style="font-size:12px;color:var(--color-text-muted);margin:0">Click to upload · JPG, PNG, or PDF</p></div><input type="file" id="dr-scale-input" accept="image/*,.pdf" style="display:none" /><div id="dr-scale-preview" style="margin-top:8px;font-size:12px;color:var(--color-accent)"></div></div><button id="dr-confirm-delivery" class="btn btn-primary" style="width:100%;margin-bottom:8px">Confirm delivery received</button><p style="font-size:11px;color:var(--color-text-muted);text-align:center;margin:0">Both parties must confirm to complete the transaction.</p></div>';
      return;
    }
    if (pendingBid && !isMyPending) {
      var commission = DealroomState.computeCommission((pendingBid.volumeTonnes || 0) * (pendingBid.pricePerTonne || 0));
      panel.innerHTML = '<div style="display:flex;justify-content:flex-start;margin:0 0 16px 0">' + dealStatusPill(deal.status || "Open") + '</div><h3 style="margin:0 0 16px 0;font-size:16px">Incoming offer</h3><div style="background:var(--color-bg);border-radius:8px;padding:16px;margin-bottom:16px"><p style="margin:0 0 8px 0;font-size:14px"><strong>Volume:</strong> ' + pendingBid.volumeTonnes + ' tonnes</p><p style="margin:0 0 8px 0;font-size:14px"><strong>Price:</strong> $' + pendingBid.pricePerTonne + '/tonne</p><p style="margin:0 0 8px 0;font-size:14px"><strong>Total:</strong> $' + (pendingBid.volumeTonnes * pendingBid.pricePerTonne).toLocaleString() + '</p><p style="margin:0 0 8px 0;font-size:14px"><strong>Delivery:</strong> ' + (pendingBid.deliveryMethod || "—") + '</p>' + (pendingBid.transportCostPerTonne ? '<p style="margin:0 0 8px 0;font-size:14px"><strong>Proposed transport:</strong> $' + pendingBid.transportCostPerTonne + '/t</p>' : '<p style="margin:0 0 8px 0;font-size:14px;color:var(--color-text-muted)">Transport cost: to be negotiated</p>') + '<p style="margin:0;font-size:12px;color:var(--color-text-muted)">Platform commission: $' + commission.commissionAmount + " (" + commission.rateDisplay + ')</p></div><div style="display:flex;flex-direction:column;gap:8px"><button id="dr-accept-btn" class="btn btn-primary">Accept offer</button><button id="dr-counter-btn" class="btn btn-secondary">Counter offer</button><button id="dr-reject-btn" style="background:none;border:1px solid #C0392B;color:#C0392B;padding:10px;border-radius:8px;cursor:pointer;font-size:14px">Reject offer</button></div>';
      return;
    }
    if (pendingBid && isMyPending) {
      panel.innerHTML = '<div style="display:flex;justify-content:flex-start;margin:0 0 16px 0">' + dealStatusPill(deal.status || "Open") + '</div><h3 style="margin:0 0 16px 0;font-size:16px">Your offer</h3><div style="background:var(--color-bg);border-radius:8px;padding:16px;margin-bottom:16px"><p style="margin:0 0 8px 0;font-size:14px"><strong>Volume:</strong> ' + pendingBid.volumeTonnes + ' tonnes</p><p style="margin:0 0 8px 0;font-size:14px"><strong>Price:</strong> $' + pendingBid.pricePerTonne + '/tonne</p><p style="margin:0 0 8px 0;font-size:14px"><strong>Total:</strong> $' + (pendingBid.volumeTonnes * pendingBid.pricePerTonne).toLocaleString() + '</p><p style="margin:0;font-size:14px"><strong>Delivery:</strong> ' + (pendingBid.deliveryMethod || "—") + '</p></div><p style="font-size:14px;color:var(--color-text-muted);text-align:center">Waiting for response...</p>';
      return;
    }
    var suggested = deal.fairPriceMin && deal.fairPriceMax ? Math.round((parseFloat(deal.fairPriceMin) + parseFloat(deal.fairPriceMax)) / 2) : (listing.pricePerTonne || "");
    var deliveryOptions = (listing.deliveryMethods && listing.deliveryMethods.length ? listing.deliveryMethods : ["buyer_collects", "producer_delivers", "third_party_freight"]).map(function (method) {
      var val = String(method).toLowerCase().replace(/ /g, "_");
      return '<option value="' + val + '">' + ({ buyer_collects: "Buyer collects", producer_delivers: "Producer delivers", third_party_freight: "Arrange freight", "Buyer collects": "Buyer collects", "Producer delivers": "Producer delivers", "Third party freight": "Arrange freight" }[method] || method) + "</option>";
    }).join("");
    panel.innerHTML = '<div style="display:flex;justify-content:flex-start;margin:0 0 16px 0">' + dealStatusPill(deal.status || "Open") + '</div><h3 style="margin:0 0 4px 0;font-size:16px">Make an offer</h3>' + (deal.fairPriceMin && deal.fairPriceMax ? '<p style="font-size:12px;color:var(--color-text-muted);margin:0 0 16px 0">Fair price range: $' + deal.fairPriceMin + "–$" + deal.fairPriceMax + '/tonne</p>' : '<div style="margin-bottom:16px"></div>') + '<div style="display:flex;flex-direction:column;gap:12px"><div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Volume (tonnes) <span style="color:var(--color-accent)">*</span></label><input id="dr-volume" type="number" min="' + (listing.minOrderTonnes || 1) + '" placeholder="Min ' + (listing.minOrderTonnes || 1) + ' t" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px"></div><div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Price per tonne ($) <span style="color:var(--color-accent)">*</span></label><input id="dr-price" type="number" min="0" step="0.01" value="' + suggested + '" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px"></div><div id="dr-total-display" style="background:var(--color-accent-light);border-radius:8px;padding:12px;font-size:13px;display:none"><span id="dr-total-value" style="font-weight:700;color:var(--color-accent)"></span><span id="dr-commission-value" style="color:var(--color-text-muted);margin-left:8px"></span></div><div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Delivery method <span style="font-weight:400;color:var(--color-text-muted)">(producer\'s offered options)</span></label><select id="dr-delivery" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' + deliveryOptions + '</select><div id="dr-self-pickup-note" style="display:none;margin-top:8px;font-size:12px;color:#065F46;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:8px 10px"></div><div id="dr-3pl-panel" style="margin-top:12px;display:none"></div></div><div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Proposed transport cost ($/tonne) <span style="font-weight:400;color:var(--color-text-muted)">optional</span></label><p style="font-size:11px;color:var(--color-text-muted);margin:0 0 6px 0">Include if you have a freight quote. Leave blank to negotiate separately.</p><input id="dr-transport-cost" type="number" min="0" step="0.01" placeholder="e.g. 45" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px"></div><div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Target delivery date</label><input id="dr-delivery-date" type="date" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px"></div><div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Notes</label><textarea id="dr-notes" placeholder="Any special requirements..." style="width:100%;height:72px;padding:12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;resize:none"></textarea></div><button id="dr-submit-bid-btn" class="btn btn-primary" style="width:100%">Submit offer</button></div>';
    getBuyerSellerDistanceMiles(state, listing).then(function (distanceMiles) {
      if (!isSelfPickupEligible(state, listing, distanceMiles)) return;
      var select = document.getElementById("dr-delivery");
      if (!select || select.querySelector('option[value="self_pickup"]')) return;
      select.insertAdjacentHTML("beforeend", '<option value="self_pickup">Self-pickup</option>');
    }).catch(function () {});
  }

  function renderDealRoom(state) {
    var container = getContainer();
    if (!container) return;
    if (state.isLoading) {
      if (window.UIUtils) UIUtils.showLoading(container, "Loading deal room...");
      else showSimple("Loading deal room...");
      return;
    }
    if (state.error) { showSimple(state.error); return; }
    if (!state.deal) { showSimple("Deal room not found."); return; }
    if (state.currentUser && state.currentUser.uid !== state.deal.buyerUID && state.currentUser.uid !== state.deal.producerUID) { showSimple("Access denied."); return; }
    renderShell();
    renderInfoCard(state);
    renderMessages(state);
    renderBidPanel(state);
  }

  function uploadScaleTicket(file) {
    if (!file) return Promise.resolve(null);
    var fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_PRESET);
    return fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: fd }).then(function (r) { return r.json(); }).then(function (data) { return data.secure_url || null; }).catch(function () { return null; });
  }

  function uploadMessageAttachment(file) {
    if (!file) return Promise.resolve(null);
    var fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", CLOUDINARY_PRESET);
    var endpoint = /^application\/pdf$/i.test(file.type || "") || /\.pdf$/i.test(file.name || "")
      ? CLOUDINARY_RAW_UPLOAD_URL
      : CLOUDINARY_UPLOAD_URL;
    return fetch(endpoint, { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        return data.secure_url || null;
      });
  }

  function openRatingModal(dealId, raterUID) {
    var modal = document.createElement("div");
    modal.id = "dr-rating-modal";
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center";
    modal.innerHTML = '<div style="background:var(--color-surface);border-radius:12px;padding:32px;max-width:400px;width:90%;text-align:center"><div style="font-size:2.5rem;margin-bottom:12px">⭐</div><h3 style="margin:0 0 8px 0">Rate this transaction</h3><p style="font-size:14px;color:var(--color-text-muted);margin-bottom:24px">Your rating helps other buyers and sellers make confident decisions.</p><div id="dr-star-row" style="display:flex;justify-content:center;gap:8px;margin-bottom:20px">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-star="' + n + '" style="font-size:2rem;background:none;border:none;cursor:pointer;color:#D1D5DB">★</button>'; }).join("") + '</div><input type="hidden" id="dr-rating-selected" value="0" /><textarea id="dr-rating-note" placeholder="Optional: leave a note for the other party" style="width:100%;height:72px;resize:none;border:1px solid var(--color-border);border-radius:8px;padding:10px;font-size:14px;font-family:var(--font-sans);box-sizing:border-box;margin-bottom:16px"></textarea><div style="display:flex;gap:8px"><button id="dr-rating-skip" style="flex:1;padding:10px;background:none;border:1px solid var(--color-border);border-radius:8px;cursor:pointer;font-size:14px">Skip</button><button id="dr-rating-submit" style="flex:1;padding:10px;background:var(--color-accent);color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">Submit rating</button></div><p id="dr-rating-error" style="font-size:12px;color:#DC2626;margin-top:8px;display:none">Please select a star rating first.</p></div>';
    document.body.appendChild(modal);
    modal.querySelectorAll("#dr-star-row button").forEach(function (button) { button.addEventListener("click", function () { var val = Number(button.dataset.star); document.getElementById("dr-rating-selected").value = val; modal.querySelectorAll("#dr-star-row button").forEach(function (item) { item.style.color = Number(item.dataset.star) <= val ? "#F59E0B" : "#D1D5DB"; }); }); });
    document.getElementById("dr-rating-skip").addEventListener("click", function () { modal.remove(); });
    document.getElementById("dr-rating-submit").addEventListener("click", function () {
      var stars = Number(document.getElementById("dr-rating-selected").value);
      var note = document.getElementById("dr-rating-note").value.trim();
      var errorEl = document.getElementById("dr-rating-error");
      if (!stars) { errorEl.style.display = "block"; return; }
      errorEl.style.display = "none";
      DealroomFirebase.submitRating(dealId, raterUID, stars, note).then(function () { modal.remove(); }).catch(function (err) { errorEl.textContent = "Failed to submit: " + (err.message || "Try again."); errorEl.style.display = "block"; });
    });
  }

  function bindEvents() {
    document.addEventListener("click", function (event) {
      var state = DealroomState.getState();
      if (event.target.id === "dr-attach-btn") {
        var inputEl = document.getElementById("dr-attach-input");
        if (inputEl) inputEl.click();
      }
      if (event.target.id === "dr-send-btn") {
        var input = document.getElementById("dr-message-input");
        var sendBtn = event.target;
        if (!input || !input.value.trim()) return;
        if (window.UIUtils) UIUtils.setButtonLoading(sendBtn, true, "Sending...");
        DealroomFirebase.sendMessage(activeDealId, { senderUID: state.currentUser.uid, senderName: (state.profile && (state.profile.businessName || state.profile.name)) || state.currentUser.email, senderRole: state.userRole, text: input.value.trim() })
          .then(function () {
            if (window.UIUtils) {
              UIUtils.setButtonLoading(sendBtn, false);
              UIUtils.toast("Message sent.", "success", 1800);
            }
            input.value = "";
          })
          .catch(function (err) {
            if (window.UIUtils) {
              UIUtils.setButtonLoading(sendBtn, false);
              UIUtils.toast("Could not send message.", "error", 2600);
            }
          });
      }
      if (event.target.id === "dr-submit-bid-btn") {
        var listing = getListing(state) || {};
        var bidBtn = event.target;
        var volume = parseFloat(document.getElementById("dr-volume").value);
        var price = parseFloat(document.getElementById("dr-price").value);
        if (!volume || !price) return alert("Please enter volume and price.");
        if (volume < (listing.minOrderTonnes || 1)) return alert("Minimum order is " + (listing.minOrderTonnes || 1) + " tonnes.");
        if (DealroomState.isBelowHardFloor(price)) return alert("Bid rejected. Price is below the minimum acceptable price for this listing.");
        if (window.UIUtils) UIUtils.setButtonLoading(bidBtn, true, "Submitting...");
        DealroomFirebase.submitBid(activeDealId, { bidderUID: state.currentUser.uid, bidderName: (state.profile && (state.profile.businessName || state.profile.name)) || state.currentUser.email, volumeTonnes: volume, pricePerTonne: price, deliveryMethod: document.getElementById("dr-delivery").value, deliveryDate: document.getElementById("dr-delivery-date").value, transportCostPerTonne: parseFloat(document.getElementById("dr-transport-cost").value) || null, notes: document.getElementById("dr-notes").value }).then(function () { return DealroomFirebase.sendMessage(activeDealId, { senderUID: state.currentUser.uid, senderName: (state.profile && (state.profile.businessName || state.profile.name)) || state.currentUser.email, text: "📋 Offer submitted: " + volume + "t at $" + price + "/tonne ($" + (volume * price).toLocaleString() + " total)" }); }).then(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(bidBtn, false);
            UIUtils.toast("Offer submitted.", "success", 2200);
          }
        }).catch(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(bidBtn, false);
            UIUtils.toast("Could not submit offer.", "error", 2800);
          }
        });
      }
      if (event.target.id === "dr-accept-btn" && state.latestBid) {
        var acceptBtn = event.target;
        if (window.UIUtils) UIUtils.setButtonLoading(acceptBtn, true, "Accepting...");
        DealroomFirebase.acceptBid(activeDealId, state.latestBid).then(function () { return DealroomFirebase.sendMessage(activeDealId, { senderUID: state.currentUser.uid, senderName: "System", text: "✅ Deal agreed at $" + state.latestBid.pricePerTonne + "/tonne for " + state.latestBid.volumeTonnes + " tonnes." }); }).then(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(acceptBtn, false);
            UIUtils.toast("Offer accepted.", "success", 2200);
          }
        }).catch(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(acceptBtn, false);
            UIUtils.toast("Could not accept offer.", "error", 2800);
          }
        });
      }
      if (event.target.id === "dr-reject-btn" && state.latestBid) {
        var rejectBtn = event.target;
        if (window.UIUtils) UIUtils.setButtonLoading(rejectBtn, true, "Rejecting...");
        DealroomFirebase.rejectBid(activeDealId, state.latestBid.id).then(function () { return DealroomFirebase.sendMessage(activeDealId, { senderUID: state.currentUser.uid, senderName: "System", text: "❌ Offer rejected." }); }).then(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(rejectBtn, false);
            UIUtils.toast("Offer rejected.", "success", 2200);
          }
        }).catch(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(rejectBtn, false);
            UIUtils.toast("Could not reject offer.", "error", 2800);
          }
        });
      }
      if (event.target.id === "dr-counter-btn" && state.latestBid) {
        var panel = document.getElementById("dr-bid-panel");
        var listingData = getListing(state) || {};
        panel.innerHTML = '<h3 style="margin:0 0 4px 0;font-size:16px">Counter offer</h3><p style="font-size:12px;color:var(--color-text-muted);margin:0 0 16px 0">Their offer: $' + state.latestBid.pricePerTonne + "/t · " + state.latestBid.volumeTonnes + ' tonnes. Enter your counter terms below.</p><div style="display:flex;flex-direction:column;gap:12px"><input id="dr-counter-price" type="number" min="0" step="0.01" value="' + state.latestBid.pricePerTonne + '" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px"><input id="dr-counter-volume" type="number" min="' + (listingData.minOrderTonnes || 1) + '" value="' + state.latestBid.volumeTonnes + '" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px"><textarea id="dr-counter-notes" placeholder="Explain your counter offer..." style="width:100%;height:60px;resize:none;padding:10px 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;font-family:var(--font-sans)"></textarea><p id="dr-counter-error" style="font-size:12px;color:#DC2626;display:none;margin:0"></p><div style="display:flex;gap:8px"><button id="dr-counter-cancel" class="btn btn-secondary" style="flex:1">Cancel</button><button id="dr-counter-submit" class="btn btn-primary" style="flex:1">Send counter</button></div></div>';
      }
      if (event.target.id === "dr-counter-cancel") renderBidPanel(state);
      if (event.target.id === "dr-counter-submit" && state.latestBid) {
        var counterBtn = event.target;
        var counterPrice = parseFloat(document.getElementById("dr-counter-price").value);
        var counterVolume = parseFloat(document.getElementById("dr-counter-volume").value);
        if (!counterPrice || !counterVolume) return;
        if (window.UIUtils) UIUtils.setButtonLoading(counterBtn, true, "Sending...");
        DealroomFirebase.respondToBid(activeDealId, state.latestBid.id, state.currentUser.uid, "counter", counterVolume, counterPrice, state.latestBid.deliveryMethod || "buyer_collects", state.latestBid.deliveryDate || "", document.getElementById("dr-counter-notes").value.trim()).then(function () {
          return DealroomFirebase.sendMessage(activeDealId, { senderUID: state.currentUser.uid, senderName: "System", text: "↩ Counter offer sent: $" + counterPrice + "/t · " + counterVolume + " tonnes" });
        }).then(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(counterBtn, false);
            UIUtils.toast("Counter offer sent.", "success", 2200);
          }
        }).catch(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(counterBtn, false);
            UIUtils.toast("Could not send counter offer.", "error", 2800);
          }
        });
      }
      if (event.target.id === "dr-scale-drop") document.getElementById("dr-scale-input").click();
      if (event.target.id === "dr-confirm-delivery") {
        var file = document.getElementById("dr-scale-input");
        var confirmBtn = event.target;
        if (window.UIUtils) UIUtils.setButtonLoading(confirmBtn, true, "Uploading...");
        uploadScaleTicket(file && file.files ? file.files[0] : null).then(function (url) { return DealroomFirebase.confirmDelivery(activeDealId, state.currentUser.uid, url); }).then(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(confirmBtn, false);
            UIUtils.toast("Delivery confirmed.", "success", 2200);
          }
          openRatingModal(activeDealId, state.currentUser.uid);
        }).catch(function (err) {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(confirmBtn, false);
            UIUtils.toast("Failed to confirm delivery.", "error", 2800);
          } else alert("Failed to confirm delivery: " + (err.message || "Please try again."));
        });
      }
    });
    document.addEventListener("change", function (event) {
      var state = DealroomState.getState();
      if (event.target.id === "dr-scale-input" && event.target.files && event.target.files[0]) {
        var preview = document.getElementById("dr-scale-preview");
        if (isLikelyScreenshot(event.target.files[0])) {
          event.target.value = "";
          if (preview) {
            preview.textContent = "This looks like a screenshot — please upload the original document file (PDF preferred).";
            preview.style.color = "#C0392B";
          }
          return;
        }
        if (preview) {
          preview.textContent = "📎 " + event.target.files[0].name + " ready to upload";
          preview.style.color = "var(--color-accent)";
        }
      }
      if (event.target.id === "dr-attach-input" && event.target.files && event.target.files[0]) {
        var file = event.target.files[0];
        if (isLikelyScreenshot(file)) {
          event.target.value = "";
          if (window.UIUtils) UIUtils.toast("This looks like a screenshot — please upload the original document file (PDF preferred).", "warning", 3200);
          return;
        }
        var attachBtn = document.getElementById("dr-attach-btn");
        if (window.UIUtils && attachBtn) UIUtils.setButtonLoading(attachBtn, true, "Uploading...");
        uploadMessageAttachment(file).then(function (url) {
          if (!url) throw new Error("upload failed");
          return DealroomFirebase.sendMessage(activeDealId, {
            senderUID: state.currentUser.uid,
            senderName: (state.profile && (state.profile.businessName || state.profile.name)) || state.currentUser.email,
            senderRole: state.userRole,
            type: "attachment",
            fileUrl: url,
            fileName: file.name,
            fileType: file.type || ""
          });
        }).then(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(attachBtn, false);
            UIUtils.toast("Attachment sent.", "success", 1800);
          }
          event.target.value = "";
        }).catch(function () {
          if (window.UIUtils) {
            UIUtils.setButtonLoading(attachBtn, false);
            UIUtils.toast("Could not upload attachment.", "error", 2800);
          }
        });
      }
      if (event.target.id === "dr-delivery") {
        if (event.target.value === "third_party_freight") renderThirdPartyPanel();
        else {
          var panel = document.getElementById("dr-3pl-panel");
          if (panel) panel.style.display = "none";
        }
        updateSelfPickupNote(state);
      }
    });
    document.addEventListener("input", function (event) {
      if (event.target.id === "dr-volume" || event.target.id === "dr-price") {
        var volume = parseFloat(document.getElementById("dr-volume").value) || 0;
        var price = parseFloat(document.getElementById("dr-price").value) || 0;
        var totalEl = document.getElementById("dr-total-display");
        if (!totalEl) return;
        if (volume > 0 && price > 0) {
          totalEl.style.display = "block";
          document.getElementById("dr-total-value").textContent = "$" + (volume * price).toLocaleString() + " total";
          document.getElementById("dr-commission-value").textContent = "· commission ~$" + DealroomState.computeCommission(volume * price).commissionAmount;
        } else totalEl.style.display = "none";
      }
      if (event.target.id === "dr-volume") {
        updateSelfPickupNote(DealroomState.getState());
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey && document.activeElement && document.activeElement.id === "dr-message-input") {
        event.preventDefault();
        document.getElementById("dr-send-btn").click();
      }
    });
  }

  function renderThirdPartyPanel() {
    var state = DealroomState.getState();
    var panel = document.getElementById("dr-3pl-panel");
    var listing = getListing(state);
    if (!panel || !listing || !listing.producerZip) return;
    function geo(zip) { return fetch("https://api.zippopotam.us/us/" + zip).then(function (r) { return r.json(); }).then(function (d) { return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; }); }
    function hav(a, b) { var R = 3958.8, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2); return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
    DealroomFirebase.getThirdPartyProviders().then(function (providers) {
      return Promise.all(providers.map(function (provider) { if (!provider.zipcode) return null; return Promise.all([geo(provider.zipcode), geo(listing.producerZip)]).then(function (coords) { var dist = hav(coords[0], coords[1]); return dist <= (provider.serviceRadius || 200) ? { data: provider, dist: Math.round(dist) } : null; }).catch(function () { return null; }); }));
    }).then(function (items) {
      var carriers = items.filter(Boolean).sort(function (a, b) { return a.dist - b.dist; });
      panel.style.display = "block";
      panel.innerHTML = carriers.length ? '<div style="padding:14px 16px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:8px"><p style="font-size:13px;font-weight:600;margin:0 0 10px 0">🚚 Available carriers on this platform</p>' + carriers.slice(0, 3).map(function (c) { return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px"><div><strong>' + (c.data.businessName || "Carrier") + "</strong><span style=\"color:var(--color-text-muted);margin-left:8px\">" + c.dist + ' mi from producer</span></div><div style="color:var(--color-text-muted)">' + (c.data.loadCapacity ? c.data.loadCapacity + "t cap" : "Contact for capacity") + "</div></div>"; }).join("") + "</div>" : '<p style="font-size:13px;color:var(--color-text-muted);padding:8px 0">No platform carriers found in this area. Consider arranging independent freight.</p>';
    });
  }

  function clearListeners() {
    unsubs.forEach(function (unsub) { if (typeof unsub === "function") unsub(); });
    unsubs = [];
  }

  function subscribeToDeal(dealId) {
    clearListeners();
    unsubs.push(DealroomFirebase.onDealSnapshot(dealId, function (deal) { DealroomState.setDeal(deal); DealroomState.setListing((deal && (deal.listingData || (window.LISTINGS || []).find(function (item) { return String(item.id) === String(deal.listingId); }))) || null); DealroomState.setLoading(false); }, function () { setError("Failed to load deal room."); }));
    unsubs.push(DealroomFirebase.onMessagesSnapshot(dealId, function (messages) { DealroomState.setMessages(messages); }, function () { if (window.UIUtils) UIUtils.toast("Message stream disconnected.", "error", 0); }));
    unsubs.push(DealroomFirebase.onBidsSnapshot(dealId, function (bids) { DealroomState.setBids(bids); }, function () { if (window.UIUtils) UIUtils.toast("Bid stream disconnected.", "error", 0); }));
  }

  async function resolveDeal(user, profile) {
    var params = getParams();
    var dealId = params.get("id");
    var listingId = params.get("listingId");
    if (!dealId && !listingId) return setError("Deal room not found.");
    if (!dealId && listingId) {
      var existing = await DealroomFirebase.getOpenDealByListingAndBuyer(listingId, user.uid);
      if (existing) dealId = existing.id;
      else {
        var listing = (window.LISTINGS || []).find(function (item) { return String(item.id) === String(listingId); });
        if (!listing) return setError("Listing not found.");
        dealId = await DealroomFirebase.createDealRoom(listing, profile || { businessName: user.email }, user.uid);
      }
      history.replaceState(null, "", "dealroom.html?id=" + dealId);
    }
    activeDealId = dealId;
    subscribeToDeal(dealId);
    if (params.get("buynow") === "true" && listingId) {
      var currentDeal = await DealroomFirebase.getDeal(dealId);
      var listingData = (window.LISTINGS || []).find(function (item) { return String(item.id) === String(listingId); });
      if (currentDeal && listingData) {
        await DealroomFirebase.buyNow(dealId, currentDeal, listingData.minOrderTonnes, "Buyer collects", "");
        await queueConfirmationEmails(dealId, currentDeal, { volume: listingData.minOrderTonnes, pricePerTonne: currentDeal.listedPricePerTonne, totalValue: listingData.minOrderTonnes * currentDeal.listedPricePerTonne, commissionAmount: DealroomState.computeCommission(listingData.minOrderTonnes * currentDeal.listedPricePerTonne).commissionAmount, deliveryMethod: "Buyer collects", deliveryDate: "" });
        await DealroomFirebase.createTransaction(
          { dealId: dealId, listingId: currentDeal.listingId, producerName: currentDeal.producerName, producerUID: currentDeal.producerUID, buyerName: currentDeal.buyerName, buyerUID: currentDeal.buyerUID, feedstock: currentDeal.feedstock, tonnes: listingData.minOrderTonnes, pricePerTonne: currentDeal.listedPricePerTonne, totalValue: listingData.minOrderTonnes * currentDeal.listedPricePerTonne, commissionRate: DealroomState.computeCommission(listingData.minOrderTonnes * currentDeal.listedPricePerTonne).rateDisplay, commissionAmount: DealroomState.computeCommission(listingData.minOrderTonnes * currentDeal.listedPricePerTonne).commissionAmount, deliveryMethod: "Buyer collects", deliveryDate: "", status: "Agreed", carbonContentPercent: currentDeal.listingData && currentDeal.listingData.scorecard ? currentDeal.listingData.scorecard.carbonContent : null, confirmedByBuyer: false, confirmedByProducer: false },
          { "Transaction ID": "BM-" + Date.now(), "Producer Name": currentDeal.producerName, "Buyer Name": currentDeal.buyerName, "Feedstock": currentDeal.feedstock, "Tonnes": listingData.minOrderTonnes, "Price Per Tonne": currentDeal.listedPricePerTonne, "Transaction Value": listingData.minOrderTonnes * currentDeal.listedPricePerTonne, "Commission Rate": DealroomState.computeCommission(listingData.minOrderTonnes * currentDeal.listedPricePerTonne).rateDisplay, "Commission Amount": DealroomState.computeCommission(listingData.minOrderTonnes * currentDeal.listedPricePerTonne).commissionAmount, "Delivery Method": "Buyer collects", "Status": "Agreed", "Date Initiated": new Date().toISOString().split("T")[0] }
        );
      }
    }
  }

  function init() {
    var container = getContainer();
    if (container && window.UIUtils) UIUtils.showLoading(container, "Loading deal room...");
    bindEvents();
    DealroomState.subscribe(renderDealRoom);
    window.AuthState.onReady(function (user, profile) {
      if (!user) return void (window.location.href = "auth.html?role=buyer");
      DealroomState.setUser(user, profile);
      resolveDeal(user, profile).catch(function (err) { setError(err && err.message ? err.message : "Failed to initialize deal room."); });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
