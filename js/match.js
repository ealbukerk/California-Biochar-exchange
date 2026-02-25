(function () {
  var state = {
    crop: [],
    soilPh: "",
    goal: [],
    volume: "",
    fromDate: "",
    toDate: "",
    organic: "",
    county: "",
    locationState: "",
    geoDetected: false,
    manualLocation: ""
  };

  var currentStep = 1;
  var totalSteps = 4;
  var detectedCounty = "";
  var detectedState = "";

  function getRequiredFilled(step) {
    if (step === 1) {
      return Array.isArray(state.crop) && state.crop.length > 0;
    }

    if (step === 2) {
      return !!state.soilPh && Array.isArray(state.goal) && state.goal.length > 0;
    }

    if (step === 3) {
      return !!state.volume && Number(state.volume) >= 1;
    }

    if (step === 4) {
      return state.geoDetected || !!state.manualLocation.trim();
    }

    return false;
  }

  function updateProgress() {
    var label = document.getElementById("step-label");
    var fill = document.getElementById("progress-fill");
    var percent = (currentStep / totalSteps) * 100;

    label.textContent = "Step " + currentStep + " of " + totalSteps;
    fill.style.width = percent + "%";
  }

  function updateStepVisibility() {
    var steps = document.querySelectorAll(".step");
    var backBtn = document.getElementById("btn-back");
    var nextBtn = document.getElementById("btn-next");

    steps.forEach(function (stepEl) {
      var stepNumber = Number(stepEl.getAttribute("data-step"));
      stepEl.hidden = stepNumber !== currentStep;
    });

    backBtn.disabled = currentStep === 1;
    nextBtn.disabled = !getRequiredFilled(currentStep);
    nextBtn.textContent = currentStep === 4 ? "See Matches" : "Next";

    updateProgress();
  }

  function collectStateFromForm() {
    var selectedOrganic = document.querySelector('input[name="organic"]:checked');
    var manualInput = document.getElementById("county-manual");
    var manualLocation = manualInput ? manualInput.value.trim() : "";
    var cropEl = document.getElementById("ms-crop");
    var goalEl = document.getElementById("ms-goal");
    var cropValues = cropEl && typeof cropEl.getValue === "function" ? cropEl.getValue() : [];
    var goalValues = goalEl && typeof goalEl.getValue === "function" ? goalEl.getValue() : [];

    state.crop = cropValues.filter(function (value) { return value !== "All"; });
    state.soilPh = document.getElementById("soil-ph").value;
    state.goal = goalValues.filter(function (value) { return value !== "All"; });
    state.volume = document.getElementById("volume").value;
    state.fromDate = document.getElementById("date-from").value;
    state.toDate = document.getElementById("date-to").value;
    state.organic = selectedOrganic ? selectedOrganic.value : "";
    state.manualLocation = manualLocation;
    state.county = state.geoDetected ? detectedCounty : manualLocation;
    state.locationState = state.geoDetected ? detectedState : parseStateFromManual(manualLocation);
  }

  function parseStateFromManual(locationText) {
    if (!locationText) {
      return "";
    }

    var knownStates = [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
      "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
      "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
      "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York",
      "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
      "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
      "West Virginia", "Wisconsin", "Wyoming"
    ];

    var normalized = locationText.toLowerCase();
    var matched = knownStates.find(function (stateName) {
      return normalized.indexOf(stateName.toLowerCase()) !== -1;
    });

    return matched || "";
  }

  function getStateRegionBucket(stateName) {
    if (!stateName) {
      return "";
    }

    var buckets = {
      california: ["California"],
      pacific_northwest: ["Washington", "Oregon", "Idaho"],
      great_plains: ["Montana", "Wyoming", "Colorado", "New Mexico", "North Dakota", "South Dakota", "Nebraska", "Kansas", "Oklahoma", "Texas"],
      southeast: ["Florida", "Georgia", "South Carolina", "North Carolina", "Virginia", "West Virginia", "Kentucky", "Tennessee", "Alabama", "Mississippi", "Arkansas", "Louisiana"],
      northeast: ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania", "Delaware", "Maryland"],
      midwest: ["Ohio", "Michigan", "Indiana", "Illinois", "Wisconsin", "Minnesota", "Iowa", "Missouri"]
    };

    var key = Object.keys(buckets).find(function (bucketKey) {
      return buckets[bucketKey].indexOf(stateName) !== -1;
    });

    return key || "";
  }

  function getListingRegionBucket(regionName) {
    var regionBuckets = {
      california: ["Sacramento Valley", "San Joaquin Valley", "North Coast", "Central Coast", "Sierra Foothills"],
      pacific_northwest: ["Pacific Northwest"],
      great_plains: ["Great Plains"],
      southeast: ["Southeast"],
      northeast: ["Northeast"],
      midwest: ["Midwest"]
    };

    var key = Object.keys(regionBuckets).find(function (bucketKey) {
      return regionBuckets[bucketKey].indexOf(regionName) !== -1;
    });

    return key || "";
  }

  function isBroadRegionMatch(stateName, listingRegion) {
    var stateBucket = getStateRegionBucket(stateName);
    var regionBucket = getListingRegionBucket(listingRegion);
    return stateBucket && regionBucket && stateBucket === regionBucket;
  }

  function buildExplanation(score, reasons) {
    var prefix = "Possible match";

    if (score >= 80) {
      prefix = "Strong match";
    } else if (score >= 60) {
      prefix = "Good match";
    }

    if (reasons.length === 0) {
      return prefix + " - baseline compatibility based on your profile.";
    }

    if (reasons.length === 1) {
      return prefix + " - " + reasons[0] + ".";
    }

    var body = reasons.slice(0, -1).join(", ") + ", and " + reasons[reasons.length - 1];
    return prefix + " - " + body + ".";
  }

  function scoreListing(listing, user) {
    var score = 0;
    var reasons = [];
    var cropMatches = (user.crop || []).filter(function (cropName) {
      return listing.suitableFor.indexOf(cropName) !== -1;
    });

    if (cropMatches.length > 0) {
      score += 30;
      reasons.push("suitable for " + cropMatches[0].toLowerCase());
    }

    if (user.soilPh === "Below 5.5" && listing.scorecard.pH > 7.0) {
      score += 20;
      reasons.push("alkaline profile aligns with low-pH soil");
    } else if (user.soilPh === "5.5–6.5" && listing.scorecard.pH >= 6.5 && listing.scorecard.pH <= 8.0) {
      score += 20;
      reasons.push("pH compatibility in your target range");
    } else if (user.soilPh === "Above 8.5" && listing.scorecard.pH < 7.5) {
      score += 10;
      reasons.push("more neutral pH for high-alkaline soils");
    } else {
      score += 10;
    }

    if (listing.availableTonnes >= Number(user.volume)) {
      score += 15;
      reasons.push("available in sufficient volume");
    }

    if (listing.scorecard.carbonContent >= 70) {
      score += 10;
      reasons.push("high carbon content (" + listing.scorecard.carbonContent.toFixed(1) + "%)");
    } else if (listing.scorecard.carbonContent >= 60) {
      score += 5;
      reasons.push("solid carbon content (" + listing.scorecard.carbonContent.toFixed(1) + "%)");
    }

    if (listing.scorecard.labVerified) {
      score += 10;
      reasons.push("lab-verified");
    }

    if (
      user.organic === "Yes" &&
      (listing.certifications.includes("OMRI Listed") || listing.certifications.includes("California Organic"))
    ) {
      score += 15;
      reasons.push("organic-compatible certification");
    }

    if (isBroadRegionMatch(user.locationState, listing.region)) {
      score += 10;
      reasons.push("regional proximity advantage");
    } else {
      score += 5;
    }

    var normalized = Math.min(score, 100);

    return {
      listing: listing,
      score: normalized,
      explanation: buildExplanation(normalized, reasons)
    };
  }

  function renderResults() {
    var resultsContainer = document.getElementById("results-list");
    var resultsSection = document.getElementById("results");
    var form = document.getElementById("match-form");
    var progress = document.getElementById("progress-wrap");
    var actions = document.getElementById("form-actions");

    var listings = Array.isArray(window.LISTINGS) ? window.LISTINGS : [];

    if (listings.length === 0) {
      resultsContainer.innerHTML = '<p class="empty-results">No listings available yet.</p>';
    } else {
      var ranked = listings
        .map(function (listing) {
          return scoreListing(listing, state);
        })
        .sort(function (a, b) {
          return b.score - a.score;
        });

      resultsContainer.innerHTML = ranked
        .map(function (item, index) {
          return (
            '<article class="result-card">' +
            '<div class="result-top">' +
            '<span class="rank-pill">#' +
            (index + 1) +
            "</span>" +
            '<div class="result-title"><h3>' +
            item.listing.producerName +
            "</h3><p>" +
            item.listing.feedstock +
            "</p></div>" +
            '<div class="score-wrap"><p class="score-label">' +
            item.score +
            '/100</p><div class="score-bar"><div class="score-fill" data-score="' +
            item.score +
            '"></div></div></div>' +
            "</div>" +
            '<p class="result-explanation">' +
            item.explanation +
            "</p>" +
            "</article>"
          );
        })
        .join("");

      resultsContainer.querySelectorAll(".score-fill").forEach(function (el) {
        var value = Number(el.getAttribute("data-score")) || 0;
        el.style.width = value + "%";
      });
    }

    form.hidden = true;
    progress.hidden = true;
    actions.hidden = true;
    resultsSection.hidden = false;
  }

  function resetAll() {
    var form = document.getElementById("match-form");
    var progress = document.getElementById("progress-wrap");
    var actions = document.getElementById("form-actions");
    var resultsSection = document.getElementById("results");
    var geolocateButton = document.getElementById("geolocate-btn");
    var geoStatus = document.getElementById("geo-status");
    var geoResult = document.getElementById("geo-result");
    var manualLink = document.getElementById("manual-entry-link");
    var manualInput = document.getElementById("county-manual");
    var cropEl = document.getElementById("ms-crop");
    var goalEl = document.getElementById("ms-goal");

    state = {
      crop: [],
      soilPh: "",
      goal: [],
      volume: "",
      fromDate: "",
      toDate: "",
      organic: "",
      county: "",
      locationState: "",
      geoDetected: false,
      manualLocation: ""
    };
    detectedCounty = "";
    detectedState = "";

    currentStep = 1;
    form.reset();
    form.hidden = false;
    progress.hidden = false;
    actions.hidden = false;
    resultsSection.hidden = true;

    if (geolocateButton) {
      geolocateButton.hidden = false;
    }
    if (manualInput) {
      manualInput.hidden = true;
    }
    if (geoStatus) {
      geoStatus.textContent = "";
    }
    if (geoResult) {
      geoResult.textContent = "";
    }
    if (manualLink) {
      manualLink.hidden = false;
    }
    if (cropEl && typeof cropEl.setValue === "function") {
      cropEl.setValue(["All"]);
    }
    if (goalEl && typeof goalEl.setValue === "function") {
      goalEl.setValue(["All"]);
    }

    updateStepVisibility();
  }

  function setupLocationHandlers() {
    var geolocateButton = document.getElementById("geolocate-btn");
    var geoStatus = document.getElementById("geo-status");
    var geoResult = document.getElementById("geo-result");
    var manualLink = document.getElementById("manual-entry-link");
    var manualInput = document.getElementById("county-manual");

    if (geoResult) {
      geoResult.style.color = "var(--color-accent)";
      geoResult.style.fontSize = "var(--font-size-sm)";
    }

    if (manualLink) {
      manualLink.addEventListener("click", function (event) {
        event.preventDefault();
        state.geoDetected = false;
        detectedCounty = "";
        detectedState = "";
        if (geolocateButton) {
          geolocateButton.hidden = true;
        }
        if (manualInput) {
          manualInput.hidden = false;
          manualInput.focus();
        }
        collectStateFromForm();
        updateStepVisibility();
      });
    }

    if (!geolocateButton) {
      return;
    }

    geolocateButton.addEventListener("click", function () {
      if (!navigator.geolocation) {
        if (geoStatus) {
          geoStatus.textContent = "Could not detect location. Please enter manually.";
        }
        if (manualInput) {
          manualInput.hidden = false;
          manualInput.focus();
        }
        collectStateFromForm();
        updateStepVisibility();
        return;
      }

      if (geoStatus) {
        geoStatus.textContent = "Detecting location...";
      }

      navigator.geolocation.getCurrentPosition(
        function (position) {
          var lat = position.coords.latitude;
          var lng = position.coords.longitude;
          var url = "https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lng;

          fetch(url)
            .then(function (response) {
              return response.json();
            })
            .then(function (addressData) {
              var address = addressData && addressData.address ? addressData.address : {};
              detectedCounty = address.county || address.state_district || "";
              detectedState = address.state || "";

              state.geoDetected = !!detectedCounty;
              state.county = detectedCounty;
              state.locationState = detectedState;

              if (geoStatus) {
                geoStatus.textContent = "Location detected";
              }
              if (geoResult) {
                geoResult.textContent = detectedCounty && detectedState ? detectedCounty + ", " + detectedState : "";
              }

              collectStateFromForm();
              updateStepVisibility();
            })
            .catch(function () {
              state.geoDetected = false;
              detectedCounty = "";
              detectedState = "";

              if (geoStatus) {
                geoStatus.textContent = "Could not detect location. Please enter manually.";
              }
              if (manualInput) {
                manualInput.hidden = false;
                manualInput.focus();
              }

              collectStateFromForm();
              updateStepVisibility();
            });
        },
        function () {
          state.geoDetected = false;
          detectedCounty = "";
          detectedState = "";

          if (geoStatus) {
            geoStatus.textContent = "Could not detect location. Please enter manually.";
          }
          if (manualInput) {
            manualInput.hidden = false;
            manualInput.focus();
          }

          collectStateFromForm();
          updateStepVisibility();
        }
      );
    });
  }

  function init() {
    var backBtn = document.getElementById("btn-back");
    var nextBtn = document.getElementById("btn-next");
    var resetBtn = document.getElementById("btn-reset");
    var form = document.getElementById("match-form");
    var cropEl = document.getElementById("ms-crop");
    var goalEl = document.getElementById("ms-goal");

    if (cropEl) {
      makeMultiSelect(cropEl, [
        "Almond Orchards",
        "Walnut Orchards",
        "Pistachio Orchards",
        "Grapevine / Vineyards",
        "Corn",
        "Wheat",
        "Rice",
        "Row Crops",
        "Pasture",
        "Forestry"
      ], "Select crops");
    }

    if (goalEl) {
      makeMultiSelect(goalEl, [
        "Improve Water Retention",
        "Increase Nutrient Holding",
        "Raise Soil pH",
        "Reduce Fertilizer Use",
        "Carbon Sequestration"
      ], "Select goals");
    }

    form.addEventListener("input", function () {
      collectStateFromForm();
      updateStepVisibility();
    });

    form.addEventListener("change", function () {
      collectStateFromForm();
      updateStepVisibility();
    });

    backBtn.addEventListener("click", function () {
      if (currentStep > 1) {
        currentStep -= 1;
        updateStepVisibility();
      }
    });

    nextBtn.addEventListener("click", function () {
      collectStateFromForm();

      if (!getRequiredFilled(currentStep)) {
        return;
      }

      if (currentStep < totalSteps) {
        currentStep += 1;
        updateStepVisibility();
        return;
      }

      renderResults();
    });

    resetBtn.addEventListener("click", function () {
      resetAll();
    });

    setupLocationHandlers();
    collectStateFromForm();
    updateStepVisibility();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
