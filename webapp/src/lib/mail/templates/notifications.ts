import { Role, UserStatus } from "../../../../generated/prisma/enums";

export type NotificationTemplateAudience = "affected_user" | "platform_admin";

export type NotificationTemplateKind =
  | "USER_CREATED"
  | "ROLE_CHANGED"
  | "USER_STATUS_CHANGED";

export type NotificationTemplateInput = {
  locale?: string | null;
  audience: NotificationTemplateAudience;
  kind: NotificationTemplateKind;
  userName: string;
  userEmail: string;
  role?: Role;
  previousRole?: Role;
  nextRole?: Role;
  previousStatus?: UserStatus;
  nextStatus?: UserStatus;
};

type NotificationTemplate = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

type NotificationCopy = {
  roleLabels: Record<Role, string>;
  statusLabels: Record<UserStatus, string>;
  userCreated: {
    affectedUserSubject: string;
    adminSubject: (userName: string) => string;
    affectedUserBody: (userName: string, roleLabel: string) => string;
    adminBody: (userName: string, email: string, roleLabel: string) => string;
  };
  roleChanged: {
    affectedUserSubject: string;
    adminSubject: (userName: string) => string;
    affectedUserBody: (userName: string, roleLabel: string) => string;
    adminBody: (
      userName: string,
      previousRole: string,
      nextRole: string,
    ) => string;
  };
  statusChanged: {
    affectedUserSubject: string;
    adminSubject: (userName: string) => string;
    affectedUserBody: (userName: string, statusLabel: string) => string;
    adminBody: (
      userName: string,
      previousStatus: string,
      nextStatus: string,
    ) => string;
  };
};

