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
