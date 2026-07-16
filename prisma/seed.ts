/**
 * Optional seed. Safe to run against an empty database.
 * Users are created by Supabase Auth (User.id mirrors auth.users.id), so
 * seeding real tenants requires an auth user first — this script only
 * demonstrates the entry point. Run: `npx prisma db seed`.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed: nothing to insert by default.");
  console.log("Tenants are provisioned through the onboarding flow after Supabase sign-up.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
