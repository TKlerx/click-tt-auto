import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { prismaMock } from "@/lib/__mocks__/db";
import { Role, UserStatus } from "../../generated/prisma/enums";

const {
  requireApiUser,
  saveFile,
  getFilePath,
  importRasterRoster,
  replaceRasterSource,
  upsertRasterSource,
  parseUpperLeagueRasterPdf,
} = vi.hoisted(() => ({
    requireApiUser: vi.fn(),
    saveFile: vi.fn(),
    getFilePath: vi.fn((value: string) => `D:/storage/${value}`),
    importRasterRoster: vi.fn(),
    replaceRasterSource: vi.fn(),
    upsertRasterSource: vi.fn(),
    parseUpperLeagueRasterPdf: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/route-auth", () => ({
  requireApiUser,
}));

vi.mock("@/lib/file-storage", () => ({
  saveFile,
  getFilePath,
}));

vi.mock("@/lib/raster/pipeline", () => ({
  rasterIngest: {
    parseUpperLeagueRasterPdf,
    parseRosterCsvBytes: vi.fn(),
  },
}));

vi.mock("@/services/raster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/raster")>()),
  importRasterRoster,
  replaceRasterSource,
  upsertRasterSource,
}));

import { POST } from "@/app/api/raster/sources/upload/route";

