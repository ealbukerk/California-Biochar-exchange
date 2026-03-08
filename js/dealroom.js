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

async function submitBid(dealId, bidderUID, bidderName, bidderRole, volume, pricePerTonne, deliveryMethod, deliveryDate, notes) {
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
  return { agreed: true }
}

async function createTransactionFromDeal(dealId, deal, agreedTerms) {
  if (typeof submitToAirtable !== 'function') {
    console.log('Airtable not available - transaction saved to Firestore only')
    return
  }

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
      '<div style="display:grid;grid-template-columns:1fr 380px;gap:24px;align-items:start">' +
        '<div>' +
          '<div id="dr-info-card" style="background:var(--color-accent-light);border:1px solid var(--color-accent);border-radius:12px;padding:20px;margin-bottom:20px"></div>' +
          '<div id="dr-chat-thread" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;padding:20px;min-height:300px;max-height:480px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:12px"></div>' +
          '<div style="display:flex;gap:8px">' +
            '<textarea id="dr-message-input" placeholder="Type a message..." style="flex:1;height:48px;resize:none;padding:12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px;font-family:var(--font-sans)"></textarea>' +
            '<button id="dr-send-btn" class="btn btn-primary" style="white-space:nowrap">Send</button>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div id="dr-bid-panel" style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;padding:20px"></div>' +
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
        '</div>'
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
          '<div style="text-align:center;padding:20px">' +
            '<div style="font-size:40px;margin-bottom:12px">🎉</div>' +
            '<h3 style="color:#2E7D32;margin:0 0 16px 0">Deal agreed!</h3>' +
            '<div style="background:var(--color-bg);border-radius:8px;padding:16px;text-align:left;margin-bottom:16px">' +
              '<p style="margin:0 0 8px 0;font-size:14px"><strong>Volume:</strong> ' + (ab.volumeTonnes || '—') + ' tonnes</p>' +
              '<p style="margin:0 0 8px 0;font-size:14px"><strong>Price:</strong> $' + (ab.pricePerTonne || '—') + '/tonne</p>' +
              '<p style="margin:0 0 8px 0;font-size:14px"><strong>Total:</strong> $' + (ab.volumeTonnes && ab.pricePerTonne ? (ab.volumeTonnes * ab.pricePerTonne).toLocaleString() : '—') + '</p>' +
              '<p style="margin:0;font-size:14px"><strong>Delivery:</strong> ' + (ab.deliveryMethod || '—') + '</p>' +
            '</div>' +
            '<button id="dr-confirm-delivery" class="btn btn-primary" style="width:100%;margin-bottom:8px">Confirm delivery received</button>' +
          '</div>'
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
              '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px">Delivery method</label>' +
              '<select id="dr-delivery" style="width:100%;height:42px;padding:0 12px;border:1px solid var(--color-border);border-radius:8px;font-size:14px">' +
                '<option>Buyer collects</option>' +
                '<option>Producer delivers</option>' +
                '<option>Third party freight</option>' +
              '</select>' +
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

        document.getElementById('dr-submit-bid-btn').addEventListener('click', async function() {
          const vol = parseFloat(document.getElementById('dr-volume').value)
          const pr = parseFloat(document.getElementById('dr-price').value)
          const delivery = document.getElementById('dr-delivery').value
          const deliveryDate = document.getElementById('dr-delivery-date').value
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

        if (e.target.id === 'dr-confirm-delivery') {
          await db.collection('deals').doc(dealId).update({
            deliveryConfirmed: true,
            status: 'Complete',
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
          })
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
