import { equal } from "assert";
import { inngest } from "../client";
import supabase from "../supabase";
import { CompanyValidateEvent } from "../types";
import { validateCompany } from "../perplexity";

export default inngest.createFunction(
    { id: "validate-company" },
    { event: "company/validate" },
    async ({ event, step }: { event: CompanyValidateEvent, step: any }) => {
        const { run_record } = event.data;
        //get run_record's run requirements
        const requirements = run_record.run.requirement.content;
        if (!requirements) {
            return {
                company_status: 'invalid',
                company: null,
                reason: 'No requirements found for run record'
            }
        }

        console.log('Requirements Record:', requirements);
        //check cache first by company_name
        const { data: cachedResult, error: cacheError } = await supabase
            .from('company_validation_cache')
            .select('*')
            .eq('website', run_record.record.data.website)
            .eq('content', requirements)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (cachedResult) {
            console.log('Using cached company validation result', cachedResult);
            return { ...cachedResult.response_data, cached: true };
        } else {
            //call company validation api step
            console.log('Calling company validation api');
            const company_validation = await step.invoke("validate-company-api", {
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
    { id: "validate-company-api" },
    { event: "company/validate-api" },
    async ({ event, step }: { event: CompanyValidateEvent, step: any }) => {
        const { website, requirements } = event.data;

        if (!website || !requirements) {
            return {
                valid: false,
                reasoning: "Missing website or requirements"
            };
        }

        const validationResult = await validateCompany(website, requirements);
        console.log('Validation Result:', validationResult);
        return validationResult;
    }
); 