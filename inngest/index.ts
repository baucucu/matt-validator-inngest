import process_run from "./functions/process-run";
import process_run_record from "./functions/process-run-record";
import validate_email, { email_validation_api, email_finding_api } from "./functions/validate-email";
import validate_company, { company_validation_api } from "./functions/validate-company";
import update_run_record from "./functions/update-run-record";
import cancel_run from "./functions/cancel-run";
import retrigger_stuck_records from "./functions/retrigger-stuck-records";

export const functions = [
    process_run,
    process_run_record,
    validate_email,
    validate_company,
    email_validation_api,
    email_finding_api,
    company_validation_api,
    update_run_record,
    cancel_run,
    retrigger_stuck_records
];

export { inngest } from "./client";
