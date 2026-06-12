// Generates the auth env values for .env.local / Vercel.
// Usage: node scripts/generate-auth-env.mjs "your long random passphrase"
import crypto from "node:crypto";

const passphrase = process.argv[2];
if (!passphrase || passphrase.length < 12) {
  console.error('Usage: node scripts/generate-auth-env.mjs "your long random passphrase"');
  console.error("Pick a passphrase of at least 12 characters (longer and random is better).");
  process.exit(1);
}

console.log(`AUTH_SECRET=${crypto.randomBytes(32).toString("base64")}`);
console.log(`AUTH_PASSPHRASE_HASH=${crypto.createHash("sha256").update(passphrase).digest("hex")}`);
console.log(`# Optional fresh values for the other secrets:`);
console.log(`# API_SECRET=${crypto.randomBytes(24).toString("base64url")}`);
console.log(`# CRON_SECRET=${crypto.randomBytes(24).toString("base64url")}`);
console.log(`# TELEGRAM_WEBHOOK_SECRET=${crypto.randomBytes(24).toString("base64url")}`);
