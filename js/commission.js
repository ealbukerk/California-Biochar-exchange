function calculateCommission(transactionValueUSD) {
  var value = Number(transactionValueUSD) || 0;
  var rate = 0.048;
  var bracketLabel = "Under $10,000";

  if (value >= 10000 && value <= 50000) {
    rate = 0.043;
    bracketLabel = "$10,000–$50,000";
  } else if (value > 50000 && value <= 150000) {
    rate = 0.039;
    bracketLabel = "$50,000–$150,000";
  } else if (value > 150000 && value <= 400000) {
    rate = 0.034;
    bracketLabel = "$150,000–$400,000";
  } else if (value > 400000) {
    rate = 0.03;
    bracketLabel = "Over $400,000";
  }

  return {
    rate: rate,
    rateDisplay: (rate * 100).toFixed(1) + "%",
    commissionAmount: Math.round(value * rate * 100) / 100,
    bracketLabel: bracketLabel
  };
}

window.calculateCommission = calculateCommission;

function calculateBiomassCommission(transactionValueUSD) {
  var value = Number(transactionValueUSD) || 0;
  var rate;
  var bracketLabel;

  if (value <= 5000) {
    rate = 0.015;
    bracketLabel = 'Under $5,000';
  } else if (value <= 20000) {
    var t = (value - 5000) / (20000 - 5000);
    rate = 0.015 - (t * (0.015 - 0.012));
    bracketLabel = '$5,000–$20,000';
  } else if (value <= 50000) {
    var t2 = (value - 20000) / (50000 - 20000);
    rate = 0.012 - (t2 * (0.012 - 0.010));
    bracketLabel = '$20,000–$50,000';
  } else if (value <= 100000) {
    var t3 = (value - 50000) / (100000 - 50000);
    rate = 0.010 - (t3 * (0.010 - 0.006));
    bracketLabel = '$50,000–$100,000';
  } else {
    rate = 0.006;
    bracketLabel = 'Over $100,000';
  }

  rate = Math.round(rate * 10000) / 10000;

  return {
    rate: rate,
    rateDisplay: (rate * 100).toFixed(2) + '%',
    commissionAmount: Math.round(value * rate * 100) / 100,
    bracketLabel: bracketLabel,
    isBiomass: true
  };
}

window.calculateBiomassCommission = calculateBiomassCommission;
