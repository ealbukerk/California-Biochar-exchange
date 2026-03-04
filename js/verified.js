window.checkVerifiedStatus = async function(userUID) {
  try {
    const transactionsSnap = await db.collection('transactions')
      .where('status', '==', 'Completed')
      .get()
    
    const userTransactions = transactionsSnap.docs
      .map(function(d) { return Object.assign({ id: d.id }, d.data()) })
      .filter(function(t) { return t.buyerUID === userUID || t.producerUID === userUID })
    
    if (userTransactions.length < 3) {
      return { verified: false, reason: 'Minimum 3 completed transactions required', totalTransactions: userTransactions.length, confirmationRate: 0, averageRating: 0 }
    }
    
    var confirmed = userTransactions.filter(function(t) {
      if (t.buyerUID === userUID) return t.confirmedByBuyer === true
      if (t.producerUID === userUID) return t.confirmedByProducer === true
      return false
    })
    
    var confirmationRate = confirmed.length / userTransactions.length
    
    var ratings = userTransactions
      .map(function(t) {
        if (t.buyerUID === userUID) return t.buyerRating
        if (t.producerUID === userUID) return t.producerRating
        return null
      })
      .filter(function(r) { return r !== null && r !== undefined })
    
    var averageRating = ratings.length > 0
      ? ratings.reduce(function(a, b) { return a + b }, 0) / ratings.length
      : 0
    
    var verified = confirmationRate >= 0.9 && averageRating >= 4.0
    
    return {
      verified: verified,
      confirmationRate: Math.round(confirmationRate * 100),
      averageRating: Math.round(averageRating * 10) / 10,
      totalTransactions: userTransactions.length,
      reason: verified ? 'All conditions met' : confirmationRate < 0.9 ? 'Delivery confirmation rate below 90%' : 'Average rating below 4.0'
    }
  } catch (err) {
    console.error('checkVerifiedStatus error:', err)
    return { verified: false, reason: 'Could not load transaction data', totalTransactions: 0, confirmationRate: 0, averageRating: 0 }
  }
}

window.updateVerifiedStatus = async function(userUID) {
  var status = await window.checkVerifiedStatus(userUID)
  await db.collection('users').doc(userUID).update({
    verified: status.verified,
    verifiedStats: {
      confirmationRate: status.confirmationRate,
      averageRating: status.averageRating,
      totalTransactions: status.totalTransactions,
      lastChecked: firebase.firestore.FieldValue.serverTimestamp()
    }
  })
  return status
}

window.renderVerifiedBadge = function() {
  return '<span class="verified-badge" title="Verified — 90%+ delivery confirmation and 4.0+ average rating">✓ Verified</span>'
}
