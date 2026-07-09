import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_PATH = path.resolve(
  process.cwd(),
  ".github/workflows/deploy-azure.yml",
);

function stepIndex(workflow: string, stepId: string) {
  const index = workflow.indexOf(`id: ${stepId}`);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("Azure deploy workflow contract", () => {
  it("uses OIDC and pinned actions without long-lived Azure credentials", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain(
      "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
    );
    expect(workflow).toContain(
      "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444",
    );
    expect(workflow).toContain(
      "opentofu/setup-opentofu@847eaa4afeb791b06daa46e8eafa8b1b68d7cfb4",
    );
    expect(workflow).toContain(
      "Azure/login@1384c340ab2dda50fed2bee3041d1d87018aa5e8",
    );
    expect(workflow).not.toContain("AZURE_CLIENT_SECRET");
    expect(workflow).not.toContain("client-secret");
  });

  it("declares required deploy inputs", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("environment:");
    expect(workflow).toContain("app_image_tag:");
    expect(workflow).toContain("worker_image_tag:");
    expect(workflow).toContain("migration_image_tag:");
    expect(workflow).toContain("options:");
    expect(workflow).toContain("- dev");
    expect(workflow).toContain("- staging");
    expect(workflow).toContain("- prod");
  });

  it("validates images before provisioning and migrates before promotion", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    const validate = stepIndex(workflow, "validate-inputs");
    const provision = stepIndex(workflow, "provision");
    const migrate = stepIndex(workflow, "migrate");
    const promote = stepIndex(workflow, "promote-app-worker");
    const smoke = stepIndex(workflow, "smoke");
    const report = stepIndex(workflow, "report");

    expect(validate).toBeLessThan(provision);
    expect(provision).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(promote);
    expect(promote).toBeLessThan(smoke);
    expect(smoke).toBeLessThan(report);
    expect(promote).toBeLessThan(report);
    expect(workflow).toContain("az acr repository show-tags");
    expect(workflow).toContain("az containerapp job start");
    expect(workflow).toContain("pnpm run smoke:azure");
  });

  it("exports non-secret build metadata before provisioning", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("Export build metadata");
    expect(workflow.indexOf("Export build metadata")).toBeLessThan(
      workflow.indexOf("id: provision"),
    );
    expect(workflow).toContain("TF_VAR_app_version=$app_version");
    expect(workflow).toContain("TF_VAR_app_revision=$GITHUB_SHA");
    expect(workflow).toContain(
      "TF_VAR_app_build_id=$GITHUB_RUN_ID.$GITHUB_RUN_ATTEMPT",
    );
    expect(workflow).toContain("TF_VAR_app_built_at=$(date -u");
  });

  it("blocks promotion when migration fails and reports non-promotion", () => {
    const workflow = fs.readFileSync(WORKFLOW_PATH, "utf8");

    expect(workflow).toContain("if: ${{ steps.migrate.outcome == 'success' }}");
    expect(workflow).toContain("Migration job failed");
    expect(workflow).toContain("Migration job timed out");
    expect(workflow).toContain("if: ${{ always() }}");
    expect(workflow).toContain("not-promoted");
  });
});
