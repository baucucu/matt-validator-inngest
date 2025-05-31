import { inngest } from "../client";
import { RunRecordQueued } from "../types";
import supabase from "../supabase";
import validateEmail from "./validate-email";
import validateCompany from "./validate-company";
import { CompanyValidationData } from "../perplexity";
import { checkRunRecordsCompletion } from "../utils/check-run-records";
const TIMEOUT = "1d";

interface EmailValidationResponse {
    status: string;
    reason?: string;
}

interface CompanyValidationResponse {
    valid: boolean;
    reasoning?: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    cached: boolean;
}

export default inngest.createFunction(
    {
        id: "process-run-record",
        concurrency: 10,
        timeouts: {
            start: TIMEOUT,  // How long a run can stay queued before starting
            finish: TIMEOUT  // How long a run can execute after starting
        },
        cancelOn: [{
            event: "run/record/cancelled",
            if: "async.data.run_record_id == event.data.run_record_id"
        }]
    },
    { event: "run/record/queued" },
    async ({ event, step }: { event: RunRecordQueued; step: any }) => {
        const run_record_id = event.data?.run_record_id;
        let email_validation: EmailValidationResponse | undefined;
        let company_validation: CompanyValidationData | undefined;
        if (!run_record_id) {
            throw new Error("Missing run_record_id");
        }

        console.log('run_record_id:', run_record_id);

        // Step 1: Get run record data
        const run_record = await step.run("fetch-run-record", async () => {
            const { data, error } = await supabase
                .from("run_records")
                .select(`
                    *,
                    record:records!inner(data),
                    run:run_id (
                        id,
                        skip_email_validation,
                        requirement:requirement_id (
                            content
                        )
                    )
                `)
                .eq("id", run_record_id)
                .single();

            if (error) {
                throw new Error(`Failed to fetch run record: ${error.message}`);
            }

            if (!data) {
                throw new Error(`Run record not found: ${run_record_id}`);
            }

            console.log('Supabase response:', JSON.stringify(data, null, 2));

            return data;
        });

        // Check if we should skip email validation based on run settings
        const skipEmailValidation = run_record.run?.skip_email_validation === true;

        if (!skipEmailValidation) {
            // Step 2: Validate email
            email_validation = await step.invoke("validate-email", {
                function: validateEmail,
                data: {
                    run_record
                }
            });

            console.log("Email validation data", { email_validation });

            if (!email_validation) {
                throw new Error("Email validation failed to return a response");
            }

            if (email_validation.status !== "valid" && email_validation.status !== "valid_catch_all") {
                // If email validation failed, mark as failed and return
                await step.run("update-run-record-status", async () => {
                    const { error } = await supabase
                        .from("run_records")
                        .update({
                            status: "failed",
                            email_validation_data: email_validation,
                            failure_reason: `Email validation failed: ${(email_validation as EmailValidationResponse).reason || 'Unknown reason'}`
                        })
                        .eq("id", run_record_id);
                });
                await step.run("check-run-records-completion", async () => {
                    await checkRunRecordsCompletion(step, run_record.run_id);
                });
                return { status: "failed", reason: `Email validation failed: ${(email_validation as EmailValidationResponse).reason || 'Unknown reason'}` };
            }
        }

        // Proceed with company validation
        company_validation = await step.invoke("validate-company", {
            function: validateCompany,
            data: {
                run_record
            }
        });

        if (!company_validation) {
            throw new Error("Company validation failed to return a response");
        }

        // Log before update
        console.log("About to update run_record:", { run_record_id, company_validation });

        // Check if company validation was successful
        const isCompanyValid = company_validation.status === true;
        const processingStatus = "completed";

        await step.run("update-run-record-company-validation", async () => {
            const { error, data } = await supabase
                .from("run_records")
                .update({
                    company_validation_data: company_validation,
                    status: processingStatus,
                    // If we skipped email validation, set a placeholder for email_validation_data
                    ...(skipEmailValidation && { email_validation_data: { status: "skipped" } })
                })
                .eq("id", run_record_id)
                .select(); // Get updated rows

            // Log the result
            console.log("Supabase update result:", { error, data, run_record_id, company_validation });

            if (error) {
                throw new Error("Supabase update error: " + error.message);
            }
            if (!data || data.length === 0) {
                throw new Error("Supabase update did not match any rows for run_record_id: " + run_record_id);
            }
        });

        console.log("Company validation data", { company_validation });
        await step.run("check-run-records-completion", async () => {
            await checkRunRecordsCompletion(step, run_record.run_id);
        });
        return {
            status: processingStatus,
            company_validation_data: company_validation
        };
    }
);

