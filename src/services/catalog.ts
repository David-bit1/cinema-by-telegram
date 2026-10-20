import { ContentType } from "@prisma/client";
import { db } from "../db.js";

export async function browseCatalog(type: ContentType) {
  return db.content.findMany({
    where: { type, published: true, rightsConfirmed: true },
    orderBy: { title: "asc" },
    take: 20
  });
}

export async function searchCatalog(query: string) {
  return db.content.findMany({
    where: {
      published: true,
      rightsConfirmed: true,
      title: { contains: query, mode: "insensitive" }
    },
    orderBy: { title: "asc" },
    take: 20
  });
}

export async function filterCatalog(genre?: string, releaseYear?: number) {
  return db.content.findMany({
    where: { published: true, rightsConfirmed: true, ...(genre ? { genre: { equals: genre, mode: "insensitive" } } : {}), ...(releaseYear ? { releaseYear } : {}) },
    orderBy: { title: "asc" },
    take: 20
  });
}

export async function getContent(id: string) {
  return db.content.findFirst({
    where: { id, published: true, rightsConfirmed: true },
    include: { seasons: { include: { episodes: true }, orderBy: { number: "asc" } } }
  });
}
