import { inngest } from "../client";
import { EmailValidateEvent } from "../types";
import supabase from "../supabase";
import leadmagic from "../leadmagic";


export const email_validation_api = inngest.createFunction(
    { id: "email-validation-api", concurrency: 10 },
    { event: "email/validate-api" },
    async ({ event, step }: { event: EmailValidateEvent, step: any }) => {
        const { run_record, ignore_cache } = event.data;

        if (!run_record.record.data.email) {
            throw new Error('No email provided for validation');
        }

        let cachedResult = null;
        if (!ignore_cache) {
            // Step 1: Check cache
            cachedResult = await step.run("check-cache", async () => {
                const { data, error } = await supabase
                    .from('email_validation_cache')
                    .select('*')
                    .eq('email', run_record.record.data.email)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (error) {
                    console.error("Error checking cache:", error);
                    return null;
                }

                if (data) {
                    console.log("Using cached email validation result", { email: data.response_data.email });
                    return data.response_data;
                }

                return null;
            });
        }

        if (cachedResult) {
            return { ...cachedResult, cached: true };
        }

        // Step 2: Make API call
        const response = await step.run("make-api-call", async () => {
            const result = await leadmagic('/email-validate', { email: run_record.record.data.email });
            console.log("Leadmagic email validation response", result);
            return { ...result, status: result.email_status, cached: false };
        });

        // Step 3: Upsert the result
        await step.run("cache-result", async () => {
            const { error: upsertError } = await supabase
                .from('email_validation_cache')
                .upsert({
                    email: run_record.record.data.email,
                    response_data: response,
                    status: response.email_status,
                    domain: response.domain,
                    cached: false,
                    created_at: new Date().toISOString()
                }, { onConflict: 'email' });

            if (upsertError) {
                console.error("Error upserting email validation result:", upsertError);
            }
        });

        return response;
    }
);


export const email_finding_api = inngest.createFunction(
    { id: "email-finding-api", concurrency: 10 },
    { event: "email/find-api" },
    async ({ event, step }: { event: EmailValidateEvent, step: any }) => {
        const { run_record, ignore_cache } = event.data;
        const { first_name, last_name, company_name, website: domain } = run_record.record.data;
        if (!first_name || !last_name) {
            return {
                status: 'invalid',
                email: null,
                reason: 'No first name or last name provided for email finding'
            }
        }
        if (!domain) {
            return {
                status: 'invalid',
                email: null,
                reason: 'No website provided for email finding'
            }
        }
        let cachedResult = null;
        if (!ignore_cache) {
            //check cache first by first_name, last_name, company_name, domain
            const { data, error: cacheError } = await supabase
                .from('email_finding_cache')
                .select('*')
                .eq('first_name', first_name)
                .eq('last_name', last_name)
                // .eq('company_name', company_name)
                .eq('domain', domain)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            cachedResult = data;
        }
        if (cachedResult) {
            console.log("Using cached email finding result", { first_name, last_name, company_name, domain });
            return { ...cachedResult.response_data, cached: true };
        }
        const response = await leadmagic('/email-finder', { first_name, last_name, company_name, domain });
        console.log("Leadmagic email finding response", response);
        //upsert the result
        console.log("Upserting into email_finding_cache:", {
            first_name,
            last_name,
            company_name,
            domain,
            status: response.email_status,
            response_data: response,
            cached: false
        });
        const { error: upsertError } = await supabase
            .from('email_finding_cache')
            .upsert({
                //similar to email validation cache
                first_name,
                last_name,
                company_name,
                domain,
                response_data: response,
                status: response.email_status,
                cached: false,
                created_at: new Date().toISOString()
            }, { onConflict: 'first_name,last_name,company_name,domain' });
        if (upsertError) {
            console.error("Error upserting email finding result:", upsertError);
        }
        return response;
    }
);

// === Main function: validate-email ===
export default inngest.createFunction(
    { id: "validate-email", concurrency: 10 },
    { event: "email/validate" },
    async ({ event, step, logger }: { event: EmailValidateEvent, step: any, logger: any }) => {
        const { run_record, ignore_cache } = event.data;
        console.log("Validating email", { run_record, ignore_cache });

        const regex_validation = await step.run("regex-validation", async () => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const result = emailRegex.test(run_record.record.data.email);
            return result;
        });
        console.log("Regex validation result", { regex_validation });
        await step.run("update-run-record", async () => {
            const { error } = await supabase
                .from("run_records")
                .update({ regex_valid: regex_validation })
                .eq("id", run_record.id);
        });
        console.log("Updated run record", { run_record });

        if (!regex_validation) {
            logger.info("Email validation failed: regex validation failed");
            // Run email finding in parallel with validation
            const email_finding = await step.invoke("email-finding-api", {
                function: email_finding_api,
                data: { run_record, ignore_cache }
            })
            await step.run("update-run-record", async () => {
                const { error } = await supabase
                    .from("run_records")
                    .update({ email_finding_data: email_finding })
                    .eq("id", run_record.id);
            });
            console.log("Email validation and finding data", { email_finding });
            return email_finding;
        }

        // If regex validation passed, just validate the email
        const email_validation = await step.invoke("email-validation-api", {
            function: email_validation_api,
            data: { run_record, ignore_cache }
        });
        console.log("Email validation data", { email_validation });
        await step.run("update-run-record", async () => {
            const { error } = await supabase
                .from("run_records")
                .update({ email_validation_data: email_validation })
                .eq("id", run_record.id);
        });

        if (email_validation.status !== 'valid' && email_validation.status !== 'valid_catch_all') {
            logger.info("Email validation failed: email validation failed");
            const email_finding = await step.invoke("email-finding-api", {
                function: email_finding_api,
                data: { run_record, ignore_cache }
            });
            await step.run("update-run-record", async () => {
                const { error } = await supabase
                    .from("run_records")
                    .update({ email_finding_data: email_finding })
                    .eq("id", run_record.id);
            });
            console.log("Email finding data", { email_finding });
            return email_finding;
        }

        return email_validation;
    }
);
