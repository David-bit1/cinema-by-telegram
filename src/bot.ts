import { ContentType, PlanCode } from "@prisma/client";
import { Bot, Context, InlineKeyboard } from "grammy";
import { config } from "./config.js";
import { db } from "./db.js";
import { activeSubscription, hasContentAccess } from "./services/access.js";
import { browseCatalog, filterCatalog, getContent, searchCatalog } from "./services/catalog.js";
import { confirmSuccessfulPayment, createPlanInvoice } from "./services/payments.js";
import { audit, registerTelegramUser } from "./services/users.js";

const searchMode = new Set<number>();
const movieDrafts = new Map<number, { step: "title" | "synopsis" | "video"; title?: string; synopsis?: string }>();

function mainMenu() {
  return new InlineKeyboard()
    .text("🎬 Películas", "browse:MOVIE").text("📺 Series", "browse:SERIES").row()
    .text("🌸 Anime", "browse:ANIME").text("🔎 Buscar", "search").row()
    .text("⭐ Mi suscripción", "subscription").text("🔖 Favoritos", "favorites").row()
    .text("❔ Ayuda", "help");
}

function plansMenu() {
  return new InlineKeyboard()
    .text("🍿 Básico", "plan:BASIC").text("🎬 Plus", "plan:PLUS").row()
    .text("🔥 Premium", "plan:PREMIUM").text("💎 Ultra", "plan:ULTRA");
}

function typeName(type: ContentType) {
  return { MOVIE: "Películas", SERIES: "Series", ANIME: "Anime" }[type];
}

async function showCatalog(context: Context, type: ContentType, heading = typeName(type)) {
  const items = await browseCatalog(type);
  if (!items.length) return context.reply(`Aún no hay ${heading.toLowerCase()} disponibles. Vuelve pronto.`);
  const keyboard = new InlineKeyboard();
  for (const item of items) keyboard.text(item.title, `content:${item.id}`).row();
  await context.reply(`${heading} disponibles:`, { reply_markup: keyboard });
}

async function showContent(context: Context, contentId: string) {
  const content = await getContent(contentId);
  if (!content) return context.reply("Este contenido no está disponible.");
  const allowed = await hasContentAccess(context.from!.id, content.requiredPlan);
  const detail = [content.genre, content.releaseYear].filter(Boolean).join(" · ");
  const planText = content.requiredPlan ? `Plan requerido: ${content.requiredPlan}.` : "Acceso gratuito.";
  if (!allowed) {
    return context.reply(`${content.title}${detail ? ` · ${detail}` : ""}\n\n${content.synopsis}\n\n${planText}\nActiva un plan para acceder.`, { reply_markup: plansMenu() });
  }

  if (content.type === "MOVIE") {
    if (!content.telegramFileId) return context.reply("La película está en preparación; vuelve pronto.");
    await context.replyWithVideo(content.telegramFileId, {
      caption: `${content.title}${detail ? ` · ${detail}` : ""}\n\n${content.synopsis}`,
      reply_markup: new InlineKeyboard().text("🔖 Guardar en favoritos", `favorite:${content.id}`)
    });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const season of content.seasons) {
    for (const episode of season.episodes) {
      keyboard.text(`T${season.number} · E${episode.number}: ${episode.title}`, `episode:${episode.id}`).row();
    }
  }
  await context.reply(`${content.title}\n\n${content.synopsis}\n\nSelecciona un episodio:`, { reply_markup: keyboard });
}