const COPY: Record<string, NotificationCopy> = {
  en: {
    roleLabels: {
      PLATFORM_ADMIN: "Platform Admin",
      SCOPE_ADMIN: "Scoped Admin",
      SCOPE_USER: "Scoped User",
    },
    statusLabels: {
      ACTIVE: "Active",
      INACTIVE: "Inactive",
      PENDING_APPROVAL: "Pending approval",
    },
    userCreated: {
      affectedUserSubject: "Your account is ready",
      adminSubject: (userName) => `New user created: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Hello ${userName},\n\nYour account has been created and is ready to use. Your current role is ${roleLabel}.\n\nYou can sign in with the credentials provided by your administrator.`,
      adminBody: (userName, email, roleLabel) =>
        `A new user account has been created.\n\nName: ${userName}\nEmail: ${email}\nRole: ${roleLabel}`,
    },
    roleChanged: {
      affectedUserSubject: "Your role has changed",
      adminSubject: (userName) => `User role changed: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Hello ${userName},\n\nYour role has been updated. Your new role is ${roleLabel}.`,
      adminBody: (userName, previousRole, nextRole) =>
        `A user's role was updated.\n\nUser: ${userName}\nPrevious role: ${previousRole}\nNew role: ${nextRole}`,
    },
    statusChanged: {
      affectedUserSubject: "Your account status has changed",
      adminSubject: (userName) => `User status changed: ${userName}`,
      affectedUserBody: (userName, statusLabel) =>
        `Hello ${userName},\n\nYour account status is now ${statusLabel}.`,
      adminBody: (userName, previousStatus, nextStatus) =>
        `A user's account status was updated.\n\nUser: ${userName}\nPrevious status: ${previousStatus}\nNew status: ${nextStatus}`,
    },
  },
  de: {
    roleLabels: {
      PLATFORM_ADMIN: "Plattform-Admin",
      SCOPE_ADMIN: "Bereichs-Admin",
      SCOPE_USER: "Bereichsbenutzer",
    },
    statusLabels: {
      ACTIVE: "Aktiv",
      INACTIVE: "Inaktiv",
      PENDING_APPROVAL: "Genehmigung ausstehend",
    },
    userCreated: {
      affectedUserSubject: "Ihr Konto ist bereit",
      adminSubject: (userName) => `Neuer Benutzer erstellt: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Hallo ${userName},\n\nIhr Konto wurde erstellt und ist einsatzbereit. Ihre aktuelle Rolle ist ${roleLabel}.\n\nSie konnen sich mit den Zugangsdaten Ihres Administrators anmelden.`,
      adminBody: (userName, email, roleLabel) =>
        `Ein neues Benutzerkonto wurde erstellt.\n\nName: ${userName}\nE-Mail: ${email}\nRolle: ${roleLabel}`,
    },
    roleChanged: {
      affectedUserSubject: "Ihre Rolle wurde geandert",
      adminSubject: (userName) => `Benutzerrolle geandert: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Hallo ${userName},\n\nIhre Rolle wurde aktualisiert. Ihre neue Rolle ist ${roleLabel}.`,
      adminBody: (userName, previousRole, nextRole) =>
        `Die Rolle eines Benutzers wurde aktualisiert.\n\nBenutzer: ${userName}\nVorherige Rolle: ${previousRole}\nNeue Rolle: ${nextRole}`,
    },
    statusChanged: {
      affectedUserSubject: "Ihr Kontostatus wurde geandert",
      adminSubject: (userName) => `Benutzerstatus geandert: ${userName}`,
      affectedUserBody: (userName, statusLabel) =>
        `Hallo ${userName},\n\nIhr Kontostatus ist jetzt ${statusLabel}.`,
      adminBody: (userName, previousStatus, nextStatus) =>
        `Der Kontostatus eines Benutzers wurde aktualisiert.\n\nBenutzer: ${userName}\nVorheriger Status: ${previousStatus}\nNeuer Status: ${nextStatus}`,
    },
  },
  es: {
    roleLabels: {
      PLATFORM_ADMIN: "Administrador de plataforma",
      SCOPE_ADMIN: "Administrador de ambito",
      SCOPE_USER: "Usuario de ambito",
    },
    statusLabels: {
      ACTIVE: "Activo",
      INACTIVE: "Inactivo",
      PENDING_APPROVAL: "Pendiente de aprobacion",
    },
    userCreated: {
      affectedUserSubject: "Tu cuenta esta lista",
      adminSubject: (userName) => `Nuevo usuario creado: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Hola ${userName},\n\nTu cuenta ha sido creada y ya esta lista para usarse. Tu rol actual es ${roleLabel}.\n\nPuedes iniciar sesion con las credenciales proporcionadas por tu administrador.`,
      adminBody: (userName, email, roleLabel) =>
        `Se ha creado una nueva cuenta de usuario.\n\nNombre: ${userName}\nCorreo: ${email}\nRol: ${roleLabel}`,
    },
    roleChanged: {
      affectedUserSubject: "Tu rol ha cambiado",
      adminSubject: (userName) => `Rol de usuario cambiado: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Hola ${userName},\n\nTu rol ha sido actualizado. Tu nuevo rol es ${roleLabel}.`,
      adminBody: (userName, previousRole, nextRole) =>
        `Se actualizo el rol de un usuario.\n\nUsuario: ${userName}\nRol anterior: ${previousRole}\nNuevo rol: ${nextRole}`,
    },
    statusChanged: {
      affectedUserSubject: "El estado de tu cuenta ha cambiado",
      adminSubject: (userName) => `Estado de usuario cambiado: ${userName}`,
      affectedUserBody: (userName, statusLabel) =>
        `Hola ${userName},\n\nEl estado de tu cuenta ahora es ${statusLabel}.`,
      adminBody: (userName, previousStatus, nextStatus) =>
        `Se actualizo el estado de la cuenta de un usuario.\n\nUsuario: ${userName}\nEstado anterior: ${previousStatus}\nNuevo estado: ${nextStatus}`,
    },
  },
  fr: {
    roleLabels: {
      PLATFORM_ADMIN: "Administrateur de la plateforme",
      SCOPE_ADMIN: "Administrateur de perimetre",
      SCOPE_USER: "Utilisateur de perimetre",
    },
    statusLabels: {
      ACTIVE: "Actif",
      INACTIVE: "Inactif",
      PENDING_APPROVAL: "En attente d'approbation",
    },
    userCreated: {
      affectedUserSubject: "Votre compte est pret",
      adminSubject: (userName) => `Nouvel utilisateur cree : ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Bonjour ${userName},\n\nVotre compte a ete cree et est pret a etre utilise. Votre role actuel est ${roleLabel}.\n\nVous pouvez vous connecter avec les identifiants fournis par votre administrateur.`,
      adminBody: (userName, email, roleLabel) =>
        `Un nouveau compte utilisateur a ete cree.\n\nNom : ${userName}\nE-mail : ${email}\nRole : ${roleLabel}`,
    },
    roleChanged: {
      affectedUserSubject: "Votre role a change",
      adminSubject: (userName) => `Role utilisateur modifie : ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Bonjour ${userName},\n\nVotre role a ete mis a jour. Votre nouveau role est ${roleLabel}.`,
      adminBody: (userName, previousRole, nextRole) =>
        `Le role d'un utilisateur a ete mis a jour.\n\nUtilisateur : ${userName}\nRole precedent : ${previousRole}\nNouveau role : ${nextRole}`,
    },
    statusChanged: {
      affectedUserSubject: "Le statut de votre compte a change",
      adminSubject: (userName) => `Statut utilisateur modifie : ${userName}`,
      affectedUserBody: (userName, statusLabel) =>
        `Bonjour ${userName},\n\nLe statut de votre compte est maintenant ${statusLabel}.`,
      adminBody: (userName, previousStatus, nextStatus) =>
        `Le statut du compte d'un utilisateur a ete mis a jour.\n\nUtilisateur : ${userName}\nStatut precedent : ${previousStatus}\nNouveau statut : ${nextStatus}`,
    },
  },
  pt: {
    roleLabels: {
      PLATFORM_ADMIN: "Administrador da plataforma",
      SCOPE_ADMIN: "Administrador de escopo",
      SCOPE_USER: "Usuario de escopo",
    },
    statusLabels: {
      ACTIVE: "Ativo",
      INACTIVE: "Inativo",
      PENDING_APPROVAL: "Aguardando aprovacao",
    },
    userCreated: {
      affectedUserSubject: "Sua conta esta pronta",
      adminSubject: (userName) => `Novo usuario criado: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Ola ${userName},\n\nSua conta foi criada e esta pronta para uso. Seu papel atual e ${roleLabel}.\n\nVoce pode entrar com as credenciais fornecidas pelo administrador.`,
      adminBody: (userName, email, roleLabel) =>
        `Uma nova conta de usuario foi criada.\n\nNome: ${userName}\nE-mail: ${email}\nPapel: ${roleLabel}`,
    },
    roleChanged: {
      affectedUserSubject: "Seu papel foi alterado",
      adminSubject: (userName) => `Papel de usuario alterado: ${userName}`,
      affectedUserBody: (userName, roleLabel) =>
        `Ola ${userName},\n\nSeu papel foi atualizado. Seu novo papel e ${roleLabel}.`,
      adminBody: (userName, previousRole, nextRole) =>
        `O papel de um usuario foi atualizado.\n\nUsuario: ${userName}\nPapel anterior: ${previousRole}\nNovo papel: ${nextRole}`,
    },
    statusChanged: {
      affectedUserSubject: "O status da sua conta foi alterado",
      adminSubject: (userName) => `Status de usuario alterado: ${userName}`,
      affectedUserBody: (userName, statusLabel) =>
        `Ola ${userName},\n\nO status da sua conta agora e ${statusLabel}.`,
      adminBody: (userName, previousStatus, nextStatus) =>
        `O status da conta de um usuario foi atualizado.\n\nUsuario: ${userName}\nStatus anterior: ${previousStatus}\nNovo status: ${nextStatus}`,
    },
  },
};

