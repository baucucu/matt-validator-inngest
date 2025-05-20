import { inngest } from "../client";
import supabase from "../supabase";
import { RunCancelled } from "../types";

export default inngest.createFunction(
    { id: "cancel-run", concurrency: 10 },
    { event: "run/cancelled" },
    async ({ event, step }: { event: RunCancelled; step: any }) => {
        const run_id = event.data?.run_id;
        if (!run_id) {
            return {
                message: "No run id provided"
            };
        }

        await step.run("cancel-run-records", async () => {
            const batchSize = 1000;
            let offset = 0;
            let hasMore = true;
            let totalProcessed = 0;
            let allEventIds: string[] = [];

            while (hasMore) {
                const { data: run_records, error: run_records_error } = await supabase
                    .from("run_records")
                    .select("*")
                    .eq("run_id", run_id)
                    .eq("status", "pending")
                    .range(offset, offset + batchSize - 1);

                if (run_records_error) {
                    throw new Error(run_records_error.message);
                }

                if (!run_records || run_records.length === 0) {
                    break;
                }

                const results = await Promise.all(run_records.map(async (record: { id: string }) => {
                    // Send cancellation event for this run record
                    const eventResult = await inngest.send({
                        name: "run/record/cancelled",
                        data: { run_record_id: record.id }
                    });

                    // Update run record status to cancelled
                    const { error: updateError } = await supabase
                        .from("run_records")
                        .update({
                            status: "cancelled"
                        })
                        .eq("id", record.id)
                        .select();

                    if (updateError) {
                        throw new Error(`Failed to update run record ${record.id}: ${updateError.message}`);
                    }

                    return eventResult.ids[0];
                }));

                allEventIds.push(...results);
                totalProcessed += run_records.length;
                offset += batchSize;
                hasMore = run_records.length === batchSize;
            }

            // Update the run status to cancelled
            const { error: runUpdateError } = await supabase
                .from("runs")
                .update({ status: "cancelled" })
                .eq("id", run_id)
                .select();

            if (runUpdateError) {
                throw new Error(`Failed to update run status: ${runUpdateError.message}`);
            }

            return {
                message: `Cancelled ${totalProcessed} run records with event IDs: ${JSON.stringify(allEventIds)}`,
                totalProcessed
            };
        });
    }
); 