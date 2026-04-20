const admin = require('firebase-admin');
const functions = require('firebase-functions');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.expireListings = functions.pubsub.schedule('every 24 hours').onRun(async function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  async function expireCollection(collectionName, dateField) {
    const snap = await db.collection(collectionName)
      .where('status', '==', 'active')
      .where(dateField, '<', todayIso)
      .get();

    if (snap.empty) return 0;

    const batch = db.batch();
    let count = 0;
    snap.forEach(function (doc) {
      batch.update(doc.ref, {
        status: 'expired',
        expiredAt: admin.firestore.FieldValue.serverTimestamp()
      });
      count += 1;
    });
    await batch.commit();
    return count;
  }

  const biocharExpired = await expireCollection('listings', 'availableUntil');
  const feedstockExpired = await expireCollection('feedstock_listings', 'harvestDate');

  return {
    biocharExpired: biocharExpired,
    feedstockExpired: feedstockExpired
  };
});
