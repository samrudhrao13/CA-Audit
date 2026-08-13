import { auth } from "../lib/firebaseAdmin.js";

/** Verifies the Firebase ID token in the Authorization header, attaches req.uid/req.email/req.name. */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    req.name = decoded.name || decoded.email;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
