(function () {
  'use strict';

  // Tiered trucking rates per mile (one way)
  var TRUCK_CAPACITY_TONS = 20;
  var TRUCK_CAPACITY_M3 = 70; // typical walking floor volume in cubic meters

  // Biochar bulk density by feedstock type (kg/m³)
  // Affects whether truck hits weight or volume limit first
  var BIOCHAR_DENSITY = {
    'Almond Shell':     350,
    'Walnut Shell':     320,
    'Rice Husk':        200,
    'Corn Stover':      180,
    'Wood Chip':        300,
    'Forest Residue':   280,
    'default':          280
  };

  // Biomass bulk density by type (kg/m³) — pre-pyrolysis
  var BIOMASS_DENSITY = {
    orchard_prunings:   250,
    almond_shells:      300,
    pistachio_shells:   310,
    walnut_shells:      320,
    corn_stover:        150,
    rice_husks:         180,
    forestry_slash:     200,
    logging_residue:    220,
    thinning_material:  210,
    clean_wood_waste:   260,
    construction_wood:  280,
    tree_service_chips: 240,
    default:            230
  };

  function getTruckRate(distanceMiles) {
    if (distanceMiles <= 50) return 5.00;
    if (distanceMiles <= 150) return 4.00;
    return 3.25;
  }

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

  function haversine(a, b) {
    var R = 3958.8;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  // Adjust for moisture: wet weight = dry weight / (1 - moisture/100)
  // If 20% moisture, you need 1.25 tons shipped to deliver 1 dry ton
  function moistureAdjustedTons(dryTonnes, moisturePercent) {
    if (!moisturePercent || moisturePercent <= 0) return dryTonnes;
    var factor = 1 / (1 - (moisturePercent / 100));
    return dryTonnes * factor;
  }

  // Calculate truckloads accounting for density/volume constraint
  function calcTruckloads(physicalTons, feedstockKey, isBiochar) {
    var densityMap = isBiochar ? BIOCHAR_DENSITY : BIOMASS_DENSITY;
    var density = densityMap[feedstockKey] || densityMap['default'];
    // Volume in m³ for the shipment
    var volumeM3 = (physicalTons * 1000) / density; // tons → kg → m³
    var byWeight = physicalTons / TRUCK_CAPACITY_TONS;
    var byVolume = volumeM3 / TRUCK_CAPACITY_M3;
    // Binding constraint is whichever requires more trucks
    return Math.ceil(Math.max(byWeight, byVolume));
  }

  function calcDeliveredCost(opts) {
    // opts: {
    //   producerZip, buyerZip, pricePerTonne, tonnes,
    //   applicationRate, spreadCostPerTonne,
    //   moisturePercent (optional, 0-100),
    //   feedstockType (optional, for density lookup),
    //   isBiochar (optional, default true),
    //   hasBiomassBackhaul (optional, shows backhaul note)
    // }
    var isBiochar = opts.isBiochar !== false;
    var moisturePct = opts.moisturePercent || 0;
    var physicalTons = moistureAdjustedTons(opts.tonnes, moisturePct);
    var moistureAdjustmentFactor = physicalTons / opts.tonnes;

    return Promise.all([
      getCoords(opts.producerZip),
      getCoords(opts.buyerZip)
    ]).then(function (coords) {
      var distance = haversine(coords[0], coords[1]);
      var ratePerMile = getTruckRate(distance);
      var truckloads = calcTruckloads(physicalTons, opts.feedstockType || 'default', isBiochar);

      // Transport cost = (distance × rate × 2 roundtrip × truckloads) / physical tons shipped
      var transportCostTotal = distance * ratePerMile * 2 * truckloads;
      var transportCostPerTonne = transportCostTotal / opts.tonnes;

      var spreadCost = opts.spreadCostPerTonne || 60;
      var materialCost = opts.pricePerTonne * opts.tonnes;
      var transportCost = transportCostPerTonne * opts.tonnes;
      var applicationCost = isBiochar ? (spreadCost * opts.tonnes) : 0;
      var totalCost = materialCost + transportCost + applicationCost;
      var deliveredPerTonne = opts.pricePerTonne + transportCostPerTonne + (isBiochar ? spreadCost : 0);
      var costPerAcre = (isBiochar && opts.applicationRate > 0)
        ? deliveredPerTonne * opts.applicationRate
        : null;

      return {
        distance: Math.round(distance),
        truckloads: truckloads,
        physicalTons: Math.round(physicalTons * 10) / 10,
        moistureAdjustmentFactor: Math.round(moistureAdjustmentFactor * 100) / 100,
        ratePerMile: ratePerMile,
        materialCost: materialCost,
        transportCost: transportCost,
        applicationCost: applicationCost,
        totalCost: totalCost,
        deliveredPerTonne: deliveredPerTonne,
        transportCostPerTonne: transportCostPerTonne,
        spreadCostPerTonne: spreadCost,
        costPerAcre: costPerAcre,
        backhaulNote: opts.hasBiomassBackhaul
          ? 'You have biomass available — a combined delivery run could reduce net transport cost by up to 40%. List it on the Biomass Market.'
          : null
      };
    });
  }

  window.DeliveredCost = {
    calc: calcDeliveredCost,
    getTruckRate: getTruckRate,
    moistureAdjustedTons: moistureAdjustedTons,
    BIOCHAR_DENSITY: BIOCHAR_DENSITY,
    BIOMASS_DENSITY: BIOMASS_DENSITY
  };
})();
