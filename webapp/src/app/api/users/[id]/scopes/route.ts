import {
  grantManagedUserScope,
  listManagedUserScopes,
  revokeManagedUserScope,
} from "@/services/api/scope-assignments";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await listManagedUserScopes(params, request);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ scopes: result.scopes });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const body = (await request.json()) as { scopeId?: string };
  const result = await grantManagedUserScope(params, body, request);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ scope: result.scope });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const body = (await request.json()) as { scopeId?: string };
  const result = await revokeManagedUserScope(params, body, request);
  if ("error" in result) {
    return result.error;
  }

  return Response.json({ scope: result.scope });
}
