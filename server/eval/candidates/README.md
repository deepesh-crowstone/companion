# Candidate Prompt Files

Use this directory for prompt candidates when running tournament evals.

Plain text files are treated as a full system prompt for both text and voice
cases:

```sh
npm run eval -- --compare-prompt eval/candidates/my-candidate.txt
```

JSON files can provide channel-specific prompts:

```json
{
  "name": "candidate-v1",
  "textSystemPrompt": "full text system prompt",
  "voiceSystemPrompt": "full voice system prompt"
}
```

The eval runner never applies these prompts to production. It only compares
outputs and writes reports under `eval/runs/`.
