import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Role } from "../../generated/prisma/enums";
import {
  appBasePath,
  expectOnDashboard,
  loginWithPassword,
} from "./helpers/auth";
import {
  assignUserToScope,
  seedRasterProjectionFixture,
  seedLocalUser,
  seedRasterScopeHierarchy,
  seedRasterSource,
} from "./helpers/db";

const scopeCode = "OWL";
const season = "2026/27";
const scope = { code: scopeCode, name: "Ostwestfalen-Lippe" };
const rasterQuery = `scope=${scopeCode}&season=${encodeURIComponent(season)}`;

test("OWL raster page shows inherited WTTV sources without refreshing them on reload", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-raster-source-${suffix}@example.com`;
  const password = "RasterSource123";
  const sourceName = `E2E WTTV assignment ${suffix}`;

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Source Viewer",
    role: Role.SCOPE_USER,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);
  await seedRasterSource({
    scopeCode: "WTTV",
    sourceType: "GROUP_ASSIGNMENT",
    sourceRef: `e2e://wttv-assignment-${suffix}`,
    displayName: sourceName,
    contentHash: `hash-${suffix}`,
    parsedJson: { groups: [] },
  });

  const refreshRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/raster/sources/") && url.endsWith("/refresh")) {
      refreshRequests.push(url);
    }
  });

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  await page.goto(`${appBasePath}/raster/import?${rasterQuery}`);
  await expect(page.getByText(sourceName)).toBeVisible();
  expect(refreshRequests).toEqual([]);

  await page.reload();
  await expect(page.getByText(sourceName)).toBeVisible();
  expect(refreshRequests).toEqual([]);
});

