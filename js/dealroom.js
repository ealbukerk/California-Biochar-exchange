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

  if (__dealRoomUnsub) {
    __dealRoomUnsub()
    __dealRoomUnsub = null
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

    container.innerHTML = '<div style="padding:24px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface)">' +
      '<h2 style="margin:0 0 8px 0">Deal room</h2>' +
      '<p style="margin:0;color:var(--color-text-secondary)">Loading live deal data...</p>' +
      '</div>'

    __dealRoomUnsub = subscribeToDealRoom(
      dealId,
      function onDealUpdate(nextDeal) {
        if (!nextDeal) return
        var listingData = nextDeal.listingData
        if (!listingData && nextDeal.listingId) {
          listingData = (window.LISTINGS || []).find(function(l) {
            return String(l.id) === String(nextDeal.listingId)
          })
        }
        const status = nextDeal.status || 'Open'
        const roundsUsed = Number(nextDeal.roundsUsed || 0)
        const maxRounds = Number(nextDeal.maxRounds || 0)
        container.innerHTML =
          '<div style="display:grid;gap:12px;padding:24px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface)">' +
          '<h2 style="margin:0">Deal room</h2>' +
          '<p style="margin:0;color:var(--color-text-secondary)"><strong>Feedstock:</strong> ' + (nextDeal.feedstock || (listingData && listingData.feedstock) || '—') + '</p>' +
          '<p style="margin:0;color:var(--color-text-secondary)"><strong>Producer:</strong> ' + (nextDeal.producerName || (listingData && listingData.producerName) || '—') + '</p>' +
          '<p style="margin:0;color:var(--color-text-secondary)"><strong>Buyer:</strong> ' + (nextDeal.buyerName || '—') + '</p>' +
          '<p style="margin:0;color:var(--color-text-secondary)"><strong>Status:</strong> ' + status + '</p>' +
          '<p style="margin:0;color:var(--color-text-secondary)"><strong>Rounds:</strong> ' + (roundsUsed + 1) + '/' + maxRounds + '</p>' +
          '</div>'
      },
      function onMessagesUpdate() {},
      function onBidsUpdate() {}
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
