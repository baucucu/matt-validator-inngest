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
    run_record_id: any;
  };
}

export type RunCancelled = {
  name: "run/cancelled";
  data: {
    run_id: string;
  };
}

export type RunRecordCancelled = {
  name: "run/record/cancelled";
  data: {
    run_record_id: string;
  };
}

export type EmailValidateEvent = {
  name: "email/validate";
  data: {
    run_record?: any;
    email?: string;
  };
};

export type CompanyValidateEvent = {
  name: "company/validate";
  data: {
    run_record?: any;
    website?: string;
    requirements?: string;
  };
};

export const schemas = new EventSchemas().fromUnion<
  RunQueued |
  RunRecordQueued |
  RunCancelled |
  RunRecordCancelled |
  EmailValidateEvent |
  CompanyValidateEvent
>();
