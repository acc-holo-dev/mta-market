// Authentication routes (OAuth2 Discord + JWT)
import { Router, Request, Response } from "express";
import { authRateLimit } from "../lib/rateLimit";
import { authenticate, AuthRequest } from "../lib/auth";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { db } from "../prisma/db";
import { sendWelcomeEmail } from "../lib/email";

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
      console.error("Discord token error:", error);
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
      console.error("Discord user error:", error);
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
          console.error("Failed to send welcome email:", err)
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

    // Create session
    await db.orm.public.Session.create({
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    });

    // Store refresh token in HttpOnly cookie
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });

    // Redirect to frontend with access token in a temporary session
    // Frontend should store access_token in memory only, never localStorage
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    
    // Store access token temporarily in a short-lived cookie for the callback page
    res.cookie("auth_callback_token", accessToken, {
      httpOnly: false, // Frontend needs to read this once
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 1000, // 1 minute - just enough for the callback page to read
      path: "/auth/callback",
    });
    
    res.redirect(`${frontendUrl}/auth/callback`);
  } catch (error) {
    console.error("Discord OAuth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// POST /auth/refresh - Refresh access token
router.post("/refresh", authRateLimit, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);

    if (!payload) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Verify session exists and is valid
    const session = await db.orm.public.Session.where({ refreshToken }).first();

    if (!session) {
      res.status(401).json({ error: "Session not found" });
      return;
    }

    const expiresAt = new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      // Delete expired session
      await db.orm.public.Session.where({ id: session.id }).delete();

      res.status(401).json({ error: "Session expired" });
      return;
    }

    // Generate new access token
    const accessToken = generateAccessToken(payload);

    res.json({
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m",
    });
  } catch (error) {
    console.error("Refresh token error:", error);
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

    // Delete session
    const session = await db.orm.public.Session.where({ refreshToken }).first();

    if (session) {
      await db.orm.public.Session.where({ id: session.id }).delete();
    }

    // Clear refresh token cookie
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
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
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

export default router;