export function renderNotificationTemplate(
  input: NotificationTemplateInput,
): NotificationTemplate {
  const copy = getCopy(input.locale);

  switch (input.kind) {
    case "USER_CREATED":
      return renderUserCreatedTemplate(copy, input);
    case "ROLE_CHANGED":
      return renderRoleChangedTemplate(copy, input);
    case "USER_STATUS_CHANGED":
      return renderStatusChangedTemplate(copy, input);
  }
}

function renderUserCreatedTemplate(
  copy: NotificationCopy,
  input: NotificationTemplateInput,
): NotificationTemplate {
  const roleLabel = copy.roleLabels[input.role ?? Role.SCOPE_USER];

  if (input.audience === "affected_user") {
    const bodyText = copy.userCreated.affectedUserBody(
      input.userName,
      roleLabel,
    );
    return {
      subject: copy.userCreated.affectedUserSubject,
      bodyText,
      bodyHtml: "",
    };
  }

  const bodyText = copy.userCreated.adminBody(
    input.userName,
    input.userEmail,
    roleLabel,
  );
  return {
    subject: copy.userCreated.adminSubject(input.userName),
    bodyText,
    bodyHtml: "",
  };
}

function renderRoleChangedTemplate(
  copy: NotificationCopy,
  input: NotificationTemplateInput,
): NotificationTemplate {
  const nextRole =
    copy.roleLabels[input.nextRole ?? input.role ?? Role.SCOPE_USER];
  const previousRole = copy.roleLabels[input.previousRole ?? Role.SCOPE_USER];

  if (input.audience === "affected_user") {
    const bodyText = copy.roleChanged.affectedUserBody(
      input.userName,
      nextRole,
    );
    return {
      subject: copy.roleChanged.affectedUserSubject,
      bodyText,
      bodyHtml: "",
    };
  }

  const bodyText = copy.roleChanged.adminBody(
    input.userName,
    previousRole,
    nextRole,
  );
  return {
    subject: copy.roleChanged.adminSubject(input.userName),
    bodyText,
    bodyHtml: "",
  };
}

function renderStatusChangedTemplate(
  copy: NotificationCopy,
  input: NotificationTemplateInput,
): NotificationTemplate {
  const nextStatus = copy.statusLabels[input.nextStatus ?? UserStatus.ACTIVE];
  const previousStatus =
    copy.statusLabels[input.previousStatus ?? UserStatus.ACTIVE];

  if (input.audience === "affected_user") {
    const bodyText = copy.statusChanged.affectedUserBody(
      input.userName,
      nextStatus,
    );
    return {
      subject: copy.statusChanged.affectedUserSubject,
      bodyText,
      bodyHtml: "",
    };
  }

  const bodyText = copy.statusChanged.adminBody(
    input.userName,
    previousStatus,
    nextStatus,
  );
  return {
    subject: copy.statusChanged.adminSubject(input.userName),
    bodyText,
    bodyHtml: "",
  };
}

function getCopy(locale?: string | null) {
  const normalized = normalizeLocale(locale);
  return COPY[normalized] ?? COPY.en;
}

function normalizeLocale(locale?: string | null) {
  const value = locale?.trim().toLowerCase();
  if (!value) {
    return "en";
  }

  const base = value.split("-")[0];
  return base in COPY ? base : "en";
}
