import type { User } from "../../../generated/prisma/client";
import type { SessionUser } from "@/lib/auth";
import type {
  AuditAction,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";

export type RouteErrorResult = { error: Response };
export type RouteUserResult<TUser = SessionUser> =
  | RouteErrorResult
  | { user: TUser; request?: Request };

export type RouteParamsWithId = Promise<{ id: string }>;

export type ManagedUserContext = {
  user: User;
  actor: SessionUser;
};

export type ManagedUserResult = RouteErrorResult | ManagedUserContext;

export type AuthorizeRouteOptions = {
  roles?: Role[];
  scopeRestricted?: boolean;
  scopeId?: string | null;
  resolveScopeId?:
    | ((request: Request) => Promise<string | null> | string | null)
    | null;
};

export type ManagedUserStatusUpdateOptions = {
  requireCurrentStatus?: UserStatus;
  blockedMessage?: string;
  lastAdminMessage?: string;
  afterUpdate?: (context: {
    actorId: string;
    userId: string;
    previousStatus: UserStatus;
    nextStatus: UserStatus;
  }) => Promise<void>;
};

export type AuditFilters = {
  action?: AuditAction | null;
  entityType?: string | null;
  scopeId?: string | null;
  actorId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  page?: number;
  limit?: number;
};
