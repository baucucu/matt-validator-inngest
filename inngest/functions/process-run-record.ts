import { inngest } from "../client";
import { RunRecordQueued } from "../types";
import supabase from "../supabase";
import validateEmail from "./validate-email";
import validateCompany from "./validate-company";
import { checkRunRecordsCompletion } from "../utils/check-run-records";
const TIMEOUT = "1d";

export default inngest.createFunction(
    {
        id: "process-run-record",
        concurrency: 10,
        timeouts: {
            start: TIMEOUT,
            end: TIMEOUT
        },
        cancelOn: [{
            event: "run/record/cancelled",
            if: "async.data.run_record_id == event.data.run_record_id"
        }]
    },
    { event: "run/record/queued" },
    async ({ event, step }: { event: RunRecordQueued; step: any }) => {
        const run_record_id = event.data?.run_record_id;
        let email_validation, company_validation: any;
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

            if (email_validation.status !== "valid" && email_validation.status !== "valid_catch_all") {
                // If email validation failed, mark as completed and return
                await step.run("update-run-record-status", async () => {
                    const { error } = await supabase
                        .from("run_records")
                        .update({ status: "completed" })
                        .eq("id", run_record_id);
                });
                await step.run("check-run-records-completion", async () => {
                    await checkRunRecordsCompletion(step, run_record.run_id);
                });
                return { status: "completed" };
            }
        }

        // Proceed with company validation
        company_validation = await step.invoke("validate-company", {
            function: validateCompany,
            data: {
                run_record
            }
        });

        await step.run("update-run-record-company-validation", async () => {
            const { error } = await supabase
                .from("run_records")
                .update({
                    company_validation_data: company_validation,
                    status: "completed",
                    // If we skipped email validation, set a placeholder for email_validation_data
                    ...(skipEmailValidation && { email_validation_data: { status: "skipped" } })
                })
                .eq("id", run_record_id);
        });

        console.log("Company validation data", { company_validation });
        await step.run("check-run-records-completion", async () => {
            await checkRunRecordsCompletion(step, run_record.run_id);
        });
        return { status: "completed" };
    }
);

