import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

export const RESEND_FROM = process.env.RESEND_FROM ?? "TodoMerchandising <noreply@merchandising.startidea.es>";
export const RESEND_TO_INTERNAL = process.env.RESEND_TO_INTERNAL ?? "mariopablobarron@gmail.com";
