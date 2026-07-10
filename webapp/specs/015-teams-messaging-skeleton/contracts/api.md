# API Contracts: Teams Messaging Skeleton

All endpoints require `PLATFORM_ADMIN` role. Base path: `/api/integrations/teams`

## GET /api/integrations/teams

Returns integration config + computed health metrics.

**Response 200**:

```json
{
  "sendEnabled": false,
  "intakeEnabled": false,
  "updatedAt": "2026-04-26T10:00:00Z",
  "health": {
    "lastSuccessfulSend": "2026-04-26T09:55:00Z",
    "lastSuccessfulIntake": "2026-04-26T09:50:00Z",
    "recentSendFailures": 0,
    "recentIntakeFailures": 0
  }
}
```

## PUT /api/integrations/teams

Update integration toggles.

**Request**:

```json
{
  "sendEnabled": true,
  "intakeEnabled": false
}
```

**Response 200**: Updated config (same shape as GET).

## GET /api/integrations/teams/targets

List delivery targets.

**Response 200**:

```json
{
  "targets": [
    {
      "id": "cuid",
      "name": "Engineering Alerts",
      "teamId": "graph-team-id",
      "channelId": "graph-channel-id",
      "teamName": "Engineering",
      "channelName": "Alerts",
      "active": true,
      "createdAt": "2026-04-26T10:00:00Z"
    }
  ]
}
```

## POST /api/integrations/teams/targets

Create delivery target.

**Request**:

```json
{
  "name": "Engineering Alerts",
  "teamId": "graph-team-id",
  "channelId": "graph-channel-id",
  "teamName": "Engineering",
  "channelName": "Alerts"
}
```

**Response 201**: Created target object.

**Error 409**: Target for this team+channel already exists.

## PUT /api/integrations/teams/targets/:id

Update target (name, active status).

**Request**:

```json
{
  "name": "Updated Name",
  "active": false
}
```

**Response 200**: Updated target object.

## DELETE /api/integrations/teams/targets/:id

Delete target. Fails if target has pending outbound messages.

**Response 204**: Deleted.
**Error 409**: Target has pending messages.

## GET /api/integrations/teams/subscriptions

List intake subscriptions.

**Response 200**:

```json
{
  "subscriptions": [
    {
      "id": "cuid",
      "teamId": "graph-team-id",
      "channelId": "graph-channel-id",
      "teamName": "Engineering",
      "channelName": "General",
      "active": true,
      "lastPolledAt": "2026-04-26T09:50:00Z",
      "createdAt": "2026-04-26T10:00:00Z"
    }
  ]
}
```

## POST /api/integrations/teams/subscriptions

Create intake subscription.

**Request**:

```json
{
  "teamId": "graph-team-id",
  "channelId": "graph-channel-id",
  "teamName": "Engineering",
  "channelName": "General"
}
```

**Response 201**: Created subscription.
**Error 409**: Subscription for this team+channel already exists.

## PUT /api/integrations/teams/subscriptions/:id

Update subscription (active status).

**Request**:

```json
{
  "active": false
}
```

**Response 200**: Updated subscription.

## DELETE /api/integrations/teams/subscriptions/:id

Delete subscription. Inbound messages are retained.

**Response 204**: Deleted.

## GET /api/integrations/teams/status

Recent activity log for admin dashboard.

**Query params**: `?limit=20&type=send|intake|all`

**Response 200**:

```json
{
  "recentActivity": [
    {
      "type": "send",
      "targetName": "Engineering Alerts",
      "eventType": "USER_CREATED",
      "status": "SENT",
      "timestamp": "2026-04-26T09:55:00Z",
      "error": null
    },
    {
      "type": "intake",
      "subscriptionName": "Engineering / General",
      "messagesIngested": 3,
      "timestamp": "2026-04-26T09:50:00Z",
      "error": null
    }
  ]
}
```
