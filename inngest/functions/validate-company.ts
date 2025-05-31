import { inngest } from "../client";
import supabase from "../supabase";
import { CompanyValidateEvent } from "../types";
import { validateCompany, CompanyValidationData } from "../perplexity";

export default inngest.createFunction(
    { id: "validate-company", concurrency: 10 },
    { event: "company/validate" },
    async ({ event, step }: { event: CompanyValidateEvent, step: any }) => {
        const { run_record } = event.data;
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
        const { data: cachedResult, error: cacheError } = await supabase
            .from('company_validation_cache')
            .select('*')
            .eq('website', run_record.record.data.website)
            .eq('content_hash', contentHash)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (cachedResult) {
            console.log('Using cached company validation result', cachedResult);
            return { ...cachedResult.response_data, cached: true };
        } else {
            //call company validation api step
            console.log('Calling company validation api');
            const company_validation: CompanyValidationData = await step.invoke("validate-company-api", {
                function: company_validation_api,
                data: {
                    website: run_record.record.data.website,
                    requirements: requirements
                }
            });
            console.log('Company validation result', company_validation);
            // Cache the result
            const { error: insertError } = await supabase
                .from('company_validation_cache')
                .insert({
                    website: run_record.record.data.website,
                    content: requirements,
                    content_hash: contentHash,
                    response_data: { ...company_validation },
                    created_at: new Date().toISOString()
                });

            if (insertError) {
                console.error("Error caching company validation result:", insertError);
            }

            return company_validation;
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
        const { website, requirements } = event.data;

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