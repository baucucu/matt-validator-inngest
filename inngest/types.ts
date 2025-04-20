import { EventSchemas } from "inngest";

export type RunQueued = {
  name: "run/queued";
  data: {
    run_id: string;
  };
}

export type RunRecordQueued = {
  name: "run/record/queued";
  data: {
    run_record_id: string;
  };
}

export const schemas = new EventSchemas().fromUnion<RunQueued | RunRecordQueued>();
