export type TeamsMessageContentType = "text" | "html";

export type TeamsMessageInput = {
  teamId: string;
  channelId: string;
  content: string;
  contentType?: TeamsMessageContentType;
};

export type TeamsChannelMessage = {
  id: string;
  teamId: string;
  channelId: string;
  content: string;
  contentType: TeamsMessageContentType;
  createdAt: string | null;
  senderDisplayName: string | null;
  senderUserId: string | null;
};

export type TeamsMessageListInput = {
  teamId: string;
  channelId: string;
  top?: number;
};

export type TeamsMessageDeltaInput = {
  teamId: string;
  channelId: string;
  deltaToken?: string | null;
  top?: number;
};

export type TeamsMessageDeltaResult = {
  messages: TeamsChannelMessage[];
  deltaToken: string | null;
};

export interface TeamsClient {
  sendChannelMessage(
    input: TeamsMessageInput,
  ): Promise<{ messageId: string | null }>;
  listChannelMessages(
    input: TeamsMessageListInput,
  ): Promise<TeamsChannelMessage[]>;
  getChannelMessagesDelta(
    input: TeamsMessageDeltaInput,
  ): Promise<TeamsMessageDeltaResult>;
}
