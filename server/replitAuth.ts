import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  // Set default domain based on REPL_ID for Replit environment
  const replId = process.env.REPL_ID;
  if (replId) {
    process.env.REPLIT_DOMAINS = `${replId}-00-mgz6pv03v93w.spock.replit.dev`;
    console.log('🔐 Auto-set REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS);
  } else {
    throw new Error("Environment variable REPLIT_DOMAINS not provided and REPL_ID not found");
  }
}

// Set default ISSUER_URL if not provided
if (!process.env.ISSUER_URL) {
  process.env.ISSUER_URL = "https://replit.com/oidc";
  console.log('🔐 Auto-set ISSUER_URL:', process.env.ISSUER_URL);
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  console.log('🔐 Setting up authentication...');
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  console.log('🔐 Passport middleware initialized');

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Add strategies for both the replit domain and localhost for development
  const domains = process.env.REPLIT_DOMAINS!.split(",");
  
  for (const domain of domains) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
    console.log(`🔐 Registered strategy: replitauth:${domain}`);
  }
  
  // Add localhost strategy for development
  console.log('🔐 Setting up localhost strategy...');
  const localhostStrategy = new Strategy(
    {
      name: `replitauth:localhost`,
      config,
      scope: "openid email profile offline_access",
      callbackURL: `https://${domains[0]}/api/callback`, // Use the first domain for callback
    },
    verify,
  );
  passport.use(localhostStrategy);
  console.log('🔐 Registered localhost strategy');

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));
  console.log('🔐 Passport serialization configured');

  // Login route moved to routes.ts to ensure proper registration order

  // Callback route moved to routes.ts to ensure proper registration order

  // Logout route moved to routes.ts to ensure proper registration order
  
  // Add test route to verify auth setup is working
  app.get("/api/auth-test", (req, res) => {
    console.log('🔐 Auth test route called');
    res.json({ message: "Auth setup is working", hostname: req.hostname });
  });

  console.log('🔐 Authentication middleware configured. Routes are registered in routes.ts');
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user as any;
    
    console.log('🔐 Auth check - isAuthenticated:', !!req.isAuthenticated());
    console.log('🔐 Auth check - user exists:', !!user);
    console.log('🔐 Auth check - user.expires_at:', user?.expires_at);

    if (!req.isAuthenticated() || !user) {
      console.log('❌ Auth failed - no authentication or user');
      return res.status(401).json({ message: "Unauthorized" });
    }

    // If no expires_at, assume valid session
    if (!user.expires_at) {
      console.log('✅ Auth success - no expiry check needed');
      return next();
    }

    const now = Math.floor(Date.now() / 1000);
    if (now <= user.expires_at) {
      console.log('✅ Auth success - token still valid');
      return next();
    }

    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      console.log('❌ Auth failed - token expired and no refresh token');
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      console.log('🔄 Attempting token refresh...');
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
      console.log('✅ Token refreshed successfully');
      return next();
    } catch (refreshError) {
      console.error('❌ Token refresh failed:', refreshError);
      return res.status(401).json({ message: "Unauthorized" });
    }
  } catch (error) {
    console.error('❌ Authentication middleware error:', error);
    return res.status(500).json({ message: "Authentication error" });
  }
};
