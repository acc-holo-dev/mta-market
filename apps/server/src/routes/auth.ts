// Authentication routes (OAuth2 Discord + JWT)
import { Router, Request, Response } from "express";
import { authRateLimit } from "../lib/rateLimit";
import { authenticate, AuthRequest } from "../lib/auth";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { hashRefreshToken, generateTokenId, verifyRefreshTokenHash } from "../lib/tokenSecurity";
import { setRefreshCookie, clearRefreshCookie } from "../lib/cookies";
import { db } from "../prisma/db";
import { sendWelcomeEmail } from "../lib/email";
import { reqLog } from "../middleware/requestId";

const router: Router = Router();

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  verified?: boolean;
  global_name?: string;
}

// GET /auth/discord - Redirect to Discord OAuth2
router.get("/discord", authRateLimit, (req: Request, res: Response) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).json({ error: "Discord OAuth not configured" });
    return;
  }

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=identify%20email`;

  res.redirect(discordAuthUrl);
});

// GET /auth/discord/callback - OAuth2 callback
router.get("/discord/callback", authRateLimit, async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Missing code parameter" });
      return;
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      res.status(500).json({ error: "Discord OAuth not configured" });
      return;
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      reqLog(req).error("discord_token_exchange_failed", { status: tokenResponse.status, error });
      res.status(500).json({ error: "Failed to exchange code for token" });
      return;
    }

    const tokenData = (await tokenResponse.json()) as DiscordTokenResponse;

    // Fetch user data from Discord
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      reqLog(req).error("discord_user_fetch_failed", { status: userResponse.status, error });
      res.status(500).json({ error: "Failed to fetch user data" });
      return;
    }

    const discordUser = (await userResponse.json()) as DiscordUser;

    // Check if user exists
    let user = await db.orm.public.User.where({
      email: discordUser.email || `${discordUser.id}@discord.local`,
    }).first();

    if (!user) {
      // Create new user
      const username = discordUser.username || `discord_${discordUser.id}`;
      const displayName = discordUser.global_name || discordUser.username;
      const avatar = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;

      user = await db.orm.public.User.create({
        email: discordUser.email || `${discordUser.id}@discord.local`,
        username,
        displayName,
        avatar,
        role: "USER",
        status: "ACTIVE",
      });

      // Send welcome email
      if (discordUser.email) {
        sendWelcomeEmail(discordUser.email, username).catch((err) =>
          reqLog(req).error("welcome_email_send_failed", { recipient: discordUser.email, username, error: err })
        );
      }

      // Create Account link
      await db.orm.public.Account.create({
        userId: user.id,
        provider: "DISCORD",
        providerAccountId: discordUser.id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: Math.floor(Date.now() / 1000) + tokenData.expires_in,
      });
    } else {
      // Update existing account
      const account = await db.orm.public.Account.where({
        userId: user.id,
        provider: "DISCORD",
      }).first();

      if (account) {
        await db.orm.public.Account.where({ id: account.id }).update({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          expiresAt: Math.floor(Date.now() / 1000) + tokenData.expires_in,
        });
      } else {
        // Create Account if doesn't exist
        await db.orm.public.Account.create({
          userId: user.id,
          provider: "DISCORD",
          providerAccountId: discordUser.id,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          expiresAt: Math.floor(Date.now() / 1000) + tokenData.expires_in,
        });
      }
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const tokenFamily = generateTokenId(); // For rotation tracking

    // Create session with hashed refresh token
    await db.orm.public.Session.create({
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      tokenFamily,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    // Store refresh token in HttpOnly cookie (TASK A-001/D-006).
    // The access token is NOT stored in any cookie: the frontend callback
    // page exchanges the refresh cookie for an access token via
    // POST /auth/refresh and keeps it in memory only.
    setRefreshCookie(res, refreshToken);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendUrl}/auth/callback`);
  } catch (error) {
    reqLog(req).error("discord_oauth_failed", { error });
    res.status(500).json({ error: "Authentication failed" });
  }
});

// POST /auth/refresh - Refresh access token with rotation
router.post("/refresh", authRateLimit, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      res.status(401).json({ error: "Refresh token required" });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Verify session exists by hashed token
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await db.orm.public.Session.where({ refreshTokenHash }).first();

    if (!session) {
      reqLog(req).warn("refresh_session_not_found", { user_id: payload.userId });
      res.status(401).json({ error: "Session not found" });
      return;
    }

    // SECURITY: Check for token reuse (rotation detection)
    if (session.reuseDetected) {
      reqLog(req).error("refresh_token_reuse_detected", {
        session_id: session.id,
        user_id: session.userId,
        token_family: session.tokenFamily,
      });

      // Revoke all sessions in this token family.
      // NOTE: the contract ORM's delete() removes a single row per call,
      // so the family is drained in a loop until it is empty.
      if (session.tokenFamily) {
        let guard = 0;
        while (guard++ < 1000) {
          const familySessions = await db.orm.public.Session.where({
            tokenFamily: session.tokenFamily,
          }).all();
          if (familySessions.length === 0) break;
          for (const familySession of familySessions) {
            await db.orm.public.Session.where({ id: familySession.id }).delete();
          }
        }
        reqLog(req).warn("token_family_sessions_revoked", { token_family: session.tokenFamily });
      } else {
        await db.orm.public.Session.where({ id: session.id }).delete();
      }

      clearRefreshCookie(res);
      res.status(401).json({
        error: "Token reuse detected",
        message: "All sessions revoked for security. Please log in again."
      });
      return;
    }

    const expiresAt = new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      // Delete expired session
      await db.orm.public.Session.where({ id: session.id }).delete();
      clearRefreshCookie(res);
      res.status(401).json({ error: "Session expired" });
      return;
    }

    // Generate new tokens (rotation)
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);

    // Mark old session as used (for reuse detection)
    await db.orm.public.Session.where({ id: session.id }).update({
      reuseDetected: true,
    });

    // Create new session (rotation)
    await db.orm.public.Session.create({
      userId: session.userId,
      refreshTokenHash: newRefreshTokenHash,
      tokenFamily: session.tokenFamily,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastRotatedAt: new Date().toISOString(),
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    // Set new refresh token cookie (rotation)
    setRefreshCookie(res, newRefreshToken);

    res.json({
      accessToken: newAccessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m",
    });
  } catch (error) {
    reqLog(req).error("refresh_token_failed", { error });
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

// POST /auth/logout - Logout
router.post("/logout", authRateLimit, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    // Delete session by hashed token
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const session = await db.orm.public.Session.where({ refreshTokenHash }).first();

    if (session) {
      await db.orm.public.Session.where({ id: session.id }).delete();
    }

    // Clear refresh token cookie
    clearRefreshCookie(res);

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    reqLog(req).error("logout_failed", { error });
    res.status(500).json({ error: "Failed to logout" });
  }
});

// GET /auth/me - Get current user (authenticated)
router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.orm.public.User.where({ id: req.user!.userId }).first();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    });
  } catch (error) {
    reqLog(req).error("get_user_failed", { error });
    res.status(500).json({ error: "Failed to get user" });
  }
});

export default router;
