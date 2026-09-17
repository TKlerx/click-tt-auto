import "dotenv/config";
import minimist from "minimist";
import { parseGameCodeDirectory, upsertSpondCodeBlock, type GameCodeEntry } from "./codes.js";

const API = "https://api.spond.com/core/v1/";

type SpondEvent = {
  id: string;
  heading?: string;
  description?: string;
  startTimestamp?: string;
  endTimestamp?: string;
  commentsDisabled?: boolean;
  maxAccepted?: number;
  rsvpDate?: string | null;
  location?: unknown;
  owners?: unknown;
  visibility?: string;
  participantsHidden?: boolean;
  autoReminderType?: string;
  autoAccept?: boolean;
  payment?: unknown;
  attachments?: unknown;
  tasks?: unknown;
  [key: string]: unknown;
};

type EventMatch = { event: SpondEvent; moved: boolean };

const EVENT_DEFAULTS = {
  spondType: "EVENT",
  commentsDisabled: false,
  maxAccepted: 0,
  location: { id: null, feature: null, address: null, latitude: null, longitude: null },
  owners: [{ id: null }],
  visibility: "INVITEES",
  participantsHidden: false,
  autoReminderType: "DISABLED",
  autoAccept: false,
  payment: {},
  attachments: [],
  tasks: { openTasks: [], assignedTasks: [] },
};

async function getToken(argv: minimist.ParsedArgs): Promise<string | null> {
  if (typeof argv.token === "string") return argv.token;
  if (process.env.SPOND_TOKEN) return process.env.SPOND_TOKEN;

  const email = typeof argv.email === "string" ? argv.email : process.env.SPOND_EMAIL;
  const password = typeof argv.password === "string" ? argv.password : process.env.SPOND_PASSWORD;
  if (!email || !password) return null;

  const response = await fetch(`${API}auth2/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await response.json()) as { accessToken?: { token?: string } };
  return json.accessToken?.token ?? null;
}

async function getEvents(token: string, groupId?: string): Promise<SpondEvent[]> {
  const params = new URLSearchParams({ max: "1000", scheduled: "true" });
  if (groupId) params.set("groupId", groupId);

  const response = await fetch(`${API}sponds/?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Spond events request failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as SpondEvent[];
}

async function getSoleGroupId(token: string): Promise<string | undefined> {
  const response = await fetch(`${API}groups/`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) return undefined;
  const groups = (await response.json()) as Array<{ id?: string }>;
  return groups.length === 1 ? groups[0]?.id : undefined;
}

function sameLocalDate(timestamp: string | undefined, entry: GameCodeEntry): boolean {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return (
    date.getFullYear() === entry.start.getFullYear() &&
    date.getMonth() === entry.start.getMonth() &&
    date.getDate() === entry.start.getDate()
  );
}

function eventIncludesTeams(event: SpondEvent, entry: GameCodeEntry): boolean {
  const heading = (event.heading ?? "").replace(/\s+vs\.?\s+/i, " vs ").toLowerCase();
  return heading.includes(`${entry.homeTeam.toLowerCase()} vs ${entry.guestTeam.toLowerCase()}`);
}

function findEvent(events: SpondEvent[], entry: GameCodeEntry, moveMismatched: boolean): EventMatch | null {
  const opponent = entry.opponent.toLowerCase();
  const matches = events.filter((event) => sameLocalDate(event.startTimestamp, entry) && (event.heading ?? "").toLowerCase().includes(opponent));
  if (matches.length === 1) return { event: matches[0]!, moved: false };

  if (!moveMismatched) return null;

  const movedMatches = events.filter((event) => eventIncludesTeams(event, entry));
  return movedMatches.length === 1 ? { event: movedMatches[0]!, moved: true } : null;
}

function moveTimestamp(timestamp: string | undefined, entry: GameCodeEntry): string | undefined {
  if (!timestamp) return undefined;
  const original = new Date(timestamp);
  const moved = new Date(entry.start);
  moved.setHours(original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds());
  return moved.toISOString();
}

async function updateEvent(token: string, event: SpondEvent, entry: GameCodeEntry, moved = false): Promise<void> {
  const body = {
    heading: event.heading,
    description: upsertSpondCodeBlock(event.description, entry),
    startTimestamp: moved ? entry.start.toISOString() : event.startTimestamp,
    endTimestamp: moved ? moveTimestamp(event.endTimestamp, entry) : event.endTimestamp,
    commentsDisabled: event.commentsDisabled ?? EVENT_DEFAULTS.commentsDisabled,
    maxAccepted: event.maxAccepted ?? EVENT_DEFAULTS.maxAccepted,
    rsvpDate: event.rsvpDate ?? null,
    location: event.location ?? EVENT_DEFAULTS.location,
    owners: event.owners ?? EVENT_DEFAULTS.owners,
    visibility: event.visibility ?? EVENT_DEFAULTS.visibility,
    participantsHidden: event.participantsHidden ?? EVENT_DEFAULTS.participantsHidden,
    autoReminderType: event.autoReminderType ?? EVENT_DEFAULTS.autoReminderType,
    autoAccept: event.autoAccept ?? EVENT_DEFAULTS.autoAccept,
    payment: event.payment ?? EVENT_DEFAULTS.payment,
    attachments: event.attachments ?? EVENT_DEFAULTS.attachments,
    id: event.id,
    spondType: EVENT_DEFAULTS.spondType,
    tasks: event.tasks ?? EVENT_DEFAULTS.tasks,
  };
  const response = await fetch(`${API}sponds/${encodeURIComponent(event.id)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Spond update failed for ${event.id}: ${response.status} ${await response.text()}`);
}

async function run(): Promise<void> {
  const argv = minimist(process.argv.slice(2).filter((arg) => arg !== "--"), {
    boolean: ["apply", "json", "move-mismatched"],
    string: ["codes-dir", "club", "group-id", "token", "email", "password"],
    default: { "codes-dir": "codes", club: "TTC Paderborn" },
  });

  const entries = await parseGameCodeDirectory(String(argv["codes-dir"]), String(argv.club));
  if (argv.json || !argv.apply) {
    console.log(JSON.stringify(entries, null, 2));
  }

  if (!argv.apply) {
    console.error(`Dry run: parsed ${entries.length} games. Use --apply with Spond credentials to update events.`);
    return;
  }

  const token = await getToken(argv);
  if (!token) throw new Error("Missing Spond credentials. Set SPOND_TOKEN or SPOND_EMAIL/SPOND_PASSWORD.");

  const groupId = typeof argv["group-id"] === "string" ? argv["group-id"] : await getSoleGroupId(token);
  const events = await getEvents(token, groupId);
  let updated = 0;
  for (const entry of entries) {
    const match = findEvent(events, entry, Boolean(argv["move-mismatched"]));
    if (!match) {
      console.error(`No unique Spond match: ${entry.date} ${entry.team} vs ${entry.opponent}`);
      continue;
    }
    await updateEvent(token, match.event, entry, match.moved);
    updated += 1;
  }

  console.log(`Updated ${updated}/${entries.length} Spond events.`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
