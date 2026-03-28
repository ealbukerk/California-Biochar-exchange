var CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dz5so5fgy/image/upload';
var CLOUDINARY_PRESET = 'biochar_certs';

function getDealComplexity(listing) {
  const fullValue = listing.availableTonnes * listing.pricePerTonne

  if (fullValue < 25000) {
    return {
      bracket: 'small',
      label: 'Small deal',
      estimatedValue: fullValue,
      maxRounds: 4,
      expiryDays: 14,
      extensionDays: 3
    }
  }

  const seventyValue = fullValue * 0.7

  if (seventyValue < 25000) {
    return {
      bracket: 'small',
      label: 'Small deal',
      estimatedValue: seventyValue,
      maxRounds: 4,
      expiryDays: 14,
      extensionDays: 3
    }
  }

  if (seventyValue >= 25000 && seventyValue < 100000) {
    return {
      bracket: 'medium',
      label: 'Mid-size deal',
      estimatedValue: seventyValue,
      maxRounds: 6,
      expiryDays: 14,
      extensionDays: 3
    }
  }

  const fortyValue = fullValue * 0.4

  if (fortyValue >= 100000) {
    return {
      bracket: 'large',
      label: 'Large deal',
      estimatedValue: fortyValue,
      maxRounds: 8,
      expiryDays: 30,
      extensionDays: 3
    }
  }

  return {
    bracket: 'medium',
    label: 'Mid-size deal',
    estimatedValue: fortyValue,
    maxRounds: 6,
    expiryDays: 14,
    extensionDays: 3
  }
}

function getFairPriceRange(listing) {
  const comparables = window.LISTINGS.filter(l => l.feedstock === listing.feedstock && l.id !== listing.id)
  if (comparables.length === 0) return null
  const prices = comparables.map(l => l.pricePerTonne)
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  const spread = comparables.length >= 3 ? 0.08 : 0.15
  return {
    average: Math.round(avg),
    low: Math.round(avg * (1 - spread)),
    high: Math.round(avg * (1 + spread)),
    confidence: comparables.length >= 3 ? 'high' : 'limited',
    comparableCount: comparables.length
  }
}

function renderThirdPartyPanel(producerZip, buyerZip) {
  var panel = document.getElementById('dr-3pl-panel');
  if (!panel) return;

  function hav(a, b) {
    var R = 3958.8, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function geoZip(zip) {
    return fetch('https://api.zippopotam.us/us/' + zip)
      .then(function(r) { return r.json(); })
      .then(function(d) { return { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) }; });
  }

  db.collection('users').where('role', '==', 'third_party').get()
    .then(function(snap) {
      if (snap.empty) return;
      var carriers = [];
      var checks = [];
      snap.forEach(function(doc) {
        var cd = doc.data();
        if (!cd.zipcode) return;
        checks.push(
          geoZip(cd.zipcode).then(function(carrierCoords) {
            return geoZip(producerZip).then(function(prodCoords) {
              var dist = hav(carrierCoords, prodCoords);
              if (dist <= (cd.serviceRadius || 200)) {
                carriers.push({ data: cd, dist: Math.round(dist) });
              }
            });
          }).catch(function() {})
        );
      });
      Promise.all(checks).then(function() {
        if (!carriers.length) {
          panel.style.display = 'block';
          panel.innerHTML = '<p style="font-size:13px;color:var(--color-text-muted);padding:8px 0">No platform carriers found in this area. Consider arranging independent freight.</p>';
          return;
        }
        carriers.sort(function(a, b) { return a.dist - b.dist; });
        panel.style.display = 'block';
        panel.innerHTML =
          '<div style="padding:14px 16px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:8px">' +
            '<p style="font-size:13px;font-weight:600;margin:0 0 10px 0">🚚 Available carriers on this platform</p>' +
            carriers.slice(0, 3).map(function(c) {
              return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px">' +
                '<div><strong>' + (c.data.businessName || 'Carrier') + '</strong>' +
                '<span style="color:var(--color-text-muted);margin-left:8px">' + c.dist + ' mi from producer</span></div>' +
                '<div style="color:var(--color-text-muted)">' + (c.data.loadCapacity ? c.data.loadCapacity + 't cap' : 'Contact for capacity') + '</div>' +
              '</div>';
            }).join('') +
          '</div>';
      });
    }).catch(function() {});
}

async function createDealRoom(listing, buyerProfile, buyerUID) {
  const complexity = getDealComplexity(listing)
  const fairPrice = getFairPriceRange(listing)
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + complexity.expiryDays)

  const dealData = {
    listingId: listing.id,
    producerName: listing.producerName,
    producerUID: listing.producerUID || null,
    buyerUID: buyerUID,
    buyerName: buyerProfile.businessName,
    buyerEmail: buyerProfile.email || '',
    producerEmail: listing.contactEmail || '',
    feedstock: listing.feedstock,
    listedPricePerTonne: listing.pricePerTonne,
    availableTonnes: listing.availableTonnes,
    minOrderTonnes: listing.minOrderTonnes,
    hardFloor: listing.hardFloor || null,
    fairPriceRange: fairPrice,
    complexity: complexity,
    roundsUsed: 0,
    maxRounds: complexity.maxRounds,
    status: 'Open',
    extensionUsed: false,
    extensionRequested: null,
    extensionRequestedBy: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    expiryDate: expiryDate,
    agreedTerms: null
  }

  const dealRef = await db.collection('deals').add(dealData)
  return dealRef.id
}

