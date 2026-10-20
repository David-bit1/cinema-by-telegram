import "dotenv/config";
import { z } from "zod";

const environment = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url(),
  ADMIN_IDS: z.string().default(""),
  APP_NAME: z.string().min(1).default("CineNexo")
}).parse(process.env);

export const config = {
  ...environment,
  adminIds: new Set(environment.ADMIN_IDS.split(",").map(Number).filter(Number.isSafeInteger))
};
