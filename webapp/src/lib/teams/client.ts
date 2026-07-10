import type {
  TeamsChannelMessage,
  TeamsClient,
  TeamsMessageDeltaInput,
  TeamsMessageDeltaResult,
  TeamsMessageInput,
  TeamsMessageListInput,
} from "@/lib/teams/types";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const MAX_TOP = 50;

type GraphTokenResponse = {
  access_token: string;
  expires_in?: number;
};

type GraphIdentity = {
  user?: {
    id?: string;
    displayName?: string;
  };
  application?: {
    id?: string;
    displayName?: string;
  };
};

type GraphChatMessage = {
  id?: string;
  createdDateTime?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  from?: {
    user?: GraphIdentity["user"];
    application?: GraphIdentity["application"];
  };
};

type GraphMessageListResponse = {
  value?: GraphChatMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

type TeamsClientOptions = {
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  fetchImpl?: typeof fetch;
};

export function hasRealGraphTeamsConfig() {
  return Boolean(
    process.env.AZURE_AD_CLIENT_ID &&
    process.env.AZURE_AD_CLIENT_SECRET &&
    process.env.AZURE_AD_TENANT_ID &&
    process.env.AZURE_AD_CLIENT_ID !== "replace-me" &&
    process.env.AZURE_AD_CLIENT_SECRET !== "replace-me" &&
    process.env.AZURE_AD_TENANT_ID !== "replace-me",
  );
}

export function createGraphTeamsClient(
  options: TeamsClientOptions = {},
): TeamsClient {
  const clientId = options.clientId ?? process.env.AZURE_AD_CLIENT_ID ?? "";
  const clientSecret =
    options.clientSecret ?? process.env.AZURE_AD_CLIENT_SECRET ?? "";
  const tenantId = options.tenantId ?? process.env.AZURE_AD_TENANT_ID ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!clientId || clientId === "replace-me") {
    throw new Error(
      "AZURE_AD_CLIENT_ID is not configured for Graph Teams access.",
    );
  }
  if (!clientSecret || clientSecret === "replace-me") {
    throw new Error(
      "AZURE_AD_CLIENT_SECRET is not configured for Graph Teams access.",
    );
  }
  if (!tenantId || tenantId === "replace-me") {
    throw new Error(
      "AZURE_AD_TENANT_ID is not configured for Graph Teams access.",
    );
  }

  let tokenCache: TokenCache | null = null;

  async function getAccessToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
      return tokenCache.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: GRAPH_SCOPE,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Graph token request failed: ${response.status} ${details}`,
      );
    }

    const payload = (await response.json()) as GraphTokenResponse;
    if (!payload.access_token) {
      throw new Error("Graph token response did not include an access token.");
    }

    tokenCache = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };

    return payload.access_token;
  }

  async function graphRequest<T>(path: string, init?: RequestInit) {
    const accessToken = await getAccessToken();
    const response = await fetchImpl(`${GRAPH_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `Graph Teams request failed: ${response.status} ${details}`,
      );
    }

    if (response.status === 202 || response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    async sendChannelMessage(input: TeamsMessageInput) {
      const content = input.content.trim();
      if (!content) {
        throw new Error("Teams message content is required.");
      }

      const contentType = input.contentType === "text" ? "text" : "html";
      const payload = await graphRequest<GraphChatMessage>(
        `/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body: {
              contentType: contentType === "text" ? "text" : "html",
              content,
            },
          }),
        },
      );

      return {
        messageId: payload?.id ?? null,
      };
    },
    async listChannelMessages(input: TeamsMessageListInput) {
      const top = Math.min(Math.max(input.top ?? 25, 1), MAX_TOP);
      const query = new URLSearchParams({
        $top: String(top),
      });
      const payload = await graphRequest<GraphMessageListResponse>(
        `/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages?${query.toString()}`,
      );

      return mapMessages(payload.value ?? [], input.teamId, input.channelId);
    },
    async getChannelMessagesDelta(
      input: TeamsMessageDeltaInput,
    ): Promise<TeamsMessageDeltaResult> {
      const top = Math.min(Math.max(input.top ?? 25, 1), MAX_TOP);
      const path = input.deltaToken?.trim()
        ? decodeDeltaPath(input.deltaToken.trim())
        : `/teams/${encodeURIComponent(input.teamId)}/channels/${encodeURIComponent(input.channelId)}/messages/delta?$top=${top}`;

      const payload = await graphRequest<GraphMessageListResponse>(path);

      return {
        messages: mapMessages(
          payload.value ?? [],
          input.teamId,
          input.channelId,
        ),
        deltaToken:
          payload["@odata.deltaLink"] ?? payload["@odata.nextLink"] ?? null,
      };
    },
  };
}

function mapMessages(
  messages: GraphChatMessage[],
  teamId: string,
  channelId: string,
): TeamsChannelMessage[] {
  return messages
    .filter(
      (message): message is GraphChatMessage & { id: string } =>
        typeof message.id === "string",
    )
    .map((message) => ({
      id: message.id!,
      teamId,
      channelId,
      content: message.body?.content ?? "",
      contentType:
        message.body?.contentType?.toLowerCase() === "text" ? "text" : "html",
      createdAt: message.createdDateTime ?? null,
      senderDisplayName:
        message.from?.user?.displayName ??
        message.from?.application?.displayName ??
        null,
      senderUserId:
        message.from?.user?.id ?? message.from?.application?.id ?? null,
    }));
}

function decodeDeltaPath(deltaToken: string) {
  if (deltaToken.startsWith("https://graph.microsoft.com/v1.0")) {
    return deltaToken.replace("https://graph.microsoft.com/v1.0", "");
  }

  if (deltaToken.startsWith("/")) {
    return deltaToken;
  }

  return `/${deltaToken}`;
}
