import { PrismaClient } from "@prisma/client";

export const DATABASE_UNAVAILABLE_MESSAGE =
  "La BD no esta arriba. Verifica que la base de datos este levantada y que DATABASE_URL sea correcto.";

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}

export async function assertDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(DATABASE_UNAVAILABLE_MESSAGE, { cause: error });
  }
}
