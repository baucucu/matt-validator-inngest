import { inngest } from "../client";
import supabase from "../supabase";
import { CompanyValidateEvent } from "../types";
import { validateCompany, CompanyValidationData } from "../perplexity";

export default inngest.createFunction(
    { id: "validate-company", concurrency: 10 },
    { event: "company/validate" },
    async ({ event, step }: { event: CompanyValidateEvent, step: any }) => {
        const { run_record, ignore_cache } = event.data;
        //get run_record's run requirements
        const requirements = run_record.run.requirement.content;
        if (!requirements) {
            return {
                status: false,
                error: { message: 'No requirements found for run record' },
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                reasoning: 'No requirements found for run record',
                cached: false
            };
        }

        console.log('Requirements Record:', requirements);
        //check cache first by company_name
        const contentHash = require('crypto').createHash('md5').update(requirements).digest('hex');
        let cachedResult = null;
        if (!ignore_cache) {
            const { data, error: cacheError } = await supabase
                .from('company_validation_cache')
                .select('*')
                .eq('website', run_record.record.data.website)
                .eq('content_hash', contentHash)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            cachedResult = data;
        }
        if (cachedResult) {
            console.log('Using cached company validation result', cachedResult);
            const data = cachedResult.response_data;
            return {
                status: typeof data.status === 'boolean' ? data.status : !!data.valid,
                error: data.error !== undefined ? data.error : null,
                usage: data.usage !== undefined ? data.usage : {},
                reasoning: data.reasoning || '',
                cached: true
            };
        } else {
            //call company validation api step
            console.log('Calling company validation api');
            const company_validation: CompanyValidationData = await step.invoke("validate-company-api", {
                function: company_validation_api,
                data: {
                    website: run_record.record.data.website,
                    requirements: requirements,
                    ignore_cache
                }
            });
            console.log('Company validation result', company_validation);
            // Overwrite (upsert) the cache
            const { error: upsertError } = await supabase
                .from('company_validation_cache')
                .upsert({
                    website: run_record.record.data.website,
                    content: requirements,
                    content_hash: contentHash,
                    response_data: { ...company_validation },
                    created_at: new Date().toISOString()
                }, { onConflict: 'website,content_hash' });

            if (upsertError) {
                console.error("Error upserting company validation result:", upsertError);
            }

            return {
                status: company_validation.status === true,
                error: company_validation.error !== undefined ? company_validation.error : null,
                usage: company_validation.usage !== undefined ? company_validation.usage : {},
                reasoning: company_validation.reasoning || '',
                cached: company_validation.cached === true
            };
        }
    }
);

export const company_validation_api = inngest.createFunction(
    {
        id: "validate-company-api",
        concurrency: 10,
        retries: 3
    },
    { event: "company/validate-api" },
    async ({ event, step }: { event: CompanyValidateEvent, step: any }) => {
        const { website, requirements, ignore_cache } = event.data;

        if (!website || !requirements) {
            return {
                status: false,
                error: { message: 'Missing website or requirements' },
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                reasoning: 'Missing website or requirements',
                cached: false
            };
        }

        try {
            const validationResult: CompanyValidationData = await validateCompany(website, requirements);
            console.log('Validation Result:', validationResult);
            return validationResult;
        } catch (error) {
            // Log the error for debugging
            console.error('Company validation error:', error);
            return {
                status: false,
                error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                reasoning: `Error validating company: ${error instanceof Error ? error.message : 'Unknown error'}`,
                cached: false
            };
        }
    }
); 