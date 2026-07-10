# Observability Smoke Checklist

Use after applying a throwaway environment for spec `018-opentofu-azure-infra`.
The goal is to prove app logs, worker logs, migration job output, and revision
health can be queried from Log Analytics without exec-ing into containers
(SC-006).

## Setup

- [ ] Run the Azure deploy workflow or apply the OpenTofu environment.
- [ ] Trigger one app request against `app_endpoint`.
- [ ] Let the worker run at least one polling interval.
- [ ] Trigger the migration Container Apps Job once through the deploy workflow.
- [ ] Open the workspace from `log_analytics_workspace_id`.

## Queries

- [ ] App logs are present within 5 minutes:

  ```kusto
  union isfuzzy=true ContainerAppConsoleLogs, ContainerAppConsoleLogs_CL
  | where TimeGenerated > ago(5m)
  | where ContainerAppName endswith "-app"
  | take 20
  ```

- [ ] Worker logs are present within 5 minutes:

  ```kusto
  union isfuzzy=true ContainerAppConsoleLogs, ContainerAppConsoleLogs_CL
  | where TimeGenerated > ago(5m)
  | where ContainerAppName endswith "-worker"
  | take 20
  ```

- [ ] Migration job output/result is present:

  ```kusto
  union isfuzzy=true ContainerAppConsoleLogs, ContainerAppConsoleLogs_CL
  | where TimeGenerated > ago(30m)
  | where JobName endswith "-migration" or ContainerAppName endswith "-migration"
  | take 20
  ```

- [ ] App/worker revision or replica health metrics are queryable:

  ```kusto
  AzureMetrics
  | where TimeGenerated > ago(30m)
  | where ResourceProvider == "MICROSOFT.APP"
  | where Resource endswith "-app" or Resource endswith "-worker"
  | summarize LastSeen=max(TimeGenerated) by Resource, MetricName
  ```

## Pass Criteria

- [ ] Each query returns relevant rows for the deployed environment.
- [ ] Logs and metrics are visible within 5 minutes of the triggering action.
- [ ] No container shell access is required to diagnose app, worker, or migration
      activity.
