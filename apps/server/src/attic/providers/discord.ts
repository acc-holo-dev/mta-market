// Discord Identity Provider Implementation
import crypto from "crypto";
import {
  IIdentityProvider,
  ProviderUser,
  ProviderTokens,
  AuthorizationRequest,
  AuthorizationResponse,
  CallbackRequest,
} from "../identityProvider";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const DISCORD_ENABLED = !!DISCORD_CLIENT_ID && !!DISCORD_CLIENT_SECRET;

// Discord-specific types (internal)
interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
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

/**
 * Discord OAuth2 Provider
 */
export class DiscordProvider implements IIdentityProvider {
  readonly name = "discord";
  readonly displayName = "Discord";

  isEnabled(): boolean {
    return DISCORD_ENABLED;
  }

  getAuthorizationUrl(request: AuthorizationRequest): AuthorizationResponse {
    if (!this.isEnabled()) {
      throw new Error("Discord OAuth is not configured");
    }

    const state = request.state || crypto.randomBytes(16).toString("hex");
    const scopes = request.scopes || ["identify", "email"];

    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: request.redirectUri,
      response_type: "code",
      scope: scopes.join(" "),
      state,
    });

    return {
      authorizationUrl: `https://discord.com/api/oauth2/authorize?${params.toString()}`,
      state,
    };
  }

  async handleCallback(request: CallbackRequest): Promise<{
    tokens: ProviderTokens;
    user: ProviderUser;
  }> {
    if (!this.isEnabled()) {
      throw new Error("Discord OAuth is not configured");
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: request.code,
        redirect_uri: request.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Discord token exchange failed: ${error}`);
    }

    const tokenData = (await tokenResponse.json()) as DiscordTokenResponse;

    // Fetch user info
    const user = await this.getUserInfo(tokenData.access_token);

    return {
      tokens: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
      },
      user,
    };
  }

  async getUserInfo(accessToken: string): Promise<ProviderUser> {
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      throw new Error(`Failed to fetch Discord user: ${error}`);
    }

    const discordUser = (await userResponse.json()) as DiscordUser;

    return {
      providerId: discordUser.id,
      email: discordUser.email,
      username: discordUser.username,
      displayName: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : undefined,
      verified: discordUser.verified,
      metadata: {
        discriminator: discordUser.discriminator,
        raw: discordUser,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<ProviderTokens> {
    if (!this.isEnabled()) {
      throw new Error("Discord OAuth is not configured");
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Discord token refresh failed: ${error}`);
    }

    const tokenData = (await tokenResponse.json()) as DiscordTokenResponse;

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
    };
  }
}

// Register Discord provider
import { identityProviders } from "../identityProvider";
identityProviders.register(new DiscordProvider());

// Export for direct usage (backward compatibility)
export const discordProvider = new DiscordProvider();
export { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_ENABLED };
