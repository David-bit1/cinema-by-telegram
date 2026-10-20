import { PlanCode } from "@prisma/client";
import { db } from "../db.js";

const planLevel: Record<PlanCode, number> = {
  BASIC: 1,
  PLUS: 2,
  PREMIUM: 3,
  ULTRA: 4
};

export async function hasContentAccess(telegramId: number, requiredPlan: PlanCode | null) {
  if (!requiredPlan) return true;
  const subscriptions = await db.subscription.findMany({
    where: {
      user: { telegramId: BigInt(telegramId) },
      status: "ACTIVE",
      endsAt: { gt: new Date() }
    },
    include: { plan: true }
  });
  return subscriptions.some((subscription) => planLevel[subscription.plan.code] >= planLevel[requiredPlan]);
}

export async function activeSubscription(telegramId: number) {
  return db.subscription.findFirst({
    where: {
      user: { telegramId: BigInt(telegramId) },
      status: "ACTIVE",
      endsAt: { gt: new Date() }
    },
    include: { plan: true },
    orderBy: { endsAt: "desc" }
  });
}
