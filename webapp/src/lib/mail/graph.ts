import type {
  GetMailMessageInput,
  ListMailMessagesInput,
  MailAddress,
  MailBody,
  MailClient,
  MailMessage,
  MailMessageSummary,
  SendMailInput,
} from "@/lib/mail/types";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const DEFAULT_FOLDER = "inbox";
const DEFAULT_TOP = 25;
const MAX_TOP = 100;

type GraphMailClientOptions = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  defaultMailbox?: string;
  fetchImpl?: typeof fetch;
};

type GraphTokenResponse = {
  access_token: string;
  expires_in?: number;
};

type GraphEmailAddress = {
  address?: string;
  name?: string;
};

type GraphRecipient = {
  emailAddress?: GraphEmailAddress;
};

type GraphItemBody = {
  contentType?: string;
  content?: string;
};

type GraphMessage = {
  id: string;
  subject?: string;
  from?: GraphRecipient;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  bodyPreview?: string;
  conversationId?: string;
  internetMessageId?: string;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  replyTo?: GraphRecipient[];
  body?: GraphItemBody;
};

type GraphListMessagesResponse = {
  value?: GraphMessage[];
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

export function hasRealGraphMailConfig() {
  return Boolean(
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_TENANT_ID &&
    process.env.GRAPH_CLIENT_ID !== "replace-me" &&
    process.env.GRAPH_CLIENT_SECRET !== "replace-me" &&
    process.env.GRAPH_TENANT_ID !== "replace-me",
  );
}

export function createGraphMailClient(
  options?: Partial<GraphMailClientOptions>,
): MailClient {
  const clientId = options?.clientId ?? process.env.GRAPH_CLIENT_ID ?? "";
  const clientSecret =
    options?.clientSecret ?? process.env.GRAPH_CLIENT_SECRET ?? "";
  const tenantId = options?.tenantId ?? process.env.GRAPH_TENANT_ID ?? "";
  const defaultMailbox =
    options?.defaultMailbox ?? process.env.MAIL_DEFAULT_MAILBOX ?? "";
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!clientId || clientId === "replace-me") {
    throw new Error("GRAPH_CLIENT_ID is not configured for Graph mail access.");
  }
  if (!clientSecret || clientSecret === "replace-me") {
    throw new Error(
      "GRAPH_CLIENT_SECRET is not configured for Graph mail access.",
    );
  }
  if (!tenantId || tenantId === "replace-me") {
    throw new Error("GRAPH_TENANT_ID is not configured for Graph mail access.");
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
        `Graph mail request failed: ${response.status} ${details}`,
      );
    }

    if (response.status === 202 || response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  function resolveMailbox(explicitMailbox?: string) {
    const mailbox = explicitMailbox?.trim() || defaultMailbox.trim();
    if (!mailbox) {
      throw new Error(
        "A mailbox address is required. Set MAIL_DEFAULT_MAILBOX or pass mailbox explicitly.",
      );
    }
    return mailbox;
  }

  return {
    provider: "graph",
    async listMessages(input: ListMailMessagesInput = {}) {
      const mailbox = resolveMailbox(input.mailbox);
      const folder = (input.folder ?? DEFAULT_FOLDER).trim() || DEFAULT_FOLDER;
      const top = Math.min(Math.max(input.top ?? DEFAULT_TOP, 1), MAX_TOP);
      const search = new URLSearchParams({
        $top: String(top),
        $orderby: "receivedDateTime DESC",
        $select:
          "id,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview,conversationId",
      });

      if (input.unreadOnly) {
        search.set("$filter", "isRead eq false");
      }

      const payload = await graphRequest<GraphListMessagesResponse>(
        `/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(folder)}/messages?${search.toString()}`,
      );

      return (payload.value ?? []).map(mapGraphSummary);
    },
    async getMessage(input: GetMailMessageInput) {
      const mailbox = resolveMailbox(input.mailbox);
      const search = new URLSearchParams({
        $select:
          "id,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview,conversationId,internetMessageId,toRecipients,ccRecipients,bccRecipients,replyTo,body",
      });

      const payload = await graphRequest<GraphMessage>(
        `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(input.messageId)}?${search.toString()}`,
      );

      return mapGraphMessage(payload);
    },
    async sendMessage(input: SendMailInput) {
      const mailbox = resolveMailbox(input.mailbox);
      const subject = input.subject.trim();
      if (!subject) {
        throw new Error("Mail subject is required.");
      }
      if (!input.body.content.trim()) {
        throw new Error("Mail body content is required.");
      }
      if (input.toRecipients.length === 0) {
        throw new Error("At least one to-recipient is required.");
      }

      await graphRequest<void>(
        `/users/${encodeURIComponent(mailbox)}/sendMail`,
        {
          method: "POST",
          body: JSON.stringify({
            message: {
              subject,
              body: mapMailBodyToGraph(input.body),
              toRecipients: mapRecipientsToGraph(input.toRecipients),
              ccRecipients: mapRecipientsToGraph(input.ccRecipients ?? []),
              bccRecipients: mapRecipientsToGraph(input.bccRecipients ?? []),
              replyTo: mapRecipientsToGraph(input.replyTo ?? []),
            },
            saveToSentItems: input.saveToSentItems ?? true,
          }),
        },
      );
    },
  };
}

function mapGraphSummary(message: GraphMessage): MailMessageSummary {
  return {
    id: message.id,
    subject: message.subject ?? "",
    from: mapGraphRecipient(message.from),
    receivedAt: message.receivedDateTime ?? null,
    isRead: Boolean(message.isRead),
    hasAttachments: Boolean(message.hasAttachments),
    bodyPreview: message.bodyPreview ?? "",
    conversationId: message.conversationId ?? null,
  };
}

function mapGraphMessage(message: GraphMessage): MailMessage {
  const summary = mapGraphSummary(message);

  return {
    ...summary,
    internetMessageId: message.internetMessageId ?? null,
    toRecipients: mapGraphRecipients(message.toRecipients),
    ccRecipients: mapGraphRecipients(message.ccRecipients),
    bccRecipients: mapGraphRecipients(message.bccRecipients),
    replyTo: mapGraphRecipients(message.replyTo),
    body: {
      contentType: normalizeGraphContentType(message.body?.contentType),
      content: message.body?.content ?? "",
    },
  };
}

function normalizeGraphContentType(value?: string): MailBody["contentType"] {
  return value?.toLowerCase() === "html" ? "html" : "text";
}

function mapGraphRecipient(recipient?: GraphRecipient): MailAddress | null {
  const emailAddress = recipient?.emailAddress;
  const email = emailAddress?.address?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const name = emailAddress?.name?.trim();
  return {
    email,
    name: name || null,
  };
}

function mapGraphRecipients(recipients?: GraphRecipient[]) {
  return (recipients ?? []).flatMap((recipient) => {
    const mapped = mapGraphRecipient(recipient);
    return mapped ? [mapped] : [];
  });
}

function mapRecipientsToGraph(recipients: MailAddress[]) {
  return recipients.map((recipient) => {
    const email = recipient.email.trim().toLowerCase();
    if (!email) {
      throw new Error("Recipient email addresses must not be empty.");
    }
    const name = recipient.name?.trim();

    return {
      emailAddress: {
        address: email,
        ...(name ? { name } : {}),
      },
    };
  });
}

function mapMailBodyToGraph(body: MailBody) {
  return {
    contentType: body.contentType === "html" ? "HTML" : "Text",
    content: body.content,
  };
}
