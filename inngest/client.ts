import { Inngest } from "inngest";
import { schemas } from "./types";

export const inngest = new Inngest({ id: "validator-helper", baseUrl: "https://inngest.appy.agency", schemas });
