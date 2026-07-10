import {
  auth,
  BETTER_AUTH_API_BASE_PATH,
  getConfiguredAuthBaseUrl,
} from "@/lib/better-auth";

const STRIPPED_AUTH_BASE_PATH = "/api/auth";

function normalizeAuthRequest(request: Request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith(BETTER_AUTH_API_BASE_PATH)) {
    if (url.pathname.startsWith(STRIPPED_AUTH_BASE_PATH)) {
      url.pathname = `${BETTER_AUTH_API_BASE_PATH}${url.pathname.slice(STRIPPED_AUTH_BASE_PATH.length)}`;
    } else {
      url.pathname = `${BETTER_AUTH_API_BASE_PATH}${url.pathname}`;
    }
  }

  return new Request(url, request);
}

export function handleBetterAuthRoute(request: Request) {
  return auth.handler(normalizeAuthRequest(request));
}

export function getBetterAuthAbsolutePath(pathname: string) {
  return `${getConfiguredAuthBaseUrl()}${BETTER_AUTH_API_BASE_PATH}${pathname}`;
}

export function getAbsoluteAppUrl(pathname: string) {
  const basePath = process.env.BASE_PATH ?? "";
  return `${getConfiguredAuthBaseUrl()}${basePath}${pathname}`;
}
