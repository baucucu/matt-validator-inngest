import { inngest } from "../client";
import { EmailValidateEvent } from "../types";
import supabase from "../supabase";
import leadmagic from "../leadmagic";


export const email_validation_api = inngest.createFunction(
    { id: "email-validation-api" },
    { event: "email/validate-api" },
    async ({ event, step }: { event: EmailValidateEvent, step: any }) => {
        const { run_record } = event.data;

        if (!run_record.record.data.email) {
            throw new Error('No email provided for validation');
        }

        // Step 1: Check cache
        const cachedResult = await step.run("check-cache", async () => {
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

        if (cachedResult) {
            return { ...cachedResult, cached: true };
        }

        // Step 2: Make API call
        const response = await step.run("make-api-call", async () => {
            const result = await leadmagic('/email-validate', { email: run_record.record.data.email });
            console.log("Leadmagic email validation response", result);
            return { ...result, cached: false };
        });

        // Step 3: Cache the result
        await step.run("cache-result", async () => {
            const { error: insertError } = await supabase
                .from('email_validation_cache')
                .insert({
                    email: run_record.record.data.email,
                    response_data: response,
                    email_status: response.email_status,
                    domain: response.domain,
                    mx_provider: response.mx_provider,
                    mx_record: response.mx_record,
                    mx_security_gateway: response.mx_security_gateway,
                    is_domain_catch_all: response.is_domain_catch_all,
                    credits_consumed: response.credits_consumed
                });

            if (insertError) {
                console.error("Error caching email validation result:", insertError);
            }
        });

        return response;
    }
);


export const email_finding_api = inngest.createFunction(
    { id: "email-finding-api" },
    { event: "email/find-api" },
    async ({ event, step }: { event: EmailValidateEvent, step: any }) => {
        const { first_name, last_name, company_name, website } = event.data.run_record.record.data;
        if (!first_name || !last_name) {
            return {
                email_status: 'invalid',
                email: null,
                reason: 'No first name or last name provided for email finding'
            }
        }
        if (!website) {
            return {
                email_status: 'invalid',
                email: null,
                reason: 'No website provided for email finding'
            }
        }
        //check cache first by first_name, last_name, company_name, domain
        const { data: cachedResult, error: cacheError } = await supabase
            .from('email_finding_cache')
            .select('*')
            .eq('first_name', first_name)
            .eq('last_name', last_name)
            // .eq('company_name', company_name)
            .eq('domain', website)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (cachedResult) {
            console.log("Using cached email finding result", { first_name, last_name, company_name, domain: website });
            return cachedResult.response_data;
        }
        const response = await leadmagic('/email-finder', { first_name, last_name, company_name, domain: website });
        console.log("Leadmagic email finding response", response);
        //cache the result
        const { error: insertError } = await supabase
            .from('email_finding_cache')
            .insert({
                //similar to email validation cache
                first_name,
                last_name,
                company_name,
                domain: website,
                email_status: response.email_status,
                mx_provider: response.mx_provider,
                mx_record: response.mx_record,
                mx_security_gateway: response.mx_security_gateway,
                is_domain_catch_all: response.is_domain_catch_all,
                credits_consumed: response.credits_consumed,
                response_data: response,
            });
        if (insertError) {
            console.error("Error caching email finding result:", insertError);
        }
        return response;
    }
);

// === Main function: validate-email ===
export default inngest.createFunction(
    { id: "validate-email" },
    { event: "email/validate" },
    async ({ event, step, logger }: { event: EmailValidateEvent, step: any, logger: any }) => {
        const { run_record } = event.data;
        console.log("Validating email", { run_record });

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
                data: { run_record }
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
            data: { run_record }
        });
        console.log("Email validation data", { email_validation });
        await step.run("update-run-record", async () => {
            const { error } = await supabase
                .from("run_records")
                .update({ email_validation_data: email_validation })
                .eq("id", run_record.id);
        });

        if (email_validation.email_status !== 'valid') {
            logger.info("Email validation failed: email validation failed");
            const email_finding = await step.invoke("email-finding-api", {
                function: email_finding_api,
                data: { run_record }
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
