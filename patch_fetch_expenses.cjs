const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf-8');

code = code.replace(
  "  const fetchRecurringExpensesAll = async () => {\n    // just to list them in the expenses tab\n  }",
  `  const fetchRecurringExpensesAll = async () => {
    const { data } = await supabase.from('recurring_expenses').select('*');
    if (data) setAllExpensesList(data);
  }`
);

fs.writeFileSync('src/components/AdminDashboard.tsx', code);
