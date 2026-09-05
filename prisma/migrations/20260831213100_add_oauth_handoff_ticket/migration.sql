-- CreateTable
CREATE TABLE "oauth_handoff_tickets" (
    "id" UUID NOT NULL,
    "ticketHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "handoffChallenge" TEXT NOT NULL,
    "sessionCiphertext" TEXT NOT NULL,
    "sessionIv" TEXT NOT NULL,
    "sessionAuthTag" TEXT NOT NULL,
    "ticketExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_handoff_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_handoff_tickets_ticketHash_key" ON "oauth_handoff_tickets"("ticketHash");
