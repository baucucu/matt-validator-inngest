import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL environment variable');
}

if (!process.env.SUPABASE_ANON) {
    throw new Error('Missing SUPABASE_ANON environment variable');
}

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON
);

export default supabase;