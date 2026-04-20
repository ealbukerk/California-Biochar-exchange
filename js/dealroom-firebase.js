(function () {
  "use strict";
  function db() { return firebase.firestore(); }
  function dealRef(dealId) { return db().collection("deals").doc(dealId); }
  function bidsRef(dealId) { return dealRef(dealId).collection("bids"); }
  function messagesRef(dealId) { return dealRef(dealId).collection("messages"); }
  async function getDeal(dealId) {
    var snap = await dealRef(dealId).get();
    return snap.exists ? Object.assign({ id: snap.id }, snap.data()) : null;
  }
  async function getOpenDealByListingAndBuyer(listingId, buyerUID) {
    var snap = await db().collection("deals").where("listingId", "==", listingId).where("buyerUID", "==", buyerUID).where("status", "==", "Open").get();
    return snap.empty ? null : Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
  }
  async function createDealRoom(listing, buyerProfile, buyerUID) {
    var fullValue = listing.availableTonnes * listing.pricePerTonne;
    var seventyValue = fullValue * 0.7;
    var fortyValue = fullValue * 0.4;
    var complexity = fullValue < 25000 || seventyValue < 25000 ? { bracket: "small", label: "Small deal", estimatedValue: fullValue < 25000 ? fullValue : seventyValue, maxRounds: 4, expiryDays: 14, extensionDays: 3 } : seventyValue < 100000 ? { bracket: "medium", label: "Mid-size deal", estimatedValue: seventyValue, maxRounds: 6, expiryDays: 14, extensionDays: 3 } : fortyValue >= 100000 ? { bracket: "large", label: "Large deal", estimatedValue: fortyValue, maxRounds: 8, expiryDays: 30, extensionDays: 3 } : { bracket: "medium", label: "Mid-size deal", estimatedValue: fortyValue, maxRounds: 6, expiryDays: 14, extensionDays: 3 };
    var comparables = (window.LISTINGS || []).filter(function (item) { return item.feedstock === listing.feedstock && item.id !== listing.id; });
    var fairPrice = !comparables.length ? null : (function () {
      var prices = comparables.map(function (item) { return item.pricePerTonne; });
      var avg = prices.reduce(function (a, b) { return a + b; }, 0) / prices.length;
      var spread = comparables.length >= 3 ? 0.08 : 0.15;
      return { average: Math.round(avg), low: Math.round(avg * (1 - spread)), high: Math.round(avg * (1 + spread)), confidence: comparables.length >= 3 ? "high" : "limited", comparableCount: comparables.length };
    })();
    var expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + complexity.expiryDays);
    var ref = await db().collection("deals").add({
      listingId: listing.id, listingData: listing, producerName: listing.producerName, producerUID: listing.producerUID || null,
      buyerUID: buyerUID, buyerName: buyerProfile.businessName || buyerProfile.name || "", buyerEmail: buyerProfile.email || "",
      producerEmail: listing.contactEmail || "", feedstock: listing.feedstock, listedPricePerTonne: listing.pricePerTonne,
      availableTonnes: listing.availableTonnes, minOrderTonnes: listing.minOrderTonnes, hardFloor: listing.hardFloor || null,
      fairPriceRange: fairPrice, fairPriceMin: fairPrice ? fairPrice.low : null, fairPriceMax: fairPrice ? fairPrice.high : null,
      dealComplexity: complexity.label, complexity: complexity, roundsUsed: 0, maxRounds: complexity.maxRounds, status: "Open",
      extensionUsed: false, extensionRequested: null, extensionRequestedBy: null, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      expiryDate: expiryDate, agreedTerms: null
    });
    return ref.id;
  }
  function onDealSnapshot(dealId, callback, onError) {
    return dealRef(dealId).onSnapshot(function (snap) { callback(snap.exists ? Object.assign({ id: snap.id }, snap.data()) : null); }, onError || function () {});
  }
  function onMessagesSnapshot(dealId, callback, onError) {
    return messagesRef(dealId).orderBy("timestamp").onSnapshot(function (snap) { callback(snap.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); })); }, onError || function () {});
  }
  function onBidsSnapshot(dealId, callback, onError) {
    return bidsRef(dealId).orderBy("timestamp").onSnapshot(function (snap) { callback(snap.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); })); }, onError || function () {});
  }
  async function submitBid(dealId, payload) {
    var ref = await bidsRef(dealId).add(Object.assign({}, payload, { status: payload.status || "Pending", timestamp: firebase.firestore.FieldValue.serverTimestamp() }));
    await dealRef(dealId).update({ roundsUsed: firebase.firestore.FieldValue.increment(1), lastActivityAt: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  }
  async function respondToBid(dealId, bidId, responderUID, action, counterVolume, counterPrice, counterDeliveryMethod, counterDeliveryDate, counterNotes) {
    var deal = await getDeal(dealId);
    var bidDoc = bidsRef(dealId).doc(bidId);
    if (action === "accept") {
      var bid = (await bidDoc.get()).data();
      await bidDoc.update({ status: "Accepted" });
      await dealRef(dealId).update({ status: "Agreed", agreedTerms: { volume: bid.volume, pricePerTonne: bid.pricePerTonne, totalValue: bid.totalValue, commissionRate: bid.commissionRate, commissionAmount: bid.commissionAmount, deliveryMethod: bid.deliveryMethod, deliveryDate: bid.deliveryDate, agreedAt: firebase.firestore.FieldValue.serverTimestamp() } });
      return { agreed: true };
    }
    if (action === "reject") {
      await bidDoc.update({ status: "Rejected" });
      if (deal && deal.roundsUsed >= deal.maxRounds) await dealRef(dealId).update({ status: "Expired" });
      return { agreed: false, rejected: true };
    }
    if (action === "counter") {
      await bidDoc.update({ status: "Countered" });
      return submitBid(dealId, { bidderUID: responderUID, bidderName: null, bidderRole: null, volume: counterVolume, pricePerTonne: counterPrice, totalValue: counterVolume * counterPrice, commissionRate: window.calculateCommission(counterVolume * counterPrice).rateDisplay, commissionAmount: window.calculateCommission(counterVolume * counterPrice).commissionAmount, deliveryMethod: counterDeliveryMethod, deliveryDate: counterDeliveryDate, notes: counterNotes });
    }
    return null;
  }
  function sendMessage(dealId, payload) {
    return messagesRef(dealId).add(Object.assign({}, payload, {
      type: payload && payload.type ? payload.type : "text",
      fileUrl: payload && payload.fileUrl ? payload.fileUrl : null,
      fileName: payload && payload.fileName ? payload.fileName : null,
      fileType: payload && payload.fileType ? payload.fileType : null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }));
  }
  function updateDealStatus(dealId, patch) { return dealRef(dealId).update(patch); }
  async function acceptBid(dealId, bid) {
    await dealRef(dealId).update({ status: "Agreed", agreedBid: { volumeTonnes: bid.volumeTonnes, pricePerTonne: bid.pricePerTonne, deliveryMethod: bid.deliveryMethod, deliveryDate: bid.deliveryDate }, agreedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return bidsRef(dealId).doc(bid.id).update({ status: "Accepted" });
  }
  function rejectBid(dealId, bidId) { return bidsRef(dealId).doc(bidId).update({ status: "Rejected" }); }
  function createTransaction(data, airtableFields) {
    var write = db().collection("transactions").add(Object.assign({}, data, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
    if (typeof submitToAirtable === "function") submitToAirtable("Transactions", airtableFields || data);
    return write;
  }
  function queueEmail(payload) { return db().collection("mail").add(payload); }
  async function confirmDelivery(dealId, userId, scaleTicketUrl) {
    var snap = await db().collection("transactions").where("dealId", "==", dealId).limit(1).get();
    if (snap.empty) return null;
    var doc = snap.docs[0];
    var tx = doc.data();
    var updates = {};
    if (userId === tx.buyerUID) updates.confirmedByBuyer = true;
    if (userId === tx.producerUID) updates.confirmedByProducer = true;
    if (scaleTicketUrl) updates.scaleTicketUrl = scaleTicketUrl;
    await db().collection("transactions").doc(doc.id).update(updates);
    var updated = (await db().collection("transactions").doc(doc.id).get()).data();
    await dealRef(dealId).update({ deliveryConfirmed: true, status: "Complete", completedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return Object.assign({ id: doc.id }, updated);
  }
  async function updateUserStats(userId, patch) {
    if (!userId) return null;
    await db().collection("users").doc(userId).update(patch);
    return patch;
  }
  async function submitRating(dealId, raterUID, stars, note) {
    await db().collection("ratings").add({ dealId: dealId, raterUID: raterUID, stars: stars, note: note || null, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    var deal = await getDeal(dealId);
    if (!deal) return null;
    var ratedUID = raterUID === deal.buyerUID ? deal.producerUID : deal.buyerUID;
    if (!ratedUID) return null;
    var existing = await db().collection("ratings").where("ratedUID", "==", ratedUID).get();
    var total = stars;
    var count = 1;
    existing.forEach(function (item) { if (item.data().stars) { total += item.data().stars; count += 1; } });
    await updateUserStats(ratedUID, { averageRating: Math.round(total / count * 10) / 10, ratingsCount: count });
    await db().collection("ratings").add({ dealId: dealId, raterUID: raterUID, ratedUID: ratedUID, stars: stars, note: note || null, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    return { ratedUID: ratedUID, averageRating: Math.round(total / count * 10) / 10, ratingsCount: count };
  }
  async function buyNow(dealId, deal, volume, deliveryMethod, deliveryDate) {
    var total = volume * deal.listedPricePerTonne;
    var commission = window.calculateCommission(total);
    return dealRef(dealId).update({ status: "Agreed", agreedTerms: { volume: volume, pricePerTonne: deal.listedPricePerTonne, totalValue: total, commissionRate: commission.rateDisplay, commissionAmount: commission.commissionAmount, deliveryMethod: deliveryMethod, deliveryDate: deliveryDate, agreedAt: firebase.firestore.FieldValue.serverTimestamp() } });
  }
  async function requestExtension(dealId, requesterUID) {
    var deal = await getDeal(dealId);
    if (deal && deal.extensionUsed) throw new Error("Extension already used");
    return dealRef(dealId).update({ extensionRequested: true, extensionRequestedBy: requesterUID });
  }
  async function respondToExtension(dealId, accept) {
    var deal = await getDeal(dealId);
    if (!deal) return null;
    if (accept) {
      var newExpiry = new Date(deal.expiryDate.toDate());
      newExpiry.setDate(newExpiry.getDate() + deal.complexity.extensionDays);
      return dealRef(dealId).update({ expiryDate: newExpiry, extensionUsed: true, extensionRequested: false });
    }
    return dealRef(dealId).update({ extensionRequested: false, extensionRequestedBy: null });
  }
  async function getThirdPartyProviders() {
    var snap = await db().collection("users").where("role", "==", "third_party").get();
    return snap.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); });
  }
  window.DealroomFirebase = {
    getDeal: getDeal, getOpenDealByListingAndBuyer: getOpenDealByListingAndBuyer, createDealRoom: createDealRoom,
    onDealSnapshot: onDealSnapshot, onMessagesSnapshot: onMessagesSnapshot, onBidsSnapshot: onBidsSnapshot,
    submitBid: submitBid, respondToBid: respondToBid, sendMessage: sendMessage, updateDealStatus: updateDealStatus,
    acceptBid: acceptBid, rejectBid: rejectBid, createTransaction: createTransaction, confirmDelivery: confirmDelivery,
    submitRating: submitRating, queueEmail: queueEmail, updateUserStats: updateUserStats, buyNow: buyNow,
    getThirdPartyProviders: getThirdPartyProviders, requestExtension: requestExtension, respondToExtension: respondToExtension
  };
})();
