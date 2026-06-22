-- LOW.5 — single-tenant auth hardening. Real credential login layered over the
-- existing demo-safe middleware guard. Passwords are PBKDF2-SHA256 (Web Crypto)
-- hashes; sessions are stateless HMAC-signed cookies. The `role` column drives
-- the middleware authorization policy (viewer | preparer | approver).
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
