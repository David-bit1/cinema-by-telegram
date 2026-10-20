import { PlanCode } from "@prisma/client";
import { Context } from "grammy";
import { db } from "../db.js";

const MONTH_SECONDS = 30 * 24 * 60 * 60;

export async function createPlanInvoice(context: Context, planCode: PlanCode) {
  const telegramId = context.from?.id;
  const chatId = context.chat?.id;
  if (!telegramId || !chatId) return;

  const [plan, user] = await Promise.all([
    db.plan.findFirstOrThrow({ where: { code: planCode, enabled: true } }),
    db.user.findUniqueOrThrow({ where: { telegramId: BigInt(telegramId) } })
  ]);
  const payload = `plan:${plan.code}:${crypto.randomUUID()}`;
  await db.payment.create({
    data: { userId: user.id, planCode: plan.code, amountStars: plan.priceStars, invoicePayload: payload }
  });

  await context.replyWithInvoice(
    plan.name,
    `${plan.description} Renovación mensual automática.`,
    payload,
    "XTR",
    [{ label: `${plan.name} mensual`, amount: plan.priceStars }],
    { subscription_period: MONTH_SECONDS } as never
  );
}

export async function confirmSuccessfulPayment(context: Context) {
  const payment = context.message?.successful_payment;
  const telegramId = context.from?.id;
  if (!payment || !telegramId) return false;

  const recorded = await db.payment.findUnique({ where: { invoicePayload: payment.invoice_payload }, include: { user: true } });
  if (!recorded || recorded.user.telegramId !== BigInt(telegramId)) return false;

  const expiration = payment.subscription_expiration_date
    ? new Date(payment.subscription_expiration_date * 1000)
    : new Date(Date.now() + MONTH_SECONDS * 1000);
  await db.$transaction([
    db.payment.update({
      where: { id: recorded.id },
      data: {
        telegramChargeId: payment.telegram_payment_charge_id,
        providerChargeId: payment.provider_payment_charge_id,
        successfulAt: new Date()
      }
    }),
    db.subscription.create({
      data: {
        userId: recorded.userId,
        planId: (await db.plan.findFirstOrThrow({ where: { code: recorded.planCode } })).id,
        endsAt: expiration,
        telegramChargeId: payment.telegram_payment_charge_id,
        autoRenew: Boolean(payment.is_recurring)
      }
    })
  ]);
  return true;
}
