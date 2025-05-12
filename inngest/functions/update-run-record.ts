import { inngest } from "../client";
import supabase from "../supabase";

export const updateRunRecord = async (run_record_id: string, field_name: string, data: any) => {
    try {
        const { error } = await supabase
            .from("run_records")
            .update({
                [field_name]: data
            })
            .eq("id", run_record_id);

        if (error) {
            console.error(`Error updating run record ${run_record_id}:`, error);
            throw error;
        }

        return { success: true };
    } catch (error) {
        console.error(`Failed to update run record ${run_record_id}:`, error);
        throw error;
    }
};

export default inngest.createFunction(
    { id: "update-run-record", concurrency: 10 },
    { event: "run/record/update" },
    async ({ event, step }: { event: any, step: any }) => {
        const { run_record_id, field_name, data } = event.data;

        if (!run_record_id || !field_name || !data) {
            throw new Error("Missing required parameters: run_record_id, field_name, or data");
        }

        const result = await updateRunRecord(run_record_id, field_name, data);
        console.log("Updated run record", result);
        return result;
    }
); 