(function () {
  "use strict";

  var listeners = [];
  var TRANSITIONS = {
    Open: ["Agreed", "Expired", "Cancelled"],
    Agreed: ["Complete", "Cancelled"],
    Complete: [],
    Expired: [],
    Cancelled: []
  };

  var _state = {
    deal: null,
    bids: [],
    messages: [],
    currentUser: null,
    profile: null,
    listing: null,
    isLoading: true,
    error: "",
    userRole: null,
    latestBid: null,
    canBid: false,
    canAccept: false,
    canCounter: false,
    canConfirmDelivery: false
  };

  function cloneState() {
    return Object.assign({}, _state);
  }

  function recompute() {
    var deal = _state.deal || {};
    var user = _state.currentUser || {};
    var latestBid = _state.bids.length ? _state.bids[_state.bids.length - 1] : null;
    var pendingBid = latestBid && latestBid.status === "Pending" ? latestBid : null;
    var userRole = null;
    if (user.uid && deal.buyerUID === user.uid) userRole = "buyer";
    if (user.uid && deal.producerUID === user.uid) userRole = "producer";
    _state.userRole = userRole;
    _state.latestBid = latestBid;
    _state.canBid = !!(deal.status === "Open" && userRole && (!pendingBid || pendingBid.bidderUID !== user.uid));
    _state.canAccept = !!(deal.status === "Open" && pendingBid && pendingBid.bidderUID !== user.uid && userRole);
    _state.canCounter = _state.canAccept;
    _state.canConfirmDelivery = !!(deal.status === "Agreed" && userRole);
  }

  function notify() {
    var snapshot = cloneState();
    listeners.slice().forEach(function (listener) {
      listener(snapshot);
    });
  }

  function setPartial(next) {
    _state = Object.assign({}, _state, next);
    recompute();
    notify();
  }

  window.DealroomState = {
    subscribe: function (listener) {
      listeners.push(listener);
      listener(cloneState());
      return function () {
        listeners = listeners.filter(function (item) { return item !== listener; });
      };
    },
    getState: function () {
      return cloneState();
    },
    setDeal: function (deal) {
      setPartial({ deal: deal || null });
    },
    setBids: function (bids) {
      setPartial({ bids: Array.isArray(bids) ? bids : [] });
    },
    setMessages: function (messages) {
      setPartial({ messages: Array.isArray(messages) ? messages : [] });
    },
    setUser: function (currentUser, profile) {
      setPartial({ currentUser: currentUser || null, profile: profile || null });
    },
    setListing: function (listing) {
      setPartial({ listing: listing || null });
    },
    setLoading: function (isLoading) {
      setPartial({ isLoading: !!isLoading });
    },
    setError: function (error) {
      setPartial({ error: error || "" });
    },
    canTransitionTo: function (nextStatus) {
      var current = (_state.deal && _state.deal.status) || "Open";
      return (TRANSITIONS[current] || []).indexOf(nextStatus) !== -1;
    },
    computeCommission: function (amount) {
      return typeof window.calculateCommission === "function"
        ? window.calculateCommission(amount)
        : { rate: 0, rateDisplay: "0%", commissionAmount: 0, bracketLabel: "" };
    },
    isBelowHardFloor: function (pricePerTonne) {
      var floor = Number(_state.deal && _state.deal.hardFloor);
      return !!(floor && Number(pricePerTonne) < floor);
    }
  };
})();
