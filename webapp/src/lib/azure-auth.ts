import crypto from "node:crypto";

export const AZURE_SSO_STATE_COOKIE = "starter_app_azure_sso_state";

export function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getConfiguredBasePath() {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? "";
}

export function getScopedCookiePath() {
  return getConfiguredBasePath() || "/";
}

export function getExternalOrigin(request: Request) {
  const configuredOrigin = process.env.AUTH_BASE_URL?.trim();
  if (configuredOrigin) {
    return trimTrailingSlash(configuredOrigin);
  }

  return new URL(request.url).origin;
}

export function getAuthBaseUrl(request: Request) {
  return `${getExternalOrigin(request)}${getConfiguredBasePath()}`;
}

export function getAzureRedirectUri(request: Request) {
  return `${getAuthBaseUrl(request)}/api/auth/callback/microsoft`;
}

export function hasRealAzureAdConfig() {
  return Boolean(
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID &&
    process.env.AZURE_AD_CLIENT_ID !== "replace-me" &&
    process.env.AZURE_AD_CLIENT_SECRET !== "replace-me" &&
    process.env.AZURE_AD_TENANT_ID !== "replace-me",
  );
}

export function createOAuthState() {
  return crypto.randomBytes(24).toString("hex");
}

export function getAzureAuthorizeUrl(request: Request, state: string) {
  const tenantId = process.env.AZURE_AD_TENANT_ID;

  if (!tenantId || !process.env.AZURE_AD_CLIENT_ID) {
    throw new Error("Azure AD configuration is incomplete.");
  }

  const authorizeUrl = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  );

  authorizeUrl.searchParams.set("client_id", process.env.AZURE_AD_CLIENT_ID);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", getAzureRedirectUri(request));
  authorizeUrl.searchParams.set("response_mode", "query");
  authorizeUrl.searchParams.set("scope", "openid profile email offline_access");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "select_account");

  return authorizeUrl;
}

type AzureTokenResponse = {
  access_token: string;
  id_token?: string;
};

export async function exchangeAzureCodeForTokens(
  request: Request,
  code: string,
) {
  const tenantId = process.env.AZURE_AD_TENANT_ID;

  if (
    !tenantId ||
    !process.env.AZURE_AD_CLIENT_ID ||
    !process.env.AZURE_AD_CLIENT_SECRET
  ) {
    throw new Error("Azure AD configuration is incomplete.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: getAzureRedirectUri(request),
      scope: "openid profile email offline_access",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Azure token exchange failed: ${response.status} ${details}`,
    );
  }

  return (await response.json()) as AzureTokenResponse;
}

type AzureUserProfile = {
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
  sub?: string;
};

export async function fetchAzureUserProfile(
  accessToken: string,
  _idToken?: string,
) {
  const response = await fetch("https://graph.microsoft.com/oidc/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (response.ok) {
    return (await response.json()) as AzureUserProfile;
  }

  const details = await response.text();
  throw new Error(`Azure userinfo failed: ${response.status} ${details}`);
}

export function extractAzureIdentity(profile: AzureUserProfile) {
  const email = profile.email ?? profile.preferred_username ?? profile.upn;

  if (!email) {
    throw new Error("Azure AD did not return an email address.");
  }

  return {
    email: email.toLowerCase(),
    name: profile.name?.trim() || email,
  };
}