describe("raster source upload route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves uploaded files as scoped raster sources", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({
      id: "wttv",
      code: "WTTV",
      name: "Westdeutscher Tischtennis-Verband",
    } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);
    saveFile.mockResolvedValue("uploads/2026/07/source.pdf");
    upsertRasterSource.mockResolvedValue({ id: "source-1" });

    const formData = new FormData();
    formData.set("scopeCode", "WTTV");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "WISHES_PDF");
    formData.set("displayName", "WTTV wishes");
    formData.set("file", new File(["%PDF-1.4"], "wishes.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    expect(saveFile).toHaveBeenCalledWith(expect.any(Buffer), "wishes.pdf");
    expect(upsertRasterSource).toHaveBeenCalledWith({
      scopeId: "wttv",
      inputSetId: "input-1",
      season: "2026/27",
      sourceType: "WISHES_PDF",
      sourceRef: "uploads/2026/07/source.pdf",
      displayName: "WTTV wishes",
    });
  });

  it("saves multiple uploaded files as separate sources", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({
      id: "owl",
      code: "OWL",
      name: "Ostwestfalen/Lippe",
    } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);
    saveFile
      .mockResolvedValueOnce("uploads/2026/07/wishes-a.pdf")
      .mockResolvedValueOnce("uploads/2026/07/wishes-b.pdf");
    upsertRasterSource
      .mockResolvedValueOnce({ id: "source-a" })
      .mockResolvedValueOnce({ id: "source-b" });

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "WISHES_PDF");
    formData.append("file", new File(["%PDF-1.4 a"], "wishes-a.pdf"));
    formData.append("file", new File(["%PDF-1.4 b"], "wishes-b.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );
    const body = (await response.json()) as { sources: unknown[] };

    expect(response.status).toBe(201);
    expect(body.sources).toHaveLength(2);
    expect(saveFile).toHaveBeenCalledTimes(2);
    expect(upsertRasterSource).toHaveBeenNthCalledWith(1, {
      scopeId: "owl",
      inputSetId: "input-1",
      season: "2026/27",
      sourceType: "WISHES_PDF",
      sourceRef: "uploads/2026/07/wishes-a.pdf",
      displayName: "wishes-a.pdf",
    });
    expect(upsertRasterSource).toHaveBeenNthCalledWith(2, {
      scopeId: "owl",
      inputSetId: "input-1",
      season: "2026/27",
      sourceType: "WISHES_PDF",
      sourceRef: "uploads/2026/07/wishes-b.pdf",
      displayName: "wishes-b.pdf",
    });
  });

  it("rejects wish PDF uploads that are not PDFs", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "admin-1",
        role: Role.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({
      id: "owl",
      code: "OWL",
      name: "Ostwestfalen/Lippe",
    } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "WISHES_PDF");
    formData.set("file", new File(["not a pdf"], "wishes.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(422);
    expect(saveFile).not.toHaveBeenCalled();
    expect(upsertRasterSource).not.toHaveBeenCalled();
  });

  it("rejects upper-league raster uploads that are not PDFs", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "scheduler-1",
        role: Role.SCOPE_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst.mockResolvedValue({
      id: "owl",
      code: "OWL",
      name: "Ostwestfalen/Lippe",
    } as never);

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("sourceType", "UPPER_LEAGUE_RASTER");
    formData.set("file", new File(["not a pdf"], "gruppen.txt"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(422);
    expect(saveFile).not.toHaveBeenCalled();
    expect(parseUpperLeagueRasterPdf).not.toHaveBeenCalled();
    expect(replaceRasterSource).not.toHaveBeenCalled();
  });

  it("imports an upper-league raster PDF as a replacing parsed source", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "scheduler-1",
        role: Role.SCOPE_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst
      .mockResolvedValueOnce({ id: "owl" } as never)
      .mockResolvedValueOnce({
        id: "owl",
        code: "OWL",
        name: "Ostwestfalen/Lippe",
      } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);
    saveFile.mockResolvedValue("uploads/gruppen.pdf");
    parseUpperLeagueRasterPdf.mockResolvedValue({
      sourceLabel: "gruppen.pdf",
      leagues: [{ league: "Verbandsliga 1 Erwachsene", size: 11, entries: [] }],
    });
    replaceRasterSource.mockResolvedValue({ id: "upper-source" });

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "UPPER_LEAGUE_RASTER");
    formData.set("file", new File(["%PDF-1.4"], "gruppen.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    expect(parseUpperLeagueRasterPdf).toHaveBeenCalledWith(
      "D:/storage/uploads/gruppen.pdf",
    );
    expect(replaceRasterSource).toHaveBeenCalledWith({
      scopeId: "owl",
      inputSetId: "input-1",
      season: "2026/27",
      sourceType: "UPPER_LEAGUE_RASTER",
      sourceRef: "uploads/gruppen.pdf",
      displayName: "gruppen.pdf",
      parsedJson: JSON.stringify({
        sourceLabel: "gruppen.pdf",
        leagues: [
          { league: "Verbandsliga 1 Erwachsene", size: 11, entries: [] },
        ],
      }),
    });
  });

  it("rejects malformed upper-league raster PDFs without recording a source", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "scheduler-1",
        role: Role.SCOPE_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst
      .mockResolvedValueOnce({ id: "owl" } as never)
      .mockResolvedValueOnce({
        id: "owl",
        code: "OWL",
        name: "Ostwestfalen/Lippe",
      } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);
    saveFile.mockResolvedValue("uploads/gruppen.pdf");
    parseUpperLeagueRasterPdf.mockRejectedValue(new Error("no readable entries"));

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "UPPER_LEAGUE_RASTER");
    formData.set("file", new File(["%PDF-1.4"], "gruppen.pdf"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(422);
    expect(replaceRasterSource).not.toHaveBeenCalled();
  });

  it("imports a roster CSV before recording the source", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "scheduler-1",
        role: Role.SCOPE_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst
      .mockResolvedValueOnce({ id: "owl" } as never)
      .mockResolvedValueOnce({
        id: "owl",
        code: "OWL",
        name: "Ostwestfalen/Lippe",
      } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);
    importRasterRoster.mockResolvedValue({
      rosterId: "roster-1",
      teams: 1,
      clubs: 1,
      groups: 1,
      charset: "utf-8",
    });
    saveFile.mockResolvedValue("uploads/2026/07/roster.csv");
    upsertRasterSource.mockResolvedValue({ id: "source-1" });

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "ROSTER_CSV");
    formData.set(
      "file",
      new File(
        [
          [
            "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr",
            "Ostwestfalen/Lippe;2026/27;Liga;Gruppe;1;Club;Erwachsene;1",
          ].join("\n"),
        ],
        "roster.csv",
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    expect(importRasterRoster).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: "owl",
        scopeCode: "OWL",
        scopeName: "Ostwestfalen/Lippe",
        importedById: "scheduler-1",
      }),
    );
    expect(upsertRasterSource).toHaveBeenCalledWith({
      scopeId: "owl",
      inputSetId: "input-1",
      season: "2026/27",
      sourceType: "ROSTER_CSV",
      sourceRef: "uploads/2026/07/roster.csv",
      displayName: "roster.csv",
      parsedJson: JSON.stringify({
        rosterId: "roster-1",
        teams: 1,
        clubs: 1,
        groups: 1,
        charset: "utf-8",
      }),
    });
  });

  it("imports a complete raster bundle", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "scheduler-1",
        role: Role.SCOPE_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst
      .mockResolvedValueOnce({ id: "owl" } as never)
      .mockResolvedValueOnce({
        id: "owl",
        code: "OWL",
        name: "Ostwestfalen/Lippe",
      } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);
    importRasterRoster.mockResolvedValue({
      rosterId: "roster-1",
      teams: 1,
      clubs: 1,
      groups: 1,
      charset: "utf-8",
    });
    saveFile
      .mockResolvedValueOnce("uploads/roster.csv")
      .mockResolvedValueOnce("uploads/wishes.pdf");
    upsertRasterSource
      .mockResolvedValueOnce({ id: "roster-source" })
      .mockResolvedValueOnce({ id: "wish-source" });
    const csv = [
      "Region;Saison;Liga;Gruppe;VereinNr;VereinName;Altersklasse;MannschaftNr",
      "Ostwestfalen/Lippe;2026/27;Liga;Gruppe;1;Club;Erwachsene;1",
    ].join("\n");
    const bundle = zipSync({
      "roster.csv": new TextEncoder().encode(csv),
      "wishes.pdf": new TextEncoder().encode("%PDF-1.4"),
    });

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "RASTER_BUNDLE");
    formData.set("file", new File([bundle], "bundle.zip"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );
    const body = (await response.json()) as { sources: unknown[] };

    expect(response.status).toBe(201);
    expect(body.sources).toHaveLength(2);
    expect(upsertRasterSource).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceType: "WISHES_PDF" }),
    );
  });

  it("rejects incomplete raster bundles without saving files", async () => {
    requireApiUser.mockResolvedValue({
      user: {
        id: "scheduler-1",
        role: Role.SCOPE_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    prismaMock.scope.findFirst
      .mockResolvedValueOnce({ id: "owl" } as never)
      .mockResolvedValueOnce({
        id: "owl",
        code: "OWL",
        name: "Ostwestfalen/Lippe",
      } as never);
    prismaMock.rasterInputSet.findFirst.mockResolvedValue({
      id: "input-1",
    } as never);
    const bundle = zipSync({
      "wishes.pdf": new TextEncoder().encode("%PDF-1.4"),
    });

    const formData = new FormData();
    formData.set("scopeCode", "OWL");
    formData.set("inputSetId", "input-1");
    formData.set("sourceType", "RASTER_BUNDLE");
    formData.set("file", new File([bundle], "bundle.zip"));

    const response = await POST(
      new Request("http://localhost/api/raster/sources/upload", {
        method: "POST",
        body: formData,
      }),
    );
    const body = (await response.json()) as { missing: string[] };

    expect(response.status).toBe(422);
    expect(body.missing).toContain("roster CSV");
    expect(saveFile).not.toHaveBeenCalled();
    expect(upsertRasterSource).not.toHaveBeenCalled();
  });
});