export function createBot() {
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  bot.use(async (context, next) => {
    if (context.from) await registerTelegramUser(context.from);
    return next();
  });

  bot.command("start", async (context) => {
    await context.reply(`Bienvenido a ${config.APP_NAME}. Explora el catálogo y administra tu suscripción desde el menú.`, { reply_markup: mainMenu() });
  });

  bot.command("menu", async (context) => context.reply("Menú principal", { reply_markup: mainMenu() }));
  bot.command("miid", async (context) => context.reply(`Tu ID de Telegram es: ${context.from!.id}`));
  bot.command("paysupport", async (context) => context.reply("Soporte de pagos: contacta al administrador del bot indicando tu ID de pago de Telegram."));

  bot.command("admin", async (context) => {
    if (!config.adminIds.has(context.from!.id)) return;
    const plans = await db.plan.findMany({ orderBy: { code: "asc" } });
    const lines = plans.map((plan) => `${plan.code}: $${plan.priceMxn} MXN · ${plan.priceStars} Stars (${plan.enabled ? "activo" : "inactivo"})`);
    await context.reply(`Administración\n\n${lines.join("\n")}\n\n/setprice CODIGO STARS — cambia Stars\n/setmxn CODIGO PESOS — cambia referencia MXN\n/acceso ID FREE|BASIC|PLUS|PREMIUM|ULTRA\n/ficha ID GENERO AÑO — agrega filtros`);
  });

  bot.command("setprice", async (context) => {
    if (!config.adminIds.has(context.from!.id)) return;
    const [, code, rawAmount] = context.message!.text.split(/\s+/);
    if (!Object.values(PlanCode).includes(code as PlanCode) || !/^\d+$/.test(rawAmount ?? "")) {
      return context.reply("Uso: /setprice BASIC|PLUS|PREMIUM|ULTRA cantidad_en_stars");
    }
    const amount = Number(rawAmount);
    if (amount < 1 || amount > 10_000) return context.reply("El precio debe estar entre 1 y 10,000 Stars.");
    await db.plan.update({ where: { code: code as PlanCode }, data: { priceStars: amount } });
    await context.reply(`Precio de ${code} actualizado a ${amount} Stars.`);
  });

  bot.command("setmxn", async (context) => {
    if (!config.adminIds.has(context.from!.id)) return;
    const [, code, rawAmount] = context.message!.text.split(/\s+/);
    if (!Object.values(PlanCode).includes(code as PlanCode) || !/^\d+$/.test(rawAmount ?? "")) return context.reply("Uso: /setmxn BASIC|PLUS|PREMIUM|ULTRA pesos");
    await db.plan.update({ where: { code: code as PlanCode }, data: { priceMxn: Number(rawAmount) } });
    await context.reply(`Precio de referencia de ${code} actualizado a $${rawAmount} MXN.`);
  });

  bot.command("agregar_pelicula", async (context) => {
    if (!config.adminIds.has(context.from!.id)) return;
    movieDrafts.set(context.from!.id, { step: "title" });
    await context.reply("Escribe el título de la película.");
  });

  bot.command("publicar", async (context) => {
    if (!config.adminIds.has(context.from!.id)) return;
    const [, contentId] = context.message!.text.split(/\s+/);
    if (!contentId) return context.reply("Uso: /publicar ID_DE_CONTENIDO");
    const content = await db.content.findUnique({ where: { id: contentId } });
    if (!content) return context.reply("No encontré ese contenido.");
    await db.content.update({ where: { id: contentId }, data: { published: true, rightsConfirmed: true } });
    await context.reply(`“${content.title}” ya está visible en el catálogo.`);
  });

  bot.command("acceso", async (context) => {
    if (!config.adminIds.has(context.from!.id)) return;
    const [, contentId, rawPlan] = context.message!.text.split(/\s+/);
    const plan = rawPlan?.toUpperCase();
    if (!contentId || !plan || !["FREE", ...Object.values(PlanCode)].includes(plan)) {
      return context.reply("Uso: /acceso ID FREE|BASIC|PLUS|PREMIUM|ULTRA");
    }
    const content = await db.content.findUnique({ where: { id: contentId } });
    if (!content) return context.reply("No encontré ese contenido.");
    await db.content.update({
      where: { id: contentId },
      data: { requiredPlan: plan === "FREE" ? null : plan as PlanCode }
    });
    await context.reply(`Acceso de “${content.title}” actualizado a ${plan === "FREE" ? "gratuito" : plan}.`);
  });

  bot.command("ficha", async (context) => {
    if (!config.adminIds.has(context.from!.id)) return;
    const [, contentId, genre, rawYear] = context.message!.text.split(/\s+/);
    const releaseYear = Number(rawYear);
    if (!contentId || !genre || !Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100) return context.reply("Uso: /ficha ID GENERO AÑO");
    await db.content.update({ where: { id: contentId }, data: { genre, releaseYear } });
    await context.reply("Ficha actualizada.");
  });

  bot.command("filtrar", async (context) => {
    const [, rawFilter] = context.message!.text.split(/\s+/, 2);
    if (!rawFilter) return context.reply("Uso: /filtrar GENERO o /filtrar AÑO");
    const releaseYear = /^\d{4}$/.test(rawFilter) ? Number(rawFilter) : undefined;
    const items = await filterCatalog(releaseYear ? undefined : rawFilter, releaseYear);
    if (!items.length) return context.reply("No encontramos resultados con ese filtro.");
    const keyboard = new InlineKeyboard();
    for (const item of items) keyboard.text(item.title, `content:${item.id}`).row();
    await context.reply("Resultados filtrados:", { reply_markup: keyboard });
  });

  bot.callbackQuery(/^browse:(MOVIE|SERIES|ANIME)$/, async (context) => {
    await context.answerCallbackQuery();
    await showCatalog(context, context.match[1] as ContentType);
  });
  bot.callbackQuery("search", async (context) => {
    searchMode.add(context.from.id);
    await context.answerCallbackQuery();
    await context.reply("Escribe el título que deseas buscar.");
  });
  bot.callbackQuery("help", async (context) => {
    await context.answerCallbackQuery();
    await context.reply("Usa las categorías o Buscar. Si una obra exige un plan, elige uno en Mi suscripción. Para incidencias de pago, usa /paysupport.");
  });
  bot.callbackQuery("subscription", async (context) => {
    await context.answerCallbackQuery();
    const subscription = await activeSubscription(context.from.id);
    if (subscription) {
      return context.reply(`Plan actual: ${subscription.plan.name}\nVence: ${subscription.endsAt.toLocaleDateString("es-MX")}`);
    }
    const user = await db.user.findUnique({ where: { telegramId: BigInt(context.from.id) } });
    const trial = user?.trialEndsAt && user.trialEndsAt > new Date()
      ? `\nPrueba gratuita limitada hasta: ${user.trialEndsAt.toLocaleDateString("es-MX")}`
      : "";
    await context.reply(`No tienes un plan activo.${trial}\n\nElige el que prefieras:`, { reply_markup: plansMenu() });
  });
  bot.callbackQuery(/^plan:(BASIC|PLUS|PREMIUM|ULTRA)$/, async (context) => {
    await context.answerCallbackQuery();
    await createPlanInvoice(context, context.match[1] as PlanCode);
  });
  bot.callbackQuery(/^favorite:(.+)$/, async (context) => {
    const user = await db.user.findUniqueOrThrow({ where: { telegramId: BigInt(context.from.id) } });
    await db.favorite.upsert({ where: { userId_contentId: { userId: user.id, contentId: context.match[1] } }, create: { userId: user.id, contentId: context.match[1] }, update: {} });
    await context.answerCallbackQuery({ text: "Guardado en favoritos" });
  });
  bot.callbackQuery("favorites", async (context) => {
    await context.answerCallbackQuery();
    const user = await db.user.findUnique({ where: { telegramId: BigInt(context.from.id) }, include: { favorites: { include: { content: true } } } });
    if (!user?.favorites.length) return context.reply("Aún no tienes favoritos.");
    const keyboard = new InlineKeyboard();
    for (const favorite of user.favorites) keyboard.text(favorite.content.title, `content:${favorite.contentId}`).row();
    await context.reply("Tus favoritos:", { reply_markup: keyboard });
  });
  bot.callbackQuery(/^content:(.+)$/, async (context) => {
    await context.answerCallbackQuery();
    await showContent(context, context.match[1]);
  });
  bot.callbackQuery(/^episode:(.+)$/, async (context) => {
    await context.answerCallbackQuery();
    const episode = await db.episode.findUnique({
      where: { id: context.match[1] },
      include: { season: { include: { content: true } } }
    });
    if (!episode || !episode.season.content.published || !episode.season.content.rightsConfirmed) return context.reply("Este episodio no está disponible.");
    if (!(await hasContentAccess(context.from.id, episode.season.content.requiredPlan))) return context.reply("Necesitas un plan con acceso a este episodio.", { reply_markup: plansMenu() });
    if (!episode.telegramFileId) return context.reply("El episodio está en preparación; vuelve pronto.");
    await context.replyWithVideo(episode.telegramFileId, { caption: `${episode.season.content.title} · T${episode.season.number} E${episode.number}: ${episode.title}` });
  });

  bot.on("pre_checkout_query", async (context) => {
    const payment = await db.payment.findUnique({ where: { invoicePayload: context.preCheckoutQuery.invoice_payload }, include: { user: true } });
    const belongsToBuyer = payment?.user.telegramId === BigInt(context.preCheckoutQuery.from.id);
    await context.answerPreCheckoutQuery(Boolean(belongsToBuyer), {
      error_message: belongsToBuyer ? undefined : "Esta factura ya no es válida. Vuelve a generar tu suscripción."
    });
  });
  bot.on("message:successful_payment", async (context) => {
    const confirmed = await confirmSuccessfulPayment(context);
    if (!confirmed) return context.reply("No pudimos validar este pago. Contacta a /paysupport con el comprobante.");
    await audit((await db.user.findUnique({ where: { telegramId: BigInt(context.from.id) } }))?.id, "payment_confirmed");
    await context.reply("Pago confirmado. Tu suscripción ya está activa.", { reply_markup: mainMenu() });
  });
  bot.on("message:video", async (context) => {
    const draft = movieDrafts.get(context.from.id);
    if (!draft || draft.step !== "video" || !config.adminIds.has(context.from.id)) return;
    const content = await db.content.create({
      data: {
        title: draft.title!,
        synopsis: draft.synopsis!,
        type: "MOVIE",
        telegramFileId: context.message.video.file_id
      }
    });
    movieDrafts.delete(context.from.id);
    await audit((await db.user.findUnique({ where: { telegramId: BigInt(context.from.id) } }))?.id, "movie_draft_created", content.id);
    await context.reply(`Película guardada como borrador.\n\nID: ${content.id}\n\nPara hacerla visible: /publicar ${content.id}`);
  });
  bot.on("message:text", async (context) => {
    const draft = movieDrafts.get(context.from.id);
    if (draft && config.adminIds.has(context.from.id)) {
      if (draft.step === "title") {
        movieDrafts.set(context.from.id, { step: "synopsis", title: context.message.text.trim() });
        return context.reply("Escribe una sinopsis breve.");
      }
      if (draft.step === "synopsis") {
        movieDrafts.set(context.from.id, { ...draft, step: "video", synopsis: context.message.text.trim() });
        return context.reply("Ahora envía el archivo de vídeo como vídeo de Telegram, no como documento.");
      }
    }
    if (!searchMode.delete(context.from.id)) return;
    const query = context.message.text.trim();
    const user = await db.user.findUniqueOrThrow({ where: { telegramId: BigInt(context.from.id) } });
    await db.searchHistory.create({ data: { userId: user.id, query } });
    const results = await searchCatalog(query);
    if (!results.length) return context.reply("No encontramos resultados para ese título.");
    const keyboard = new InlineKeyboard();
    for (const result of results) keyboard.text(result.title, `content:${result.id}`).row();
    await context.reply("Resultados:", { reply_markup: keyboard });
  });

  bot.catch((error) => {
    const detail = error.error instanceof Error ? error.error.message : "Error desconocido";
    console.error(`Telegram bot error: ${detail}`);
  });
  return bot;
}
