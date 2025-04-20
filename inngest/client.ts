import { Inngest } from "inngest";
import { schemas } from "./types";
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.INNGEST_BASE_URL) {
    throw new Error('Missing INNGEST_BASE_URL environment variable');
}

export const inngest = new Inngest({
    id: "validator-helper",
    baseUrl: process.env.INNGEST_BASE_URL,
    schemas
});
