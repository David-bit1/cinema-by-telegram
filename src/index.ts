import { createBot } from "./bot.js";
import { db } from "./db.js";

const bot = createBot();

await bot.start({ onStart: (info) => console.log(`Bot @${info.username} iniciado`) });

const shutdown = async () => {
  bot.stop();
  await db.$disconnect();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
