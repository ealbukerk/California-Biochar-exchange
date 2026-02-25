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

  await submitToAirtable('Transactions', {
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
