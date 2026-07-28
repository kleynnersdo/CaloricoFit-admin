import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function update() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: 'ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS surcharge_percentage NUMERIC(5,2) DEFAULT 0;'
  });
  console.log(error ? error : "Success");
}
update();
