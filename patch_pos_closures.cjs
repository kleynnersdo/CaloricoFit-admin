const fs = require('fs');
let code = fs.readFileSync('src/components/POS.tsx', 'utf-8');

const helpers = `
  const getSystemUSD = (sales: any[]) => {
    return sales.reduce((acc, s) => {
      if (s.payment_method?.startsWith('MIXTO|')) {
        try {
          const data = JSON.parse(s.payment_method.split('|')[1]);
          return acc + Number(data.USD || 0);
        } catch(e) { return acc; }
      }
      if (isUsdCashSale(s)) return acc + Number(s.total_usd);
      return acc;
    }, 0);
  };

  const getSystemUSDT = (sales: any[]) => {
    return sales.reduce((acc, s) => {
      if (s.payment_method?.startsWith('MIXTO|')) {
        try {
          const data = JSON.parse(s.payment_method.split('|')[1]);
          return acc + Number(data.USDT || 0);
        } catch(e) { return acc; }
      }
      if (isUsdtSale(s)) return acc + Number(s.total_usd);
      return acc;
    }, 0);
  };

  const getSystemVES = (sales: any[]) => {
    return sales.reduce((acc, s) => {
      if (s.payment_method?.startsWith('MIXTO|')) {
        try {
          const data = JSON.parse(s.payment_method.split('|')[1]);
          return acc + Number(data.VES || 0);
        } catch(e) { return acc; }
      }
      if (isVesSale(s)) return acc + (Number(s.total_usd) * getEffectiveVesRate(s));
      return acc;
    }, 0);
  };
`;

code = code.replace(
  "const getEffectiveVesRate = (s: any) => {",
  helpers + "\n  const getEffectiveVesRate = (s: any) => {"
);

code = code.replace(
  "todaySales.filter(isUsdCashSale).reduce((acc, curr) => acc + Number(curr.total_usd), 0)",
  "getSystemUSD(todaySales)"
);
code = code.replace(
  "todaySales.filter(isUsdtSale).reduce((acc, curr) => acc + Number(curr.total_usd), 0)",
  "getSystemUSDT(todaySales)"
);
code = code.replace(
  "todaySales.filter(isVesSale).reduce((acc, curr) => acc + (Number(curr.total_usd) * getEffectiveVesRate(curr)), 0)",
  "getSystemVES(todaySales)"
);

code = code.replace(
  "todaySales.filter(isUsdCashSale).reduce((acc, curr) => acc + Number(curr.total_usd), 0)",
  "getSystemUSD(todaySales)"
);
code = code.replace(
  "todaySales.filter(isUsdtSale).reduce((acc, curr) => acc + Number(curr.total_usd), 0)",
  "getSystemUSDT(todaySales)"
);
code = code.replace(
  "todaySales.filter(isVesSale).reduce((acc, curr) => acc + (Number(curr.total_usd) * getEffectiveVesRate(curr)), 0)",
  "getSystemVES(todaySales)"
);

fs.writeFileSync('src/components/POS.tsx', code);
