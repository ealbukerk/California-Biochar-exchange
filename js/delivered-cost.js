(function () {

  // Fetch lat/lng for a ZIP code using zippopotam.us (free, no API key)
  function getCoords(zip) {
    return fetch('https://api.zippopotam.us/us/' + zip)
      .then(function (r) {
        if (!r.ok) throw new Error('ZIP not found');
        return r.json();
      })
      .then(function (data) {
        var place = data.places[0];
        return {
          lat: parseFloat(place.latitude),
          lng: parseFloat(place.longitude)
        };
      });
  }

  // Haversine distance in miles between two lat/lng points
  function haversine(a, b) {
    var R = 3958.8;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  // Calculate all cost components
  // Returns a promise resolving to cost breakdown object
  function calcDeliveredCost(opts) {
    // opts: { producerZip, buyerZip, pricePerTonne, tonnes, applicationRate, spreadCostPerTonne }
    var TRUCK_RATE = 4;      // $ per mile
    var TRUCK_CAPACITY = 20; // tons per truck

    return Promise.all([
      getCoords(opts.producerZip),
      getCoords(opts.buyerZip)
    ]).then(function (coords) {
      var distance = haversine(coords[0], coords[1]);
      var truckloads = Math.ceil(opts.tonnes / TRUCK_CAPACITY);
      var transportCostPerTonne = (distance * TRUCK_RATE * 2) / TRUCK_CAPACITY;
      var spreadCost = opts.spreadCostPerTonne || 60;

      var materialCost = opts.pricePerTonne * opts.tonnes;
      var transportCost = transportCostPerTonne * opts.tonnes;
      var applicationCost = spreadCost * opts.tonnes;
      var totalCost = materialCost + transportCost + applicationCost;
      var deliveredPerTonne = opts.pricePerTonne + transportCostPerTonne + spreadCost;
      var costPerAcre = opts.applicationRate > 0
        ? deliveredPerTonne * opts.applicationRate
        : null;

      return {
        distance: Math.round(distance),
        truckloads: truckloads,
        materialCost: materialCost,
        transportCost: transportCost,
        applicationCost: applicationCost,
        totalCost: totalCost,
        deliveredPerTonne: deliveredPerTonne,
        transportCostPerTonne: transportCostPerTonne,
        spreadCostPerTonne: spreadCost,
        costPerAcre: costPerAcre
      };
    });
  }

  window.DeliveredCost = {
    calc: calcDeliveredCost
  };

})();
