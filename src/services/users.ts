import { db } from "../db.js";

export async function registerTelegramUser(from: { id: number; username?: string; first_name?: string }) {
  return db.user.upsert({
    where: { telegramId: BigInt(from.id) },
    create: {
      telegramId: BigInt(from.id),
      username: from.username,
      firstName: from.first_name,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    update: { username: from.username, firstName: from.first_name }
  });
}

export async function audit(userId: string | undefined, action: string, detail?: string) {
  await db.auditLog.create({ data: { userId, action, detail } });
}
