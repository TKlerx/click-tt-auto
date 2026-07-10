function getConfiguredBasePath() {
  if (typeof window !== "undefined") {
    return document.body.dataset.basePath ?? "";
  }

  return process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH ?? "";
}

export function withBasePath(path: string) {
  const basePath = getConfiguredBasePath();

  if (!basePath) {
    return path;
  }

  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
}
