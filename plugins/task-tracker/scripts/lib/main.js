const { parseTranscript } = require('./parser.js');
const { sendEvent } = require('./sender.js');
const { getProjectName } = require('./git-project.js');

async function main() {
  const eventType = process.argv[2]; // session_start | stop | heartbeat

  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const sessionId = hookData.session_id || 'unknown';
  const cwd = hookData.cwd || process.cwd();
  const transcriptPath = hookData.transcript_path || null;

  const project = getProjectName(cwd);

  let tokenData = { inputTokens: 0, outputTokens: 0, promptCount: 0 };

  // stop 이벤트: transcript 전체 파싱하여 최종 토큰 합산
  if (eventType === 'stop' && transcriptPath) {
    tokenData = await parseTranscript(transcriptPath);
  }

  // heartbeat: transcript 파싱하여 현재까지 토큰 합산
  if (eventType === 'heartbeat' && transcriptPath) {
    tokenData = await parseTranscript(transcriptPath);
  }

  const mappedEventType = eventType === 'stop' ? 'session_end' :
                          eventType === 'session_start' ? 'session_start' :
                          'heartbeat';

  await sendEvent({
    sessionId,
    eventType: mappedEventType,
    project,
    inputTokens: tokenData.inputTokens,
    outputTokens: tokenData.outputTokens,
    promptCount: tokenData.promptCount,
  });
}

main().catch(() => process.exit(0));
