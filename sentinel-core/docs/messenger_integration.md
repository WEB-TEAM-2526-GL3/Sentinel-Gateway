# Messenger Integration

## Role

Messenger integration handles inbound callbacks from Meta Messenger Platform.
It is separate from `WebhookService` outbound notifications.

- `GET /messenger/webhook` verifies the Meta callback URL.
- `POST /messenger/webhook` receives inbound Messenger events.
- `GET /messenger/events` lists received inbound events for local debugging.
- `GET /messenger/recipients` lists known PSIDs received from inbound events.

## Inbound Vs Outbound

`/messenger/webhook` is inbound:

```text
Meta Messenger -> Sentinel Gateway
```

It is used by Meta to verify the callback URL and deliver page messaging events.
It also lets the team discover a user's PSID from `sender.id`.

`/webhooks/emit` is outbound:

```text
Sentinel Gateway -> Slack / Discord / webhook.site / future Messenger provider
```

Other Sentinel modules should continue to use `/webhooks/emit` for outgoing
notifications. The Messenger inbound callback is not a replacement for it.

## Environment

Set the verify token before starting NestJS:

```bash
MESSENGER_VERIFY_TOKEN=sentinel_messenger_verify_token
```

There is no `.env.example` file in the repository currently. If one is added
later, include:

```bash
MESSENGER_VERIFY_TOKEN=sentinel_messenger_verify_token
```

Do not log or expose Messenger tokens. The verify token is only for callback
verification. Page access tokens are not implemented in this inbound module.

## Meta Configuration

1. Run the backend locally on port `3000`.
2. Expose it with ngrok:

```bash
ngrok http 3000
```

3. In Meta Developer Dashboard, configure:

```text
Callback URL: https://xxxx.ngrok-free.app/messenger/webhook
Verify Token: same value as MESSENGER_VERIFY_TOKEN
```

4. Subscribe to:

```text
messages
messaging_postbacks
```

## Verification Request

Meta calls:

```http
GET /messenger/webhook?hub.mode=subscribe&hub.verify_token=sentinel_messenger_verify_token&hub.challenge=123456
```

If the token matches `process.env.MESSENGER_VERIFY_TOKEN`, Sentinel returns
exactly:

```text
123456
```

The response is plain text, not JSON.

If the token is invalid, Sentinel returns `403`.

## Incoming Events

Meta sends events to:

```http
POST /messenger/webhook
Content-Type: application/json
```

Example:

```json
{
  "object": "page",
  "entry": [
    {
      "id": "PAGE_ID",
      "time": 1710000000000,
      "messaging": [
        {
          "sender": { "id": "PSID_USER_ID" },
          "recipient": { "id": "PAGE_ID" },
          "timestamp": 1710000000000,
          "message": {
            "mid": "m_123",
            "text": "hello"
          }
        }
      ]
    }
  ]
}
```

Sentinel stores, in memory:

```text
senderId
recipientId
messageText
postbackPayload
timestamp
receivedAt
raw event item
```

The POST response is:

```text
EVENT_RECEIVED
```

## Getting The PSID

1. Send `hello` to the connected Facebook Page.
2. Meta posts the event to `/messenger/webhook`.
3. Read the events:

```http
GET /messenger/events
```

or list recipients:

```http
GET /messenger/recipients
```

Example recipient:

```json
[
  {
    "senderId": "PSID_USER_ID",
    "lastMessageText": "hello",
    "lastSeenAt": "2026-05-26T10:00:01.000Z"
  }
]
```

Use `senderId` as the recipient PSID for future Messenger outbound work.

## Future Outbound Messenger Provider

The current change only implements inbound Meta verification and inbound event
storage. A future outbound Messenger provider in `WebhookService` should use the
PSID discovered here.

Target configuration shape for that future work:

```json
{
  "name": "Messenger Sentinel Alerts",
  "provider": "MESSENGER",
  "eventTypes": ["INCIDENT_CREATED"],
  "config": {
    "pageAccessToken": "PAGE_ACCESS_TOKEN",
    "recipientId": "PSID_USER_ID"
  }
}
```

Do not commit or log `pageAccessToken`.

## Limits

- Events are stored in memory only.
- Events are lost when the backend restarts.
- No database persistence yet.
- No Auth/JWT yet.
- Meta development mode only sends events for admins, developers and testers.
- Page access token sending is not implemented here.
- Tokens must not be exposed or logged.
