import "dotenv/config";
import { createUserAccount } from "../lib/accounts.js";

/**
 * One-time bootstrap: creates the first platform admin account. There's no
 * UI for this — someone has to exist before any UI can be gated behind auth.
 *
 * Usage:
 *   node src/scripts/createPlatformAdmin.js --userId PLATFORM-ADMIN --password "SomeStrongPass1" --name "Your Name" --email you@example.com
 */

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

async function main() {
  const { userId, password, name, email } = parseArgs();

  if (!userId || !password || !name || !email) {
    console.error(
      'Usage: node src/scripts/createPlatformAdmin.js --userId PLATFORM-ADMIN --password "..." --name "Your Name" --email you@example.com'
    );
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  const { uid } = await createUserAccount({
    userId,
    password,
    name,
    contactEmail: email,
    role: "PLATFORM_ADMIN",
    orgId: null,
  });

  console.log(`Platform admin created. uid=${uid}`);
  console.log(`Log in at /login with User ID "${userId}" and the password you provided.`);
  console.log("You'll be forced to set a new password on first login, as with any account here.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
