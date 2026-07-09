import {
  createGraphMailClient,
  hasRealGraphMailConfig,
} from "@/lib/mail/graph";
import type { MailClient, MailProviderName } from "@/lib/mail/types";

type MailClientFactoryOptions = {
  provider?: MailProviderName;
};

export function getConfiguredMailProvider(): MailProviderName {
  const configured = (process.env.MAIL_PROVIDER ?? "graph")
    .trim()
    .toLowerCase();
  if (configured === "graph") {
    return "graph";
  }

  throw new Error(`Unsupported MAIL_PROVIDER "${configured}".`);
}

export function hasUsableMailConfig() {
  const provider = getConfiguredMailProvider();
  switch (provider) {
    case "graph":
      return hasRealGraphMailConfig();
    default:
      return false;
  }
}

export function createMailClient(
  options: MailClientFactoryOptions = {},
): MailClient {
  const provider = options.provider ?? getConfiguredMailProvider();

  switch (provider) {
    case "graph":
      return createGraphMailClient();
    default:
      throw new Error(
        `Unsupported mail provider "${provider satisfies never}".`,
      );
  }
}
