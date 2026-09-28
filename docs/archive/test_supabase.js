import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Key defined:", !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  try {
    const { data: pData, error: pErr } = await supabase.from('products').select('id, name').limit(5);
    console.log("Products query:", { count: pData?.length, error: pErr });

    const { data: cData, error: cErr } = await supabase.from('cash_closures').select('id').limit(5);
    console.log("Cash closures query:", { count: cData?.length, error: cErr });

    const { data: reData, error: reErr } = await supabase.from('recurring_expenses').select('id').limit(5);
    console.log("Recurring expenses query:", { count: reData?.length, error: reErr });

    const { data: sData, error: sErr } = await supabase.from('sales').select('id').limit(5);
    console.log("Sales query:", { count: sData?.length, error: sErr });

  } catch (error) {
    console.error("Test error:", error);
  }
}

runTests();
