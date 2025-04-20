import { inngest } from "../client";
import supabase from "../supabase";

export const checkRunRecordsCompletion = async (step: any, run_id: string) => {
    const { data, error } = await supabase
        .from("run_records")
        .select("status")
        .eq("run_id", run_id);

    if (error) {
        throw new Error(`Failed to fetch run records: ${error.message}`);
    }

    console.log("Checking run records completion", data);
    if (data.every((record) => record.status === "completed")) {
        await supabase.from("runs").update({ status: "completed" }).eq("id", run_id);
        console.log("Run records completed", data);
    } else {
        console.log("Run records not completed", data);
    }
}; 