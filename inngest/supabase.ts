import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(
    "https://lmrkhpopeovcsmyieeix.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtcmtocG9wZW92Y3NteWllZWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2MDY2OTIsImV4cCI6MjA1NzE4MjY5Mn0.wQQxTLIyR9wBuYo0tsxjliDWgeJjUSc1y0gqZIFm8VU"
);

export default supabase;