test("admin can generate and review a raster snapshot", async ({ page }) => {
  const suffix = Date.now();
  const email = `e2e-raster-generate-${suffix}@example.com`;
  const password = "RasterGenerate123";

  await seedLocalUser({
    email,
    name: "E2E Raster Generator",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });
  await assignUserToScope(email, scope);

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  const inputSetResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets`,
    {
      data: { scope: scopeCode, season, name: `E2E generated ${suffix}` },
    },
  );
  expect(inputSetResponse.status()).toBe(201);
  const inputSetBody = (await inputSetResponse.json()) as {
    inputSet: { id: string };
  };
  const inputSetId = inputSetBody.inputSet.id;
  const model = buildSeasonModel();

  const modelResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSetId}/season-model`,
    { data: model },
  );
  expect(modelResponse.status()).toBe(200);

  const wishesResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSetId}/wishes/json`,
    {
      data: {
        wishes: [
          {
            clubId: model.clubs[0].id,
            clubName: model.clubs[0].name,
            teamLabel: "I",
            homeWeekday: "FRIDAY",
            hall: "1",
            spielwochePref: "A",
          },
        ],
      },
    },
  );
  expect(wishesResponse.status()).toBe(200);

  // Address the step directly: /raster redirects to whatever step readiness
  // picks, which depends on state other tests leave behind.
  await page.goto(`${appBasePath}/raster/review?${rasterQuery}`);
  await expect(
    page.getByText(`E2E generated ${suffix}`, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Recheck capacities" })
    .first()
    .click();
  await expect(page.getByText(/Inferred \d+; \d+ need review/)).toBeVisible();
  await page.getByRole("button", { name: "Mark all reviewed" }).click();
  await expect(page.getByText("Source matches (0 outstanding)")).toBeVisible();
  await page.getByRole("link", { name: /^Run optimizer/ }).click();
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText(/Validation passed/)).toBeVisible();
  await page.getByRole("button", { name: "Queue run" }).click();
  await expect(page.getByText(/Run queued/)).toBeVisible();

  const runListResponse = await page.request.get(
    `${appBasePath}/api/raster/input-sets?${rasterQuery}`,
  );
  expect(runListResponse.status()).toBe(200);
  const runList = (await runListResponse.json()) as {
    inputSets: Array<{ id: string; runs: Array<{ id: string }> }>;
  };
  const runBody = runList.inputSets
    .find((inputSet) => inputSet.id === inputSetId)
    ?.runs.at(0);
  expect(runBody?.id).toBeTruthy();

  processRasterWorkerJob(runBody!.id);

  const runStatusResponse = await page.request.get(
    `${appBasePath}/api/raster/runs/${runBody?.id}`,
  );
  expect(runStatusResponse.status()).toBe(200);
  const runStatus = (await runStatusResponse.json()) as {
    run: { status: string; outcome: string; snapshot: { id: string } | null };
  };
  expect(runStatus.run.status).toBe("SUCCEEDED");
  expect(runStatus.run.outcome).toBe("PROVEN_OPTIMAL");
  expect(runStatus.run.snapshot?.id).toBeTruthy();

  const snapshotId = runStatus.run.snapshot?.id;
  const assignmentsResponse = await page.request.get(
    `${appBasePath}/api/raster/snapshots/${snapshotId}/assignments`,
  );
  expect(assignmentsResponse.status()).toBe(200);
  const assignments = (await assignmentsResponse.json()) as {
    assignments: Array<{ rasterzahl: number }>;
  };
  expect(assignments.assignments).toHaveLength(10);
  expect(
    new Set(assignments.assignments.map((row) => row.rasterzahl)).size,
  ).toBe(10);

  const conflictsResponse = await page.request.get(
    `${appBasePath}/api/raster/snapshots/${snapshotId}/conflicts/summary`,
  );
  expect(conflictsResponse.status()).toBe(200);

  // Results moved to their own snapshot page in 005; there is no "Results" nav
  // link any more, so open the snapshot the run just produced.
  await page.goto(`${appBasePath}/raster/snapshots/${snapshotId}`);
  await expect(
    page.getByRole("heading", { name: "Raster results" }),
  ).toBeVisible();
  await expect(page.getByText("Assignments")).toBeVisible();
});

test("admin can use the guided source workflow", async ({ page }) => {
  const suffix = Date.now();
  const email = `e2e-raster-flow-${suffix}@example.com`;
  const password = "RasterFlow123";
  const urlName = `E2E click-TT groups ${suffix}`;
  const wishName = `wrong-${suffix}.pdf`;

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Flow Admin",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);
  await page.goto(`${appBasePath}/raster/import?${rasterQuery}`);

  await page.getByText("Advanced: register external source").click();
  await page
    .getByPlaceholder("Example: WTTV group assignment 2026")
    .last()
    .fill(urlName);
  await page
    .getByPlaceholder(
      "https://wttv.click-tt.de/.../leaguePage?championship=WTTV%2026/27",
    )
    .fill(
      "https://wttv.click-tt.de/cgi-bin/WebObjects/nuLigaTTDE.woa/wa/leaguePage?championship=WTTV%2026/27",
    );
  await page.getByRole("button", { name: "Save external source" }).click();
  await expect(page.getByText(urlName)).toBeVisible();
  await expect(page.getByText("Needs parse")).toBeVisible();

  await page.locator('input[name="file"][multiple]').setInputFiles([
    {
      name: wishName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% e2e"),
    },
  ]);
  await page.getByRole("button", { name: "Upload wish PDFs" }).click();
  await expect(page.getByText(wishName)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel(`Delete ${wishName}`).click();
  await expect(page.getByText(wishName)).not.toBeVisible();
});

test("source projection preserves team categories and parsed wishes", async () => {
  const suffix = Date.now().toString();
  const email = `e2e-raster-projection-${suffix}@example.com`;

  await seedRasterScopeHierarchy();
  await seedLocalUser({
    email,
    name: "E2E Raster Projection",
    role: Role.PLATFORM_ADMIN,
    password: "RasterProjection123",
    mustChangePassword: false,
  });

  const projection = await seedRasterProjectionFixture({ email, suffix });

  expect(projection.teamCount).toBe(7);
  expect(projection.uniqueClubLabelKeys).toBe(7);
  expect(projection.youthStartTime).toBe("10:00");
  expect(projection.adultWeekday).toBe("monday");
  expect(projection.defaultOnlyCount).toBe(3);
  expect(projection.relationalWishes).toBe(1);
});

test("admin can score and compare manual raster scenarios", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `e2e-raster-manual-${suffix}@example.com`;
  const password = "RasterManual123";

  await seedLocalUser({
    email,
    name: "E2E Raster Manual",
    role: Role.PLATFORM_ADMIN,
    password,
    mustChangePassword: false,
  });

  await loginWithPassword(page, email, password);
  await expectOnDashboard(page);

  const inputSetResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets`,
    {
      data: { scope: scopeCode, season, name: `E2E manual ${suffix}` },
    },
  );
  expect(inputSetResponse.status()).toBe(201);
  const inputSetBody = (await inputSetResponse.json()) as {
    inputSet: { id: string };
  };
  const inputSetId = inputSetBody.inputSet.id;
  const model = buildSeasonModel();

  const modelResponse = await page.request.post(
    `${appBasePath}/api/raster/input-sets/${inputSetId}/season-model`,
    { data: model },
  );
  expect(modelResponse.status()).toBe(200);

  const scenarioIds: string[] = [];
  for (const offset of [0, 1]) {
    const draftResponse = await page.request.post(
      `${appBasePath}/api/raster/input-sets/${inputSetId}/manual-assignments`,
      {
        data: {
          name: `Manual ${offset}`,
          rows: model.teams.map((team, index) => ({
            teamId: team.id,
            rasterzahl: ((index + offset) % model.teams.length) + 1,
          })),
        },
      },
    );
    expect(draftResponse.status()).toBe(201);
    const draftBody = (await draftResponse.json()) as {
      draft: { id: string };
    };
    const scoreResponse = await page.request.post(
      `${appBasePath}/api/raster/manual-assignments/${draftBody.draft.id}/score`,
    );
    const scoreBody = (await scoreResponse.json()) as {
      run?: { id: string };
      error?: string;
      issues?: unknown[];
    };
    expect(scoreResponse.status(), JSON.stringify(scoreBody, null, 2)).toBe(
      201,
    );
    expect(scoreBody.run).toBeDefined();
    scenarioIds.push(scoreBody.run!.id);
  }

  const compareResponse = await page.request.post(
    `${appBasePath}/api/raster/scenarios/compare`,
    {
      data: {
        scenarioIds,
        baselineScenarioId: scenarioIds[0],
      },
    },
  );
  expect(compareResponse.status()).toBe(200);
  const compareBody = (await compareResponse.json()) as {
    baselineScenarioId: string;
    scenarios: Array<{ origin: string; strategy: string }>;
  };
  expect(compareBody.baselineScenarioId).toBe(scenarioIds[0]);
  expect(compareBody.scenarios).toHaveLength(2);
  expect(
    compareBody.scenarios.every((scenario) => scenario.origin === "manual"),
  ).toBe(true);
});

