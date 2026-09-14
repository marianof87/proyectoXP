let prismaInstance: any;

const getPrismaClient = (): any => {
  if (!prismaInstance) {
    const { PrismaClient } = require("@prisma/client");
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
};

export const prisma = getPrismaClient();
