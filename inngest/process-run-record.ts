import { inngest } from "./client";
import { RunRecordQueued } from "./types";
import supabase from "./supabase";

const TIMEOUT = "1d";

const regex_validate_email = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

const handleLeadMagicFindEmail = async (run_record: object) => {

}

export default inngest.createFunction(
    {
        id: "process-run-record",
    },
    { event: "run/record/queued" },
    async ({ event, step }: { event: RunRecordQueued; step: any }) => {
        const run_record_id = event.data?.run_record_id;

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
                    records!inner(data)
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

        // Step 2: Regex validate email
        const regex_validate_email = await step.run("regex-validate-email", async () => {
            const email = run_record.records.data.email;
            return regex_validate_email(email);
        });

        if (regex_validate_email) {
            await step.sendEvent("validate-email", {
                data: {
                    run_record_id: run_record_id,
                    email: run_record.records.data.email
                }
            });
        } else {
            await step.sendEvent("find-email", {
                data: {
                    run_record: run_record,
                }
            });
        }

        const { data: email_data } = await step.waitForEvent("validate-email", {
            //mock data

        });

        const { data: find_email_data } = await step.waitForEvent("find-email", {
            //
        });

        const { data: update_record_data } = await step.run("validate-company", async () => {
            //
        });
    }
);

