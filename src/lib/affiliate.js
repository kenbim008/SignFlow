export function tierFromCount(referralCount) {
  if (referralCount >= 50) return { name: 'Platinum', commission: 30 };
  if (referralCount >= 15) return { name: 'Gold', commission: 25 };
  if (referralCount >= 5) return { name: 'Silver', commission: 22 };
  return { name: 'Bronze', commission: 20 };
}

export function generateAffiliateCode() {
  const n = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `SF-${n}`;
}
