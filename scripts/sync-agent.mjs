// scripts/sync-agent.mjs — pushes docs/SYSTEM_PROMPT.md to the ElevenLabs agent.
// Run with:  npm run sync:agent
//
// Why: docs/SYSTEM_PROMPT.md is the source of truth. Copy-pasting into the
// dashboard by hand is easy to forget or get wrong; this keeps them identical.
// It updates ONLY the system prompt and first message. Tools, voice, LLM and
// all other settings are left exactly as they are (tool IDs are re-sent
// unchanged so they can't be dropped).
// Needs ELEVENLABS_API_KEY with "ElevenLabs Agents: Write" permission.

import { readFileSync } from 'node:fs';

process.loadEnvFile('.env.local');
const { ELEVENLABS_API_KEY: key, ELEVENLABS_AGENT_ID: agentId } = process.env;
const api = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`;
const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };

// ---- 1. Read the prompt and first message from the doc ----
const doc = readFileSync('docs/SYSTEM_PROMPT.md', 'utf8');

const firstMessage = /## First message\s*\n>\s*(.+)/.exec(doc)?.[1]?.trim();
// The prompt is everything between the first two lines that are exactly "---"
// after the "## System prompt" heading.
const afterHeading = doc.slice(doc.indexOf('## System prompt'));
const [, prompt] = afterHeading.split(/^---\s*$/m);

if (!firstMessage || !prompt?.trim()) {
  console.error('✖ Could not find the first message or prompt in docs/SYSTEM_PROMPT.md');
  process.exit(1);
}

// ---- 2. Read the current agent so we keep its tools ----
const before = await (await fetch(api, { headers })).json();
const current = before.conversation_config?.agent?.prompt;
if (!current) {
  console.error('✖ Could not read the agent. Check ELEVENLABS_AGENT_ID and the API key permission.');
  process.exit(1);
}

// ---- 3. Update ----
const res = await fetch(api, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    conversation_config: {
      agent: {
        first_message: firstMessage,
        prompt: {
          prompt: prompt.trim(),
          tool_ids: current.tool_ids,             // unchanged
          built_in_tools: current.built_in_tools, // unchanged (end_call)
        },
      },
    },
  }),
});
if (!res.ok) {
  console.error(`✖ ElevenLabs answered ${res.status}:`, (await res.text()).slice(0, 300));
  process.exit(1);
}

// ---- 4. Verify ----
const after = (await (await fetch(api, { headers })).json()).conversation_config.agent;
const toolNames = (after.prompt.tools ?? []).map((t) => t.name).sort().join(', ');
console.log('✔ Prompt updated:', after.prompt.prompt.length, 'characters');
console.log('✔ First message:', after.first_message);
console.log(toolNames.includes('get_order_details') && toolNames.includes('cancel_order')
  ? `✔ Tools still attached: ${toolNames}`
  : `✖ Tools missing after update: ${toolNames}`);
