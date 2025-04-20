-- Create company_validation_cache table
CREATE TABLE IF NOT EXISTS company_validation_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    website TEXT NOT NULL,
    content TEXT NOT NULL,
    response_data JSONB NOT NULL,
    company_status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_company_validation_cache_website_content 
ON company_validation_cache(website, content);

-- Add RLS policies
ALTER TABLE company_validation_cache ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users" 
ON company_validation_cache FOR SELECT 
TO authenticated 
USING (true);

-- Allow insert access to authenticated users
CREATE POLICY "Allow insert access to authenticated users" 
ON company_validation_cache FOR INSERT 
TO authenticated 
WITH CHECK (true); 