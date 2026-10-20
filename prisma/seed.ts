import { PlanCode, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const plans = [
  { code: PlanCode.BASIC, name: "🍿 Básico", description: "Películas, buscador y atención básica.", priceStars: 100, priceMxn: 39, benefits: ["Películas", "Buscador", "Filtros", "Atención básica"] },
  { code: PlanCode.PLUS, name: "🎬 Plus", description: "Todo Básico, más series, favoritos e historial.", priceStars: 180, priceMxn: 69, benefits: ["Películas y series", "Favoritos", "Historial", "Novedades"] },
  { code: PlanCode.PREMIUM, name: "🔥 Premium", description: "Todo Plus, más anime y funciones avanzadas.", priceStars: 250, priceMxn: 99, benefits: ["Anime", "Búsqueda avanzada", "Solicitudes", "Acceso anticipado"] },
  { code: PlanCode.ULTRA, name: "💎 Ultra", description: "Todo Premium con beneficios exclusivos.", priceStars: 350, priceMxn: 149, benefits: ["Contenido exclusivo", "Más solicitudes", "Funciones anticipadas", "Atención prioritaria"] }
];

for (const plan of plans) {
  await prisma.plan.upsert({ where: { code: plan.code }, create: plan, update: plan });
}

await prisma.$disconnect();
