(function () {
  'use strict';

  // Marketplace-specific assumptions. Biochar ships in denser, more bag/bulk-flexible loads;
  // biomass procurement is typically walking-floor / chip van logistics with bigger volume limits.
  var TRUCK_SPECS = {
    biochar: { weightTons: 22, volumeM3: 80, handlingPerLoad: 65, roundTripFactor: 1.85 },
    biomass: { weightTons: 24, volumeM3: 95, handlingPerLoad: 45, roundTripFactor: 1.9 }
  };

  var BIOCHAR_DENSITY = {
    'Almond Shell': 350,
    'Walnut Shell': 320,
    'Rice Husk': 200,
    'Corn Stover': 180,
    'Wood Chip': 300,
    'Forest Residue': 280,
    'default': 280
  };

  var BIOMASS_DENSITY = {
    orchard_prunings: 250,
    almond_shells: 300,
    pistachio_shells: 310,
    walnut_shells: 320,
    corn_stover: 150,
    rice_husks: 180,
    forestry_slash: 200,
    logging_residue: 220,
    thinning_material: 210,
    clean_wood_waste: 260,
    construction_wood: 280,
    tree_service_chips: 240,
    default: 230
  };

  var zipGeoCache = window._zipGeoCache || (window._zipGeoCache = {});
  var routeDistanceCache = window._routeDistanceCache || (window._routeDistanceCache = {});

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getMarketKey(opts) {
    return opts && opts.isBiochar === false ? 'biomass' : 'biochar';
  }

  // These rates already include a modest fuel surcharge and represent billed loaded-mile rates.
  function getTruckRate(distanceMiles, marketKey) {
    var base;
    if (marketKey === 'biomass') {
      if (distanceMiles <= 50) base = 4.1;
      else if (distanceMiles <= 150) base = 3.45;
      else if (distanceMiles <= 300) base = 2.9;
      else base = 2.55;
    } else {
      if (distanceMiles <= 50) base = 4.35;
      else if (distanceMiles <= 150) base = 3.65;
      else if (distanceMiles <= 300) base = 3.05;
      else base = 2.75;
    }
    return base * 1.12;
  }

  function getCoords(zip) {
    var normalized = String(zip || '').trim();
    if (!/^\d{5}$/.test(normalized)) return Promise.reject(new Error('ZIP missing'));
    if (zipGeoCache[normalized]) return zipGeoCache[normalized];
    var promise = fetch('https://api.zippopotam.us/us/' + normalized)
      .then(function (response) {
        if (!response.ok) throw new Error('ZIP not found');
        return response.json();
      })
      .then(function (data) {
        var place = data && data.places && data.places[0];
        if (!place) throw new Error('ZIP not found');
        return {
          lat: parseFloat(place.latitude),
          lng: parseFloat(place.longitude)
        };
      });
    zipGeoCache[normalized] = promise.catch(function (error) {
      delete zipGeoCache[normalized];
      throw error;
    });
    return zipGeoCache[normalized];
  }

  function haversine(a, b) {
    var R = 3958.8;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function getDistanceMiles(producerZip, buyerZip) {
    var key = String(producerZip || '') + '|' + String(buyerZip || '');
    if (routeDistanceCache[key]) return routeDistanceCache[key];

    routeDistanceCache[key] = Promise.all([getCoords(producerZip), getCoords(buyerZip)])
      .then(function (coords) {
        var origin = coords[0];
        var destination = coords[1];
        var fallbackDistance = haversine(origin, destination);
        var url = 'https://router.project-osrm.org/route/v1/driving/' +
          origin.lng + ',' + origin.lat + ';' + destination.lng + ',' + destination.lat + '?overview=false';

        return fetch(url)
          .then(function (response) {
            if (!response.ok) throw new Error('Route unavailable');
            return response.json();
          })
          .then(function (data) {
            if (!data || !data.routes || !data.routes[0]) return fallbackDistance;
            return data.routes[0].distance * 0.000621371;
          })
          .catch(function () {
            return fallbackDistance;
          });
      })
      .catch(function (error) {
        delete routeDistanceCache[key];
        throw error;
      });

    return routeDistanceCache[key];
  }

  // For biochar we treat buyer demand as a dry-use target and estimate shipped tonnage from moisture.
  // Biomass listings are typically quoted on as-received tons, so we do not re-inflate them for moisture.
  function moistureAdjustedTons(orderTons, moisturePercent, isBiochar) {
    var tons = Number(orderTons) || 0;
    if (!isBiochar) return tons;
    var moisture = clamp(Number(moisturePercent) || 0, 0, 25);
    if (moisture <= 0) return tons;
    return tons / (1 - (moisture / 100));
  }

  function calcTruckloads(shipmentTons, feedstockKey, marketKey) {
    var specs = TRUCK_SPECS[marketKey] || TRUCK_SPECS.biochar;
    var densityMap = marketKey === 'biomass' ? BIOMASS_DENSITY : BIOCHAR_DENSITY;
    var density = densityMap[feedstockKey] || densityMap.default;
    var volumeM3 = (shipmentTons * 1000) / density;
    var byWeight = shipmentTons / specs.weightTons;
    var byVolume = volumeM3 / specs.volumeM3;
    return Math.max(1, Math.ceil(Math.max(byWeight, byVolume)));
  }

  function calcDeliveredCost(opts) {
    var marketKey = getMarketKey(opts);
    var specs = TRUCK_SPECS[marketKey] || TRUCK_SPECS.biochar;
    var isBiochar = marketKey === 'biochar';
    var orderTons = Number(opts && opts.tonnes) || 0;
    var buyerZip = opts && opts.buyerZip;
    var producerZip = opts && opts.producerZip;
    var pricePerTonne = Number(opts && opts.pricePerTonne);

    if (!producerZip || !buyerZip || !orderTons || Number.isNaN(pricePerTonne)) {
      return Promise.reject(new Error('Insufficient cost inputs'));
    }

    var shipmentTons = moistureAdjustedTons(orderTons, opts.moisturePercent, isBiochar);
    var truckloads = calcTruckloads(shipmentTons, opts.feedstockType || 'default', marketKey);

    return getDistanceMiles(producerZip, buyerZip).then(function (distanceMiles) {
      var billedMiles = distanceMiles * specs.roundTripFactor;
      var ratePerMile = getTruckRate(distanceMiles, marketKey);
      var linehaulCost = billedMiles * ratePerMile * truckloads;
      var handlingCost = specs.handlingPerLoad * truckloads;
      var transportCostTotal = linehaulCost + handlingCost;
      var transportCostPerTonne = transportCostTotal / orderTons;
      var deliveredPerTonne = pricePerTonne + transportCostPerTonne;
      var spreadCostPerTonne = isBiochar ? Math.max(0, Number(opts.spreadCostPerTonne) || 0) : 0;
      var appliedPerTonne = isBiochar ? deliveredPerTonne + spreadCostPerTonne : deliveredPerTonne;
      var applicationRate = isBiochar ? Math.max(0, Number(opts.applicationRate) || 0) : 0;
      var costPerAcre = (isBiochar && applicationRate > 0) ? appliedPerTonne * applicationRate : null;
      var estimatedAcres = (isBiochar && applicationRate > 0) ? (orderTons / applicationRate) : null;

      return {
        market: marketKey,
        distance: Math.round(distanceMiles),
        billedMiles: Math.round(billedMiles),
        truckloads: truckloads,
        orderedTons: Math.round(orderTons * 10) / 10,
        shipmentTons: Math.round(shipmentTons * 10) / 10,
        ratePerMile: Math.round(ratePerMile * 100) / 100,
        linehaulCost: linehaulCost,
        handlingCost: handlingCost,
        transportCost: transportCostTotal,
        transportCostPerTonne: transportCostPerTonne,
        spreadCostPerTonne: spreadCostPerTonne,
        deliveredPerTonne: deliveredPerTonne,
        appliedPerTonne: appliedPerTonne,
        costPerAcre: costPerAcre,
        estimatedAcres: estimatedAcres,
        totalDeliveredCost: deliveredPerTonne * orderTons,
        totalAppliedCost: appliedPerTonne * orderTons
      };
    });
  }

  window.DeliveredCost = {
    calc: calcDeliveredCost,
    getCoords: getCoords,
    getDistanceMiles: getDistanceMiles,
    getTruckRate: getTruckRate,
    moistureAdjustedTons: moistureAdjustedTons,
    BIOCHAR_DENSITY: BIOCHAR_DENSITY,
    BIOMASS_DENSITY: BIOMASS_DENSITY
  };
})();
