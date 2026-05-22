# Zara Eval Feedback Format

Place exported user feedback JSON files in this directory. Eval runs read every
`*.json` file except files starting with `example`.

The pipeline redacts common emails, Indian phone numbers, and long numeric IDs
before including examples in reports. Prefer exporting short snippets rather
than full private conversations.

```json
{
  "feedback": [
    {
      "id": "feedback-001",
      "rating": "down",
      "channel": "text",
      "createdAt": "2026-05-22T09:00:00.000Z",
      "reasonTags": ["scripted", "too_many_questions"],
      "userMessage": "short user snippet",
      "assistantReply": "short Zara reply snippet",
      "notes": "Why this felt weak"
    }
  ]
}
```

Supported ratings: `up`, `down`, `neutral`.

Supported channels: `text`, `voice`, `text_tagged_voice`.
