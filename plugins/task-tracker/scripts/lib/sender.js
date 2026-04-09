const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.env.HOME, '.task-tracker.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

/**
 * Supabase REST API로 usage_event INSERT.
 * anon key + RLS로 보호.
 */
async function sendEvent(event) {
  const config = loadConfig();
  if (!config || !config.invite_key) {
    return;
  }

  const { supabase_url, supabase_anon_key, invite_key } = config;

  const response = await fetch(`${supabase_url}/rest/v1/usage_events`, {
    method: 'POST',
    headers: {
      'apikey': supabase_anon_key,
      'Authorization': `Bearer ${supabase_anon_key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      invite_key,
      session_id: event.sessionId,
      event_type: event.eventType,
      project: event.project,
      input_tokens: event.inputTokens || 0,
      output_tokens: event.outputTokens || 0,
      prompt_count: event.promptCount || 0,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    fs.appendFileSync(
      path.join(process.env.HOME, '.task-tracker.log'),
      `[${new Date().toISOString()}] ERROR ${response.status}: ${errText}\n`
    );
  }
}

module.exports = { sendEvent, loadConfig };
