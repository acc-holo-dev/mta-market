// Prisma Client wrapper for MTA Market
import { db } from "../prisma/db";

// Prisma 8 uses db.orm.public.ModelName
// Create a compatibility wrapper for easier access
export const prisma: typeof db.orm.public = {
  User: db.orm.public.User,
  Account: db.orm.public.Account,
  Session: db.orm.public.Session,
  Resource: db.orm.public.Resource,
  ResourceVersion: db.orm.public.ResourceVersion,
  Purchase: db.orm.public.Purchase,
  License: db.orm.public.License,
  Installation: db.orm.public.Installation,
  Payment: db.orm.public.Payment,
  FinancialTransaction: db.orm.public.FinancialTransaction,
  SellerBalance: db.orm.public.SellerBalance,
  Review: db.orm.public.Review,
};
