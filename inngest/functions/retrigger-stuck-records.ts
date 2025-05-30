import { inngest } from "../client";
import supabase from "../supabase";

export default inngest.createFunction(
    { id: "retrigger-stuck-records", concurrency: 10 },
    { event: "run/retrigger-stuck-records" },
    async ({ event, step }: { event: any; step: any }) => {
        const { run_id } = event.data;
        if (!run_id) {
            throw new Error("No run_id provided");
        }

        await step.run("find-and-retrigger-stuck-records", async () => {
            const batchSize = 1000;
            let offset = 0;
            let hasMore = true;
            let totalProcessed = 0;
            let allEventIds: string[] = [];

            while (hasMore) {
                // Find stuck run records
                const { data: run_records, error: run_records_error } = await supabase
                    .from("run_records")
                    .select("*")
                    .eq("run_id", run_id)
                    .neq("status", "completed")
                    .range(offset, offset + batchSize - 1);

                if (run_records_error) {
                    throw new Error(run_records_error.message);
                }

                if (!run_records || run_records.length === 0) {
                    break;
                }

                const results = await Promise.all(run_records.map(async (record: { id: string }) => {
                    // First, cancel the current processing
                    await inngest.send({
                        name: "run/record/cancelled",
                        data: { run_record_id: record.id }
                    });

                    // Reset the record status to pending
                    const { error: resetError } = await supabase
                        .from("run_records")
                        .update({
                            status: "pending",
                            email_validation_data: null,
                            company_validation_data: null,
                            inngest_event_id: null
                        })
                        .eq("id", record.id);

                    if (resetError) {
                        throw new Error(`Failed to reset run record ${record.id}: ${resetError.message}`);
                    }

                    // Retrigger the record
                    const eventResult = await inngest.send({
                        name: "run/record/queued",
                        data: { run_record_id: record.id }
                    });

                    // Update the record with new event ID and status
                    const { error: updateError } = await supabase
                        .from("run_records")
                        .update({
                            status: "processing",
                            inngest_event_id: eventResult.ids[0]
                        })
                        .eq("id", record.id);

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
                message: `Retriggered ${totalProcessed} stuck run records with event IDs: ${JSON.stringify(allEventIds)}`,
                totalProcessed
            };
        });
    }
); 