async function submitBid(dealId, bidderUID, bidderName, bidderRole, volume, pricePerTonne, deliveryMethod, deliveryDate, notes, transportCostPerTonne) {
  const dealRef = db.collection('deals').doc(dealId)
  const deal = (await dealRef.get()).data()

  if (deal.status !== 'Open') throw new Error('Deal room is not open')
  if (deal.roundsUsed >= deal.maxRounds) throw new Error('Maximum rounds reached')
  if (volume < deal.minOrderTonnes) throw new Error('Volume below minimum order of ' + deal.minOrderTonnes + ' tonnes')

  const totalValue = volume * pricePerTonne
  const commission = calculateCommission(totalValue)

  if (deal.hardFloor && pricePerTonne < deal.hardFloor) {
    await db.collection('deals').doc(dealId).collection('bids').add({
      bidderUID,
      bidderName,
      bidderRole,
      volume,
      pricePerTonne,
      totalValue,
      commissionRate: commission.rateDisplay,
      commissionAmount: commission.commissionAmount,
      deliveryMethod,
      deliveryDate,
      transportCostPerTonne: transportCostPerTonne || null,
      notes,
      status: 'Auto-Rejected',
      autoRejectReason: 'Below minimum accepted price',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    return { autoRejected: true, fairPriceRange: deal.fairPriceRange }
  }

  const isNearAsking = Math.abs(pricePerTonne - deal.listedPricePerTonne) / deal.listedPricePerTonne <= 0.03

  const bidRef = await db.collection('deals').doc(dealId).collection('bids').add({
    bidderUID,
    bidderName,
    bidderRole,
    volume,
    pricePerTonne,
    totalValue,
    commissionRate: commission.rateDisplay,
    commissionAmount: commission.commissionAmount,
    deliveryMethod,
    deliveryDate,
    transportCostPerTonne: transportCostPerTonne || null,
    notes,
    status: 'Pending',
    nearAsking: isNearAsking,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  })

  await dealRef.update({
    roundsUsed: firebase.firestore.FieldValue.increment(1),
    currentBidId: bidRef.id
  })

  return { autoRejected: false, bidId: bidRef.id, nearAsking: isNearAsking }
}

async function respondToBid(dealId, bidId, responderUID, action, counterVolume, counterPrice, counterDeliveryMethod, counterDeliveryDate, counterNotes) {
  const dealRef = db.collection('deals').doc(dealId)
  const deal = (await dealRef.get()).data()
  const bidRef = dealRef.collection('bids').doc(bidId)

  if (action === 'accept') {
    await bidRef.update({ status: 'Accepted' })
    const bid = (await bidRef.get()).data()
    const agreedTerms = {
      volume: bid.volume,
      pricePerTonne: bid.pricePerTonne,
      totalValue: bid.totalValue,
      commissionRate: bid.commissionRate,
      commissionAmount: bid.commissionAmount,
      deliveryMethod: bid.deliveryMethod,
      deliveryDate: bid.deliveryDate,
      agreedAt: firebase.firestore.FieldValue.serverTimestamp()
    }
    await dealRef.update({ status: 'Agreed', agreedTerms })
    await createTransactionFromDeal(dealId, deal, agreedTerms)
    await sendDealConfirmationEmails(dealId, deal, agreedTerms)
    return { agreed: true }
  }

  if (action === 'reject') {
    await bidRef.update({ status: 'Rejected' })
    if (deal.roundsUsed >= deal.maxRounds) {
      await dealRef.update({ status: 'Expired' })
    }
    return { agreed: false, rejected: true }
  }

  if (action === 'counter') {
    await bidRef.update({ status: 'Countered' })
    return await submitBid(dealId, responderUID, null, null, counterVolume, counterPrice, counterDeliveryMethod, counterDeliveryDate, counterNotes)
  }
}

async function buyNow(dealId, buyerUID, buyerName, volume, deliveryMethod, deliveryDate) {
  const dealRef = db.collection('deals').doc(dealId)
  const deal = (await dealRef.get()).data()
  if (volume < deal.minOrderTonnes) throw new Error('Volume below minimum order of ' + deal.minOrderTonnes + ' tonnes')
  const totalValue = volume * deal.listedPricePerTonne
  const commission = calculateCommission(totalValue)
  const agreedTerms = {
    volume,
    pricePerTonne: deal.listedPricePerTonne,
    totalValue,
    commissionRate: commission.rateDisplay,
    commissionAmount: commission.commissionAmount,
    deliveryMethod,
    deliveryDate,
    agreedAt: firebase.firestore.FieldValue.serverTimestamp()
  }
  await dealRef.update({ status: 'Agreed', agreedTerms })
  await createTransactionFromDeal(dealId, deal, agreedTerms)
  await sendDealConfirmationEmails(dealId, deal, agreedTerms)
  return { agreed: true }
}

async function sendDealConfirmationEmails(dealId, deal, agreedTerms) {
  try {
    var deliveryMethodLabel = agreedTerms.deliveryMethod === 'buyer_collects' ? 'Buyer collects'
      : agreedTerms.deliveryMethod === 'producer_delivers' ? 'Producer delivers'
      : 'Third-party freight';

    var totalFormatted = '$' + (agreedTerms.totalValue || 0).toLocaleString();
    var commissionFormatted = '$' + (agreedTerms.commissionAmount || 0).toLocaleString();
    var dealUrl = 'https://ealbukerk.github.io/California-Biochar-exchange/dealroom.html?id=' + dealId;

    var sharedBody =
      'Deal terms:\n' +
      '  Feedstock: ' + (deal.feedstock || '—') + '\n' +
      '  Volume: ' + (agreedTerms.volume || '—') + ' tonnes\n' +
      '  Price: $' + (agreedTerms.pricePerTonne || '—') + '/tonne\n' +
      '  Total value: ' + totalFormatted + '\n' +
      '  Platform commission: ' + commissionFormatted + '\n' +
      '  Delivery method: ' + deliveryMethodLabel + '\n' +
      '  Delivery date: ' + (agreedTerms.deliveryDate || 'To be arranged') + '\n\n' +
      'View your deal room: ' + dealUrl + '\n\n' +
      'Next steps: Both parties must confirm delivery once the shipment is received. ' +
      'If you need to arrange freight, visit the Carriers page on the platform.\n\n' +
      '— Biochar.market';

    var buyerEmail = {
      to: deal.buyerEmail || '',
      message: {
        subject: 'Deal confirmed — ' + (deal.feedstock || 'Biochar') + ' · ' + (agreedTerms.volume || '') + 't',
        text: 'Hi ' + (deal.buyerName || 'Buyer') + ',\n\n' +
          'Your deal with ' + (deal.producerName || 'the producer') + ' has been confirmed.\n\n' +
          'Producer contact: ' + (deal.producerEmail || 'Available in your deal room') + '\n\n' +
          sharedBody
      }
    };

    var producerEmail = {
      to: deal.producerEmail || '',
      message: {
        subject: 'Deal confirmed — ' + (deal.feedstock || 'Biochar') + ' · ' + (agreedTerms.volume || '') + 't',
        text: 'Hi ' + (deal.producerName || 'Producer') + ',\n\n' +
          'Your deal with ' + (deal.buyerName || 'the buyer') + ' has been confirmed.\n\n' +
          'Buyer contact: ' + (deal.buyerEmail || 'Available in your deal room') + '\n\n' +
          sharedBody
      }
    };

    var writes = [];
    if (buyerEmail.to) writes.push(db.collection('mail').add(buyerEmail));
    if (producerEmail.to) writes.push(db.collection('mail').add(producerEmail));
    await Promise.all(writes);
  } catch(err) {
    console.warn('Email send failed (non-fatal):', err.message);
  }
}

async function createTransactionFromDeal(dealId, deal, agreedTerms) {
  await db.collection('transactions').add({
    dealId,
    listingId: deal.listingId,
    producerName: deal.producerName,
    producerUID: deal.producerUID,
    buyerName: deal.buyerName,
    buyerUID: deal.buyerUID,
    feedstock: deal.feedstock,
    tonnes: agreedTerms.volume,
    pricePerTonne: agreedTerms.pricePerTonne,
    totalValue: agreedTerms.totalValue,
    commissionRate: agreedTerms.commissionRate,
    commissionAmount: agreedTerms.commissionAmount,
    deliveryMethod: agreedTerms.deliveryMethod,
    deliveryDate: agreedTerms.deliveryDate,
    status: 'Agreed',
    carbonContentPercent: deal.listingData && deal.listingData.scorecard ? deal.listingData.scorecard.carbonContent : null,
    confirmedByBuyer: false,
    confirmedByProducer: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })

  if (typeof submitToAirtable === 'function') {
    submitToAirtable('Transactions', {
      'Transaction ID': 'BM-' + Date.now(),
      'Producer Name': deal.producerName,
      'Buyer Name': deal.buyerName,
      'Feedstock': deal.feedstock,
      'Tonnes': agreedTerms.volume,
      'Price Per Tonne': agreedTerms.pricePerTonne,
      'Transaction Value': agreedTerms.totalValue,
      'Commission Rate': agreedTerms.commissionRate,
      'Commission Amount': agreedTerms.commissionAmount,
      'Delivery Method': agreedTerms.deliveryMethod,
      'Status': 'Agreed',
      'Date Initiated': new Date().toISOString().split('T')[0]
    })
  }
}

async function sendMessage(dealId, senderUID, senderName, senderRole, text) {
  if (!text.trim()) return
  await db.collection('deals').doc(dealId).collection('messages').add({
    senderUID,
    senderName,
    senderRole,
    text: text.trim(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  })
}

function subscribeToDealRoom(dealId, onDealUpdate, onMessagesUpdate, onBidsUpdate) {
  const dealUnsub = db.collection('deals').doc(dealId).onSnapshot(snap => onDealUpdate(snap.data()))
  const messagesUnsub = db.collection('deals').doc(dealId).collection('messages').orderBy('timestamp').onSnapshot(snap => onMessagesUpdate(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  const bidsUnsub = db.collection('deals').doc(dealId).collection('bids').orderBy('timestamp').onSnapshot(snap => onBidsUpdate(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  return () => { dealUnsub(); messagesUnsub(); bidsUnsub() }
}

async function requestExtension(dealId, requesterUID) {
  const dealRef = db.collection('deals').doc(dealId)
  const deal = (await dealRef.get()).data()
  if (deal.extensionUsed) throw new Error('Extension already used')
  await dealRef.update({
    extensionRequested: true,
    extensionRequestedBy: requesterUID
  })
}

async function respondToExtension(dealId, responderUID, accept) {
  const dealRef = db.collection('deals').doc(dealId)
  const deal = (await dealRef.get()).data()
  if (accept) {
    const newExpiry = new Date(deal.expiryDate.toDate())
    newExpiry.setDate(newExpiry.getDate() + deal.complexity.extensionDays)
    await dealRef.update({
      expiryDate: newExpiry,
      extensionUsed: true,
      extensionRequested: false
    })
  } else {
    await dealRef.update({
      extensionRequested: false,
      extensionRequestedBy: null
    })
  }
}

window.confirmDealDelivery = async function(transactionId, confirmerUID) {
  const txRef = db.collection('transactions').doc(transactionId)
  const txSnap = await txRef.get()
  if (!txSnap.exists) throw new Error('Transaction not found')
  const tx = txSnap.data()

  const updates = {}
  if (tx.buyerUID === confirmerUID) updates.confirmedByBuyer = true
  if (tx.producerUID === confirmerUID) updates.confirmedByProducer = true
  if (Object.keys(updates).length === 0) throw new Error('User is not part of this transaction')

  await txRef.update(updates)
  const updatedSnap = await txRef.get()
  const updated = updatedSnap.data()

  if (updated.confirmedByBuyer === true && updated.confirmedByProducer === true) {
    const dealSnap = await db.collection('deals').doc(updated.dealId).get()
    if (dealSnap.exists) {
      const deal = dealSnap.data()
      if (window.updateVerifiedStatus) {
        if (deal.buyerUID) await window.updateVerifiedStatus(deal.buyerUID)
        if (deal.producerUID) await window.updateVerifiedStatus(deal.producerUID)
      }
    }
  }

  return updated
}

window.getDealHeaderDisplay = function(deal) {
  const producerBadge = deal && deal.producerVerified && typeof window.renderVerifiedBadge === 'function'
    ? window.renderVerifiedBadge()
    : ''
  const buyerBadge = deal && deal.buyerVerified && typeof window.renderVerifiedBadge === 'function'
    ? window.renderVerifiedBadge()
    : ''

  return {
    producerNameHtml: (deal && deal.producerName ? deal.producerName : '') + producerBadge,
    buyerNameHtml: (deal && deal.buyerName ? deal.buyerName : '') + buyerBadge
  }
}

function openRatingModal(dealId, raterUID) {
  var existing = document.getElementById('dr-rating-modal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'dr-rating-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center';
  modal.innerHTML =
    '<div style="background:var(--color-surface);border-radius:12px;padding:32px;max-width:400px;width:90%;text-align:center">' +
      '<div style="font-size:2.5rem;margin-bottom:12px">⭐</div>' +
      '<h3 style="margin:0 0 8px 0">Rate this transaction</h3>' +
      '<p style="font-size:14px;color:var(--color-text-muted);margin-bottom:24px">Your rating helps other buyers and sellers make confident decisions.</p>' +
      '<div id="dr-star-row" style="display:flex;justify-content:center;gap:8px;margin-bottom:20px">' +
        [1,2,3,4,5].map(function(n) {
          return '<button data-star="' + n + '" style="font-size:2rem;background:none;border:none;cursor:pointer;color:#D1D5DB;transition:color 0.1s" onmouseover="document.querySelectorAll(\'#dr-star-row button\').forEach(function(b){b.style.color=Number(b.dataset.star)<=' + n + '?\'#F59E0B\':\'#D1D5DB\'})" onmouseout="var sel=document.getElementById(\'dr-rating-selected\');var v=sel?Number(sel.value):0;document.querySelectorAll(\'#dr-star-row button\').forEach(function(b){b.style.color=Number(b.dataset.star)<=v?\'#F59E0B\':\'#D1D5DB\'})">★</button>';
        }).join('') +
      '</div>' +
      '<input type="hidden" id="dr-rating-selected" value="0" />' +
      '<textarea id="dr-rating-note" placeholder="Optional: leave a note for the other party" style="width:100%;height:72px;resize:none;border:1px solid var(--color-border);border-radius:8px;padding:10px;font-size:14px;font-family:var(--font-sans);box-sizing:border-box;margin-bottom:16px"></textarea>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="dr-rating-skip" style="flex:1;padding:10px;background:none;border:1px solid var(--color-border);border-radius:8px;cursor:pointer;font-size:14px">Skip</button>' +
        '<button id="dr-rating-submit" style="flex:1;padding:10px;background:var(--color-accent);color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">Submit rating</button>' +
      '</div>' +
      '<p id="dr-rating-error" style="font-size:12px;color:#DC2626;margin-top:8px;display:none">Please select a star rating first.</p>' +
    '</div>';

  document.body.appendChild(modal);

  modal.querySelectorAll('#dr-star-row button').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var val = Number(btn.dataset.star);
      document.getElementById('dr-rating-selected').value = val;
      modal.querySelectorAll('#dr-star-row button').forEach(function(b) {
        b.style.color = Number(b.dataset.star) <= val ? '#F59E0B' : '#D1D5DB';
      });
    });
  });

  document.getElementById('dr-rating-skip').addEventListener('click', function() {
    modal.remove();
  });

  document.getElementById('dr-rating-submit').addEventListener('click', async function() {
    var stars = Number(document.getElementById('dr-rating-selected').value);
    var note = document.getElementById('dr-rating-note').value.trim();
    var errEl = document.getElementById('dr-rating-error');
    if (!stars) { errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    try {
      await db.collection('ratings').add({
        dealId: dealId,
        raterUID: raterUID,
        stars: stars,
        note: note || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      var dealSnap = await db.collection('deals').doc(dealId).get();
      if (dealSnap.exists) {
        var deal = dealSnap.data();
        var ratedUID = raterUID === deal.buyerUID ? deal.producerUID : deal.buyerUID;
        if (ratedUID) {
          var existingRatings = await db.collection('ratings')
            .where('ratedUID', '==', ratedUID)
            .get();
          var total = stars;
          var count = 1;
          existingRatings.forEach(function(d) { if (d.data().stars) { total += d.data().stars; count++; } });
          var newAvg = Math.round((total / count) * 10) / 10;
          await db.collection('users').doc(ratedUID).update({
            averageRating: newAvg,
            ratingsCount: count
          });
          await db.collection('ratings').add({
            dealId: dealId,
            raterUID: raterUID,
            ratedUID: ratedUID,
            stars: stars,
            note: note || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      modal.remove();
      var toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#065F46;color:white;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;z-index:3000';
      toast.textContent = '✓ Rating submitted — thank you!';
      document.body.appendChild(toast);
      setTimeout(function() { toast.remove(); }, 3000);
    } catch(err) {
      if (errEl) { errEl.textContent = 'Failed to submit: ' + (err.message || 'Try again.'); errEl.style.display = 'block'; }
    }
  });
}

let __dealRoomUnsub = null

function renderDealRoom(dealId, user) {
  const container = document.getElementById('dealroom-container')
  if (!container) return

  if (window.__dealRoomUnsub) {
    window.__dealRoomUnsub()
    window.__dealRoomUnsub = null
  }

  db.collection('deals').doc(dealId).get().then(function(snap) {
    if (!snap.exists) {
      container.innerHTML = '<div style="padding:40px;text-align:center"><p>Deal room not found.</p><a href="profile.html">← Back to profile</a></div>'
      return
    }

    const deal = snap.data()
    if (user.uid !== deal.buyerUID && user.uid !== deal.producerUID) {
      container.innerHTML = '<div style="padding:40px;text-align:center"><p>Access denied.</p></div>'
      return
    }

    const isProducer = user.uid === deal.producerUID

    container.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 400px;gap:28px;align-items:start;padding:var(--space-6) 0">' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
          '<div id="dr-info-card" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm)"></div>' +
          '<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-sm)">' +
            '<div style="padding:14px 20px;border-bottom:1px solid var(--color-border);font-size:13px;font-weight:600;color:var(--color-text-muted);letter-spacing:0.04em;text-transform:uppercase">Conversation</div>' +
            '<div id="dr-chat-thread" style="padding:20px;min-height:280px;max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:10px"></div>' +
            '<div style="padding:12px 16px;border-top:1px solid var(--color-border);display:flex;gap:8px;background:var(--color-bg)">' +
              '<textarea id="dr-message-input" placeholder="Type a message..." style="flex:1;height:44px;resize:none;padding:10px 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;font-family:var(--font-sans);background:var(--color-surface)"></textarea>' +
              '<button id="dr-send-btn" class="btn btn-primary" style="white-space:nowrap;align-self:flex-end">Send</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="position:sticky;top:calc(60px + var(--space-4))">' +
          '<div id="dr-bid-panel" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:24px;box-shadow:var(--shadow-sm)"></div>' +
        '</div>' +
      '</div>'

    var currentDeal = deal
    var currentMessages = []
    var currentBids = []

    function getListingData(d) {
      var ld = d.listingData
      if (!ld && d.listingId) {
        ld = (window.LISTINGS || []).find(function(l) { return String(l.id) === String(d.listingId) })
      }
      return ld || {}
    }

    function renderInfoCard(d) {
      const ld = getListingData(d)
      const status = d.status || 'Open'
      const roundsUsed = Number(d.roundsUsed || 0)
      const maxRounds = Number(d.maxRounds || 6)
      const price = ld.pricePerTonne || d.listedPrice || '—'
      const tonnes = ld.availableTonnes || '—'
      const minOrder = ld.minOrderTonnes || '—'
      const feedstock = d.feedstock || ld.feedstock || '—'
      const producer = d.producerName || ld.producerName || '—'
      const complexity = d.dealComplexity || '—'

      const statusColor = status === 'Open' ? 'var(--color-accent)' : status === 'Agreed' ? '#2E7D32' : '#C0392B'

      document.getElementById('dr-info-card').innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">' +
          '<div>' +
            '<p style="font-size:12px;color:var(--color-text-muted);margin:0 0 2px 0">' + producer + '</p>' +
            '<h2 style="margin:0;font-size:20px">' + feedstock + ' Biochar</h2>' +
          '</div>' +
          '<span style="background:' + statusColor + ';color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">' + status + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">' +
          '<div><p style="font-size:11px;color:var(--color-text-muted);margin:0">Listed price</p><p style="font-size:20px;font-weight:700;color:var(--color-accent);margin:0">$' + price + '<span style="font-size:12px;font-weight:400">/t</span></p></div>' +
          '<div><p style="font-size:11px;color:var(--color-text-muted);margin:0">Available</p><p style="font-size:18px;font-weight:600;margin:0">' + tonnes + ' t</p></div>' +
          '<div><p style="font-size:11px;color:var(--color-text-muted);margin:0">Min order</p><p style="font-size:18px;font-weight:600;margin:0">' + minOrder + ' t</p></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:13px;color:var(--color-text-muted)">' + complexity + ' deal · Round ' + (roundsUsed + 1) + ' of ' + maxRounds + '</span>' +
          (d.fairPriceMin && d.fairPriceMax ? '<span style="font-size:13px;color:var(--color-text-muted)">Fair range: $' + d.fairPriceMin + '–$' + d.fairPriceMax + '/t</span>' : '') +
        '</div>' +
        '<div id="dr-delivered-cost" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--color-border);font-size:13px;color:var(--color-text-muted)">Calculating delivered cost...</div>'
    }

    function injectDealRoomDeliveredCost(d) {
      var el = document.getElementById('dr-delivered-cost');
      if (!el) return;
      var listing = getListingData(d);
      if (!listing || !listing.producerZip) { el.textContent = ''; return; }
      if (!window.DeliveredCost) { el.textContent = ''; return; }

      firebase.auth().onAuthStateChanged(function(user) {
        if (!user) { el.textContent = ''; return; }
        firebase.firestore().collection('users').doc(user.uid).get().then(function(doc) {
          if (!doc.exists) { el.textContent = ''; return; }
          var profile = doc.data();
          if (!profile.zipcode) { el.textContent = ''; return; }
          window.DeliveredCost.calc({
            producerZip: listing.producerZip,
            buyerZip: profile.zipcode,
            pricePerTonne: d.listedPricePerTonne || listing.pricePerTonne,
            tonnes: listing.minOrderTonnes,
            applicationRate: profile.applicationRate || 0,
            spreadCostPerTonne: 60
          }).then(function(r) {
            el.innerHTML =
              '<strong style="color:var(--color-text-primary)">Delivered cost: ~$' + Math.round(r.deliveredPerTonne) + '/t</strong>' +
              ' &nbsp;·&nbsp; <span>Material $' + Math.round(r.materialCost).toLocaleString() + '</span>' +
              ' &nbsp;·&nbsp; <span>Transport $' + Math.round(r.transportCost).toLocaleString() + ' (' + r.distance + ' mi, ' + r.truckloads + ' truck' + (r.truckloads > 1 ? 's' : '') + ')</span>' +
              '<div id="dr-backhaul-panel"></div>' +
              ' &nbsp;·&nbsp; <span>Application $' + Math.round(r.applicationCost).toLocaleString() + '</span>' +
              (r.costPerAcre ? ' &nbsp;·&nbsp; <strong>$' + Math.round(r.costPerAcre).toLocaleString() + '/acre</strong>' : '');
            renderBackhaulPanel(listing.producerZip, r.distance);
          }).catch(function() { el.textContent = ''; });
        });
      });
    }

    function renderBackhaulPanel(producerZip, distanceMiles) {
      var panel = document.getElementById('dr-backhaul-panel');
      if (!panel) return;

      var allFeedstock = (window.FEEDSTOCK_LISTINGS || []).filter(function(fs) {
        if (!fs.locationZip || !producerZip) return false;
        var cached = window._backhaulGeo = window._backhaulGeo || {};
        return true;
      });

      if (!allFeedstock.length) return;

      var RETURN_RADIUS_MILES = Math.max(distanceMiles * 0.25, 30);

      function geocodeZip(zip) {
        if (window._backhaulGeo && window._backhaulGeo[zip]) return Promise.resolve(window._backhaulGeo[zip]);
        return fetch('https://api.zippopotam.us/us/' + zip)
          .then(function(r) { return r.json(); })
          .then(function(d) {
            var c = { lat: parseFloat(d.places[0].latitude), lng: parseFloat(d.places[0].longitude) };
            window._backhaulGeo = window._backhaulGeo || {};
            window._backhaulGeo[zip] = c;
            return c;
          });
      }

      function haversineD(a, b) {
        var R = 3958.8, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
        var x = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
      }

      geocodeZip(producerZip).then(function(prodCoords) {
        var checks = allFeedstock.map(function(fs) {
          return geocodeZip(fs.locationZip).then(function(fsCoords) {
            var d = haversineD(prodCoords, fsCoords);
            return d <= RETURN_RADIUS_MILES ? fs : null;
          }).catch(function() { return null; });
        });

        Promise.all(checks).then(function(results) {
          var nearby = results.filter(Boolean);
          if (!nearby.length) return;

          var savingsEst = Math.round(distanceMiles * 3.25 * 0.35);
          panel.innerHTML =
            '<div style="margin-top:12px;padding:14px 16px;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px">' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
                '<span style="font-size:1.1rem">🔄</span>' +
                '<strong style="font-size:14px;color:#065F46">Available backhaul: ' + nearby.length + ' feedstock listing' + (nearby.length > 1 ? 's' : '') + ' within ' + Math.round(RETURN_RADIUS_MILES) + ' miles of your route</strong>' +
              '</div>' +
              '<p style="font-size:13px;color:#047857;margin:0 0 8px 0">Estimated net transport savings: ~$' + savingsEst.toLocaleString() + ' if combined with a return pickup.</p>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                nearby.slice(0, 3).map(function(fs) {
                  return '<a href="feedstock.html" style="font-size:12px;padding:4px 10px;background:white;border:1px solid #6EE7B7;border-radius:20px;color:#065F46;text-decoration:none">' +
                    (fs.biomassType || 'Biomass').replace(/_/g, ' ') + ' · ' + fs.estimatedQuantityTons + 't' +
                  '</a>';
                }).join('') +
                (nearby.length > 3 ? '<span style="font-size:12px;color:#047857;padding:4px 6px">+' + (nearby.length - 3) + ' more</span>' : '') +
              '</div>' +
            '</div>';
        });
      }).catch(function() {});
    }

    function renderMessages(msgs) {
      const thread = document.getElementById('dr-chat-thread')
      if (!thread) return
      if (msgs.length === 0) {
        thread.innerHTML = '<p style="color:var(--color-text-muted);font-size:14px;text-align:center;margin:auto">No messages yet. Start the conversation.</p>'
        return
      }
      thread.innerHTML = msgs.map(function(msg) {
        const isMine = msg.senderUID === user.uid
        return '<div style="display:flex;flex-direction:column;align-items:' + (isMine ? 'flex-end' : 'flex-start') + '">' +
          '<span style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px">' + (msg.senderName || 'Unknown') + '</span>' +
          '<div style="background:' + (isMine ? 'var(--color-accent)' : 'var(--color-bg)') + ';color:' + (isMine ? 'white' : 'var(--color-text-primary)') + ';padding:10px 14px;border-radius:' + (isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px') + ';max-width:80%;font-size:14px">' + msg.text + '</div>' +
        '</div>'
      }).join('')
      thread.scrollTop = thread.scrollHeight
    }

    function renderBidPanel(d, bids) {
      const panel = document.getElementById('dr-bid-panel')
      if (!panel) return
      const ld = getListingData(d)
      const status = d.status || 'Open'
      const lastBid = bids.length > 0 ? bids[bids.length - 1] : null
      const pendingBid = lastBid && lastBid.status === 'Pending' ? lastBid : null
      const iMyBid = pendingBid && pendingBid.bidderUID === user.uid

      if (status === 'Agreed') {
        const ab = d.agreedBid || {}
        panel.innerHTML =
          '<div style="padding:20px">' +
            '<div style="text-align:center;margin-bottom:16px">' +
              '<div style="font-size:40px;margin-bottom:8px">✅</div>' +
              '<h3 style="color:#2E7D32;margin:0">Deal accepted</h3>' +
              '<p style="font-size:13px;color:var(--color-text-muted);margin-top:6px">Both parties have agreed to terms. A confirmation email with full contact details, delivery terms, and next steps has been sent to both parties.</p>' +
            '</div>' +
            '<div style="background:var(--color-bg);border-radius:8px;padding:16px;margin-bottom:16px">' +
              '<p style="margin:0 0 8px 0;font-size:14px"><strong>Volume:</strong> ' + (ab.volumeTonnes || '—') + ' tonnes</p>' +
              '<p style="margin:0 0 8px 0;font-size:14px"><strong>Price:</strong> $' + (ab.pricePerTonne || '—') + '/tonne</p>' +
              '<p style="margin:0 0 8px 0;font-size:14px"><strong>Total:</strong> $' + (ab.volumeTonnes && ab.pricePerTonne ? (ab.volumeTonnes * ab.pricePerTonne).toLocaleString() : '—') + '</p>' +
              '<p style="margin:0;font-size:14px"><strong>Delivery:</strong> ' + (ab.deliveryMethod || '—') + '</p>' +
            '</div>' +
            '<div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:14px;margin-bottom:16px">' +
              '<p style="font-size:13px;font-weight:600;margin:0 0 4px 0">📄 Scale ticket / weight certificate</p>' +
              '<p style="font-size:12px;color:var(--color-text-muted);margin:0 0 10px 0">Upload a certified scale ticket to confirm delivery weight. Required for carbon credit programs.</p>' +
              '<div id="dr-scale-drop" style="border:2px dashed var(--color-border);border-radius:8px;padding:14px;text-align:center;cursor:pointer;background:var(--color-bg)" onclick="document.getElementById(\'dr-scale-input\').click()">' +
                '<p style="font-size:12px;color:var(--color-text-muted);margin:0">Click to upload · JPG, PNG, or PDF</p>' +
              '</div>' +
              '<input type="file" id="dr-scale-input" accept="image/*,.pdf" style="display:none" />' +
              '<div id="dr-scale-preview" style="margin-top:8px;font-size:12px;color:var(--color-accent)"></div>' +
            '</div>' +
            '<button id="dr-confirm-delivery" class="btn btn-primary" style="width:100%;margin-bottom:8px">Confirm delivery received</button>' +
            '<p style="font-size:11px;color:var(--color-text-muted);text-align:center;margin:0">Both parties must confirm to complete the transaction.</p>' +
          '</div>'

        var scaleInput = document.getElementById('dr-scale-input');
        if (scaleInput) {
          scaleInput.addEventListener('change', function() {
            var file = scaleInput.files[0];
            var preview = document.getElementById('dr-scale-preview');
            if (file && preview) {
              preview.textContent = '📎 ' + file.name + ' ready to upload';
              var drop = document.getElementById('dr-scale-drop');
              if (drop) drop.style.borderColor = 'var(--color-accent)';
            }
          });
        }
        return
      }

      if (pendingBid && !iMyBid) {
        const listedPrice = ld.pricePerTonne || 0
        const bidPrice = pendingBid.pricePerTonne || 0
        const nearAsking = listedPrice && Math.abs(bidPrice - listedPrice) / listedPrice <= 0.03
        const commInfo = typeof calculateCommission === 'function' ? calculateCommission(pendingBid.volumeTonnes * bidPrice) : null

        panel.innerHTML =
          '<h3 style="margin:0 0 16px 0;font-size:16px">Incoming offer</h3>' +
          (nearAsking ? '<div style="background:var(--color-accent-light);border:1px solid var(--color-accent);border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px;color:var(--color-accent);font-weight:600">Near asking price ✓</div>' : '') +
          '<div style="background:var(--color-bg);border-radius:8px;padding:16px;margin-bottom:16px">' +
            '<p style="margin:0 0 8px 0;font-size:14px"><strong>Volume:</strong> ' + pendingBid.volumeTonnes + ' tonnes</p>' +
            '<p style="margin:0 0 8px 0;font-size:14px"><strong>Price:</strong> $' + pendingBid.pricePerTonne + '/tonne</p>' +
            '<p style="margin:0 0 8px 0;font-size:14px"><strong>Total:</strong> $' + (pendingBid.volumeTonnes * pendingBid.pricePerTonne).toLocaleString() + '</p>' +
            '<p style="margin:0 0 8px 0;font-size:14px"><strong>Delivery:</strong> ' + (pendingBid.deliveryMethod || '—') + '</p>' +
            (pendingBid.transportCostPerTonne ? '<p style="margin:0 0 8px 0;font-size:14px"><strong>Proposed transport:</strong> $' + pendingBid.transportCostPerTonne + '/t</p>' : '<p style="margin:0 0 8px 0;font-size:14px;color:var(--color-text-muted)">Transport cost: to be negotiated</p>') +
            (commInfo ? '<p style="margin:0;font-size:12px;color:var(--color-text-muted)">Platform commission: $' + commInfo.commissionAmount + ' (' + commInfo.rateDisplay + ')</p>' : '') +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<button id="dr-accept-btn" class="btn btn-primary">Accept offer</button>' +
            '<button id="dr-counter-btn" class="btn btn-secondary">Counter offer</button>' +
            '<button id="dr-reject-btn" style="background:none;border:1px solid #C0392B;color:#C0392B;padding:10px;border-radius:8px;cursor:pointer;font-size:14px">Reject offer</button>' +
          '</div>'
      } else if (pendingBid && iMyBid) {
        panel.innerHTML =
          '<h3 style="margin:0 0 16px 0;font-size:16px">Your offer</h3>' +
          '<div style="background:var(--color-bg);border-radius:8px;padding:16px;margin-bottom:16px">' +
            '<p style="margin:0 0 8px 0;font-size:14px"><strong>Volume:</strong> ' + pendingBid.volumeTonnes + ' tonnes</p>' +
            '<p style="margin:0 0 8px 0;font-size:14px"><strong>Price:</strong> $' + pendingBid.pricePerTonne + '/tonne</p>' +
            '<p style="margin:0 0 8px 0;font-size:14px"><strong>Total:</strong> $' + (pendingBid.volumeTonnes * pendingBid.pricePerTonne).toLocaleString() + '</p>' +
            '<p style="margin:0;font-size:14px"><strong>Delivery:</strong> ' + (pendingBid.deliveryMethod || '—') + '</p>' +
          '</div>' +
          '<p style="font-size:14px;color:var(--color-text-muted);text-align:center">Waiting for response...</p>'
      } else {
        const fairMin = d.fairPriceMin || ''
        const fairMax = d.fairPriceMax || ''
        const suggestedPrice = fairMin && fairMax ? Math.round((parseFloat(fairMin) + parseFloat(fairMax)) / 2) : (ld.pricePerTonne || '')
        const minOrder = ld.minOrderTonnes || 1

        panel.innerHTML =
          '<h3 style="margin:0 0 4px 0;font-size:16px">Make an offer</h3>' +
          (fairMin && fairMax ? '<p style="font-size:12px;color:var(--color-text-muted);margin:0 0 16px 0">Fair price range: $' + fairMin + '–$' + fairMax + '/tonne</p>' : '<div style="margin-bottom:16px"></div>') +
          '<div style="display:flex;flex-direction:column;gap:12px">' +
            '<div>' +
              '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Volume (tonnes) <span style="color:var(--color-accent)">*</span></label>' +
              '<input id="dr-volume" type="number" min="' + minOrder + '" placeholder="Min ' + minOrder + ' t" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' +
              (function() {
                var prof = window.AuthState && window.AuthState.profile;
                if (prof && prof.acreage && prof.applicationRate) {
                  var suggested = Math.round(prof.acreage * prof.applicationRate);
                  var capped = Math.min(suggested, ld.availableTonnes || suggested);
                  return '<div style="font-size:11px;color:var(--color-text-muted);margin-top:4px">Based on your farm size (' + prof.acreage + ' acres × ' + prof.applicationRate + ' t/acre) — suggested: <button type="button" onclick="document.getElementById(\\'dr-volume\\').value=' + capped + ';document.getElementById(\\'dr-volume\\').dispatchEvent(new Event(\\'input\\'))" style="background:none;border:none;color:var(--color-accent);font-size:11px;cursor:pointer;font-weight:600;padding:0">' + capped + 't</button></div>';
                }
                return '';
              })() +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Price per tonne ($) <span style="color:var(--color-accent)">*</span></label>' +
              '<input id="dr-price" type="number" min="0" step="0.01" value="' + suggestedPrice + '" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' +
            '</div>' +
            '<div id="dr-total-display" style="background:var(--color-accent-light);border-radius:8px;padding:12px;font-size:13px;display:none">' +
              '<span id="dr-total-value" style="font-weight:700;color:var(--color-accent)"></span>' +
              '<span id="dr-commission-value" style="color:var(--color-text-muted);margin-left:8px"></span>' +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Delivery method <span style="font-weight:400;color:var(--color-text-muted)">(producer\'s offered options)</span></label>' +
              (function() {
                var offered = (ld.deliveryMethods && ld.deliveryMethods.length)
                  ? ld.deliveryMethods
                  : ['buyer_collects','producer_delivers','third_party_freight'];
                var METHOD_LABELS = {
                  'buyer_collects': 'Buyer collects',
                  'Buyer collects': 'Buyer collects',
                  'producer_delivers': 'Producer delivers',
                  'Producer delivers': 'Producer delivers',
                  'third_party_freight': 'Third party logistics',
                  'Third party freight': 'Third party logistics'
                };
                var opts = offered.map(function(m) {
                  var val = m.toLowerCase().replace(/ /g,'_');
                  return '<option value="' + val + '">' + (METHOD_LABELS[m] || m) + '</option>';
                }).join('');
                return '<select id="dr-delivery" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' + opts + '</select>';
              })() +
              '<div id="dr-3pl-panel" style="margin-top:12px;display:none"></div>' +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Proposed transport cost ($/tonne) <span style="font-weight:400;color:var(--color-text-muted)">optional</span></label>' +
              '<p style="font-size:11px;color:var(--color-text-muted);margin:0 0 6px 0">Include if you have a freight quote. Leave blank to negotiate separately.</p>' +
              '<input id="dr-transport-cost" type="number" min="0" step="0.01" placeholder="e.g. 45" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Target delivery date</label>' +
              '<input id="dr-delivery-date" type="date" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' +
            '</div>' +
            '<div>' +
              '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Notes</label>' +
              '<textarea id="dr-notes" placeholder="Any special requirements..." style="width:100%;height:72px;padding:12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;resize:none"></textarea>' +
            '</div>' +
            '<button id="dr-submit-bid-btn" class="btn btn-primary" style="width:100%">Submit offer</button>' +
          '</div>'

        function updateTotal() {
          const vol = parseFloat(document.getElementById('dr-volume').value) || 0
          const pr = parseFloat(document.getElementById('dr-price').value) || 0
          const totalEl = document.getElementById('dr-total-display')
          const totalVal = document.getElementById('dr-total-value')
          const commVal = document.getElementById('dr-commission-value')
          if (vol > 0 && pr > 0) {
            const total = vol * pr
            totalEl.style.display = 'block'
            totalVal.textContent = '$' + total.toLocaleString() + ' total'
            if (typeof calculateCommission === 'function') {
              const c = calculateCommission(total)
              commVal.textContent = '· commission ~$' + c.commissionAmount
            }
          } else {
            totalEl.style.display = 'none'
          }
        }

        document.getElementById('dr-volume').addEventListener('input', updateTotal)
        document.getElementById('dr-price').addEventListener('input', updateTotal)

        // Pre-select delivery method from buyer profile
        var deliveryEl = document.getElementById('dr-delivery')
        if (deliveryEl && window.AuthState && window.AuthState.profile) {
          var prof = window.AuthState.profile
          if (prof.canSelfPickup) {
            deliveryEl.value = 'buyer_collects'
          } else {
            deliveryEl.value = 'producer_delivers'
          }
        }
        if (deliveryEl) {
          deliveryEl.addEventListener('change', function() {
            var p3 = document.getElementById('dr-3pl-panel');
            if (this.value === 'third_party_freight') {
              var ld = d.listingData;
              var producerZip = ld && ld.producerZip ? ld.producerZip : '';
              var buyerZip = window.AuthState && window.AuthState.profile ? window.AuthState.profile.zipcode : '';
              renderThirdPartyPanel(producerZip, buyerZip);
            } else {
              if (p3) p3.style.display = 'none';
            }
          });
        }

        document.getElementById('dr-submit-bid-btn').addEventListener('click', async function() {
          const vol = parseFloat(document.getElementById('dr-volume').value)
          const pr = parseFloat(document.getElementById('dr-price').value)
          const delivery = document.getElementById('dr-delivery').value
          const deliveryDate = document.getElementById('dr-delivery-date').value
          const transportCostPerTonne = parseFloat(document.getElementById('dr-transport-cost').value) || null
          const notes = document.getElementById('dr-notes').value

          if (!vol || !pr) {
            alert('Please enter volume and price.')
            return
          }
          if (vol < minOrder) {
            alert('Minimum order is ' + minOrder + ' tonnes.')
            return
          }

          const hardFloor = Number(d.hardFloor || 0)
          if (hardFloor && pr < hardFloor) {
            alert('Bid rejected. Price is below the minimum acceptable price for this listing.')
            return
          }

          const profile = await db.collection('users').doc(user.uid).get()
          const userName = profile.exists ? (profile.data().businessName || profile.data().name || user.email) : user.email

          await db.collection('deals').doc(dealId).collection('bids').add({
            bidderUID: user.uid,
            bidderName: userName,
            volumeTonnes: vol,
            pricePerTonne: pr,
            deliveryMethod: delivery,
            deliveryDate: deliveryDate,
            transportCostPerTonne: transportCostPerTonne || null,
            notes: notes,
            status: 'Pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          })

          await db.collection('deals').doc(dealId).update({
            roundsUsed: firebase.firestore.FieldValue.increment(1),
            lastActivityAt: firebase.firestore.FieldValue.serverTimestamp()
          })

          await db.collection('deals').doc(dealId).collection('messages').add({
            senderUID: user.uid,
            senderName: userName,
            text: '📋 Offer submitted: ' + vol + 't at $' + pr + '/tonne ($' + (vol * pr).toLocaleString() + ' total)',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          })
        })
      }

      document.addEventListener('click', async function(e) {
        if (e.target.id === 'dr-accept-btn' && pendingBid) {
          await db.collection('deals').doc(dealId).update({
            status: 'Agreed',
            agreedBid: {
              volumeTonnes: pendingBid.volumeTonnes,
              pricePerTonne: pendingBid.pricePerTonne,
              deliveryMethod: pendingBid.deliveryMethod,
              deliveryDate: pendingBid.deliveryDate
            },
            agreedAt: firebase.firestore.FieldValue.serverTimestamp()
          })
          await db.collection('deals').doc(dealId).collection('bids').doc(pendingBid.id).update({ status: 'Accepted' })
          await db.collection('deals').doc(dealId).collection('messages').add({
            senderUID: user.uid,
            senderName: 'System',
            text: '✅ Deal agreed at $' + pendingBid.pricePerTonne + '/tonne for ' + pendingBid.volumeTonnes + ' tonnes.',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          })
        }

        if (e.target.id === 'dr-reject-btn' && pendingBid) {
          await db.collection('deals').doc(dealId).collection('bids').doc(pendingBid.id).update({ status: 'Rejected' })
          await db.collection('deals').doc(dealId).collection('messages').add({
            senderUID: user.uid,
            senderName: 'System',
            text: '❌ Offer rejected.',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          })
        }

        if (e.target.id === 'dr-counter-btn') {
          var panel = document.getElementById('dr-bid-panel')
          if (!panel) return
          var ld = getListingData(currentDeal)
          var minOrder = ld.minOrderTonnes || 1
          var currentPrice = pendingBid.pricePerTonne || ''
          var currentVolume = pendingBid.volumeTonnes || minOrder
          panel.innerHTML =
            '<h3 style="margin:0 0 4px 0;font-size:16px">Counter offer</h3>' +
            '<p style="font-size:12px;color:var(--color-text-muted);margin:0 0 16px 0">Their offer: $' + pendingBid.pricePerTonne + '/t · ' + pendingBid.volumeTonnes + ' tonnes. Enter your counter terms below.</p>' +
            '<div style="display:flex;flex-direction:column;gap:12px">' +
              '<div>' +
                '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Counter price ($/t) <span style="color:var(--color-accent)">*</span></label>' +
                '<input id="dr-counter-price" type="number" min="0" step="0.01" value="' + currentPrice + '" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' +
              '</div>' +
              '<div>' +
                '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Counter volume (tonnes)</label>' +
                '<input id="dr-counter-volume" type="number" min="' + minOrder + '" value="' + currentVolume + '" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' +
              '</div>' +
              '<div>' +
                '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Notes (optional)</label>' +
                '<textarea id="dr-counter-notes" placeholder="Explain your counter offer..." style="width:100%;height:60px;resize:none;padding:10px 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;font-family:var(--font-sans)"></textarea>' +
              '</div>' +
              '<p id="dr-counter-error" style="font-size:12px;color:#DC2626;display:none;margin:0"></p>' +
              '<div style="display:flex;gap:8px">' +
                '<button id="dr-counter-cancel" class="btn btn-secondary" style="flex:1">Cancel</button>' +
                '<button id="dr-counter-submit" class="btn btn-primary" style="flex:1">Send counter</button>' +
              '</div>' +
            '</div>'

          document.getElementById('dr-counter-cancel').addEventListener('click', function() {
            renderBidPanel(currentDeal, currentBids)
          })

          document.getElementById('dr-counter-submit').addEventListener('click', async function() {
            var counterPrice = parseFloat(document.getElementById('dr-counter-price').value)
            var counterVolume = parseFloat(document.getElementById('dr-counter-volume').value)
            var counterNotes = document.getElementById('dr-counter-notes').value.trim()
            var errEl = document.getElementById('dr-counter-error')

            if (!counterPrice || counterPrice <= 0) {
              errEl.textContent = 'Please enter a valid counter price.'
              errEl.style.display = 'block'
              return
            }
            if (!counterVolume || counterVolume < minOrder) {
              errEl.textContent = 'Minimum volume is ' + minOrder + ' tonnes.'
              errEl.style.display = 'block'
              return
            }
            errEl.style.display = 'none'

            try {
              var submitBtn = document.getElementById('dr-counter-submit')
              if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…' }

              await respondToBid(
                dealId,
                pendingBid.id,
                user.uid,
                'counter',
                counterVolume,
                counterPrice,
                pendingBid.deliveryMethod || 'buyer_collects',
                pendingBid.deliveryDate || '',
                counterNotes
              )

              db.collection('deals').doc(dealId).collection('messages').add({
                senderUID: user.uid,
                senderName: 'System',
                text: '↩ Counter offer sent: $' + counterPrice + '/t · ' + counterVolume + ' tonnes',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
              })
            } catch(err) {
              var errEl2 = document.getElementById('dr-counter-error')
              if (errEl2) {
                errEl2.textContent = err.message || 'Failed to send counter offer.'
                errEl2.style.display = 'block'
              }
              var submitBtn2 = document.getElementById('dr-counter-submit')
              if (submitBtn2) { submitBtn2.disabled = false; submitBtn2.textContent = 'Send counter' }
            }
          })
        }

        if (e.target.id === 'dr-confirm-delivery') {
          const btn = document.getElementById('dr-confirm-delivery')
          if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }
          try {
            var scaleTicketUrl = null;
            var scaleInput = document.getElementById('dr-scale-input');
            if (scaleInput && scaleInput.files && scaleInput.files[0]) {
              var fd = new FormData();
              fd.append('file', scaleInput.files[0]);
              fd.append('upload_preset', CLOUDINARY_PRESET);
              try {
                var uploadRes = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: fd });
                var uploadData = await uploadRes.json();
                scaleTicketUrl = uploadData.secure_url || null;
              } catch(uploadErr) {
                console.warn('Scale ticket upload failed, proceeding without it');
              }
            }

            const txSnap = await db.collection('transactions')
              .where('dealId', '==', dealId)
              .limit(1)
              .get()

            if (!txSnap.empty) {
              var txUpdates = {};
              if (user.uid === txSnap.docs[0].data().buyerUID) txUpdates.confirmedByBuyer = true;
              if (user.uid === txSnap.docs[0].data().producerUID) txUpdates.confirmedByProducer = true;
              if (scaleTicketUrl) txUpdates.scaleTicketUrl = scaleTicketUrl;
              await db.collection('transactions').doc(txSnap.docs[0].id).update(txUpdates);

              const updatedSnap = await db.collection('transactions').doc(txSnap.docs[0].id).get();
              const updated = updatedSnap.data();
              if (updated.confirmedByBuyer && updated.confirmedByProducer) {
                if (window.updateVerifiedStatus) {
                  if (updated.buyerUID) await window.updateVerifiedStatus(updated.buyerUID);
                  if (updated.producerUID) await window.updateVerifiedStatus(updated.producerUID);
                }
              }
            }
            await db.collection('deals').doc(dealId).update({
              deliveryConfirmed: true,
              status: 'Complete',
              completedAt: firebase.firestore.FieldValue.serverTimestamp()
            })
            openRatingModal(dealId, user.uid)
          } catch(err) {
            if (btn) { btn.disabled = false; btn.textContent = 'Confirm delivery received'; }
            alert('Failed to confirm delivery: ' + (err.message || 'Please try again.'))
          }
        }
      })
    }

    function sendMessage() {
      const input = document.getElementById('dr-message-input')
      if (!input || !input.value.trim()) return
      const text = input.value.trim()
      input.value = ''
      db.collection('users').doc(user.uid).get().then(function(profile) {
        const name = profile.exists ? (profile.data().businessName || profile.data().name || user.email) : user.email
        db.collection('deals').doc(dealId).collection('messages').add({
          senderUID: user.uid,
          senderName: name,
          text: text,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        })
      })
    }

    document.addEventListener('click', function(e) {
      if (e.target.id === 'dr-send-btn') sendMessage()
    })

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement && document.activeElement.id === 'dr-message-input') {
        e.preventDefault()
        sendMessage()
      }
    })

    window.__dealRoomUnsub = subscribeToDealRoom(
      dealId,
      function(nextDeal) {
        if (!nextDeal) return
        currentDeal = nextDeal
        renderInfoCard(nextDeal)
        injectDealRoomDeliveredCost(nextDeal)
        renderBidPanel(nextDeal, currentBids)
      },
      function(msgs) {
        currentMessages = msgs
        renderMessages(msgs)
      },
      function(bids) {
        currentBids = bids
        renderBidPanel(currentDeal, bids)
      }
    )
  })
}

document.addEventListener('DOMContentLoaded', async function() {
  const params = new URLSearchParams(window.location.search)
  const dealId = params.get('id')
  const listingId = params.get('listingId')

  if (!dealId && !listingId) {
    document.getElementById('dealroom-container').innerHTML =
      '<div style="padding:40px;text-align:center"><p>Deal room not found.</p><a href="buyer.html">← Back to listings</a></div>'
    return
  }

  auth.onAuthStateChanged(async function(user) {
    if (!user) {
      window.location.href = 'auth.html?role=buyer'
      return
    }

    let activeDealId = dealId

    if (!activeDealId && listingId) {
      const container = document.getElementById('dealroom-container')
      if (container) container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--color-text-muted)">Setting up your deal room...</div>'

      const existing = await db.collection('deals')
        .where('listingId', '==', listingId)
        .where('buyerUID', '==', user.uid)
        .where('status', '==', 'Open')
        .get()

      if (!existing.empty) {
        activeDealId = existing.docs[0].id
      } else {
        const listing = (window.LISTINGS || []).find(function(l) {
          return String(l.id) === String(listingId)
        })
        if (!listing) {
          if (container) container.innerHTML = '<div style="padding:40px;text-align:center"><p>Listing not found.</p><a href="buyer.html">← Back to listings</a></div>'
          return
        }
        const profile = await db.collection('users').doc(user.uid).get()
        const userProfile = profile.exists ? profile.data() : { businessName: user.email }
        activeDealId = await createDealRoom(listing, userProfile, user.uid)
      }

      history.replaceState(null, '', 'dealroom.html?id=' + activeDealId)
    }

    console.log('Deal room ID resolved:', activeDealId)

    const buyNowParam = params.get('buynow')
    if (buyNowParam === 'true' && listingId) {
      const listing = (window.LISTINGS || []).find(function(l) {
        return String(l.id) === String(listingId)
      })
      if (listing && activeDealId) {
        const profile = await db.collection('users').doc(user.uid).get()
        const userProfile = profile.exists ? profile.data() : { businessName: user.email }
        await buyNow(activeDealId, user.uid, userProfile.businessName, listing.minOrderTonnes, 'Buyer collects', '')
      }
    }

    console.log('Calling render with:', activeDealId)
    renderDealRoom(activeDealId, user)
  })
})
