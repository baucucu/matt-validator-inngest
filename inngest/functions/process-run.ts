import { inngest } from "../client";
import { RunQueued } from "../types";
import supabase from "../supabase";


export default inngest.createFunction(
    { id: "process-run", concurrency: 10 },
    { event: "run/queued" },
    async ({ event, step }: { event: RunQueued; step: any }) => {

        const run_id = event.data?.run_id;
        const ignore_cache = event.data?.ignore_cache;
        if (!run_id) {
            return {
                message: "No run id"
            };
        }
        await step.run("job-started", async () => {
            //wait 10 seconds
            // await new Promise(resolve => setTimeout(resolve, 10000));
            return {
                message: `Run id ${event.data?.run_id} started`
            };
        });

        await step.run("trigger-run-records", async () => {
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
                    .range(offset, offset + batchSize - 1);
                if (run_records_error) {
                    throw new Error(run_records_error.message);
                }
                if (!run_records || run_records.length === 0) {
                    break;
                }

                const results = await Promise.all(run_records.map(async (record: { id: string }) => {
                    // Send event for this run record
                    const eventResult = await inngest.send({
                        name: "run/record/queued",
                        data: { run_record_id: record.id, ignore_cache }
                    });

                    // Update run record with processing status and event ID
                    const { error: updateError } = await supabase
                        .from("run_records")
                        .update({
                            status: "processing",
                            inngest_event_id: eventResult.ids[0]
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

            return {
                message: `Run records processed with event IDs: ${JSON.stringify(allEventIds)}`,
                totalProcessed
            };
        });

        await step.run("job-running", async () => {
            const { data, error } = await supabase
                .from("runs")
                .update({
                    status: "processing",
                    inngest_run_id: event.data?.run_id
                })
                .eq("id", run_id)
                .select();

            if (error) {
                throw new Error(error.message);
            }

            return {
                message: `Run id ${event.data?.run_id} is running`
            };
        });


    }
);