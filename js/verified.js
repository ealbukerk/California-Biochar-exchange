async function checkVerifiedStatus(userUID) {
  const transactionsSnap = await db.collection('transactions')
    .where('status', '==', 'Completed')
    .get()

  const userTransactions = transactionsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(t => t.buyerUID === userUID || t.producerUID === userUID)

  if (userTransactions.length < 3) {
    return { verified: false, reason: 'Minimum 3 completed transactions required', transactions: userTransactions.length }
  }

  const confirmed = userTransactions.filter(t => {
    if (t.buyerUID === userUID) return t.confirmedByBuyer === true
    if (t.producerUID === userUID) return t.confirmedByProducer === true
    return false
  })

  const confirmationRate = confirmed.length / userTransactions.length

  const ratings = userTransactions
    .map(t => {
      if (t.buyerUID === userUID) return t.buyerRating
      if (t.producerUID === userUID) return t.producerRating
      return null
    })
    .filter(r => r !== null && r !== undefined)

  const averageRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 0

  const verified = confirmationRate >= 0.9 && averageRating >= 4.0

  return {
    verified,
    confirmationRate: Math.round(confirmationRate * 100),
    averageRating: Math.round(averageRating * 10) / 10,
    totalTransactions: userTransactions.length,
    reason: verified ? 'All conditions met' :
      confirmationRate < 0.9 ? 'Delivery confirmation rate below 90%' : 'Average rating below 4.0'
  }
}

async function updateVerifiedStatus(userUID) {
  const status = await checkVerifiedStatus(userUID)
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