function buildSeasonModel() {
  const clubs = Array.from({ length: 10 }, (_, index) => ({
    id: `club-${index + 1}`,
    name: `Club ${index + 1}`,
    venues: [{ hall: "1", name: "Hall 1", capacity: 1 }],
    notes: "",
  }));
  const teams = clubs.map((club, index) => ({
    id: `team-${index + 1}`,
    clubId: club.id,
    label: "I",
    homeWeekday: "friday",
    hall: "1",
    rasterzahl: { kind: "assignable" },
    confidence: "ok",
  }));
  return {
    clubs,
    teams,
    groups: [
      {
        ref: { league: "Bezirksoberliga", name: "Gruppe 1" },
        size: 10,
        teamIds: teams.map((team) => team.id),
      },
    ],
    wishes: [],
    absoluteConstraints: [],
    warnings: [],
  };
}

function processRasterWorkerJob(runId: string) {
  const workerDir = path.join(process.cwd(), "worker");
  const repoRoot = path.dirname(process.cwd());
  const databaseUrl =
    process.env.WORKER_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://starter:starter_e2e_password@localhost:45432/business_app_starter_e2e_test";
  execFileSync(
    "uv",
    [
      "run",
      "python",
      "-c",
      [
        "import os",
        "from starter_worker.config import WorkerConfig",
        "from starter_worker.db import JobStore",
        "from starter_worker.main import _process_claimed_job",
        "config = WorkerConfig(database_url=os.environ['DATABASE_URL'], poll_interval_seconds=0.1, worker_id='e2e-worker', max_attempts=1, retry_backoff_seconds=0, stale_lock_seconds=300, teams_poll_interval_seconds=60)",
        "store = JobStore(config)",
        `target_run_id = ${JSON.stringify(runId)}`,
        "processed = False",
        "for _ in range(20):",
        "    job = store.claim_next_job()",
        "    assert job is not None",
        "    _process_claimed_job(store, config, job)",
        "    if job.job_type == 'raster_run' and str(job.payload.get('runId') or '').strip() == target_run_id:",
        "        processed = True",
        "        break",
        "assert processed",
      ].join("\n"),
    ],
    {
      cwd: workerDir,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        RASTER_REPO_ROOT: repoRoot,
      },
      stdio: "pipe",
    },
  );
}
