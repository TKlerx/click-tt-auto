export type MailProviderName = "graph";

export type MailAddress = {
  email: string;
  name?: string | null;
};

export type MailBodyContentType = "text" | "html";

export type MailBody = {
  contentType: MailBodyContentType;
  content: string;
};

export type MailMessageSummary = {
  id: string;
  subject: string;
  from: MailAddress | null;
  receivedAt: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  bodyPreview: string;
  conversationId: string | null;
};

export type MailMessage = MailMessageSummary & {
  internetMessageId: string | null;
  toRecipients: MailAddress[];
  ccRecipients: MailAddress[];
  bccRecipients: MailAddress[];
  replyTo: MailAddress[];
  body: MailBody;
};

export type ListMailMessagesInput = {
  mailbox?: string;
  folder?: string;
  top?: number;
  unreadOnly?: boolean;
};

export type GetMailMessageInput = {
  mailbox?: string;
  messageId: string;
};

export type SendMailInput = {
  mailbox?: string;
  subject: string;
  body: MailBody;
  toRecipients: MailAddress[];
  ccRecipients?: MailAddress[];
  bccRecipients?: MailAddress[];
  replyTo?: MailAddress[];
  saveToSentItems?: boolean;
};

export interface MailClient {
  readonly provider: MailProviderName;
  listMessages(input?: ListMailMessagesInput): Promise<MailMessageSummary[]>;
  getMessage(input: GetMailMessageInput): Promise<MailMessage>;
  sendMessage(input: SendMailInput): Promise<void>;
}
