const fs = require('fs');
const readline = require('readline');

/**
 * transcript JSONL 파일에서 토큰 사용량과 프롬프트 수를 합산.
 * 각 줄은 JSON 객체. assistant 메시지에 usage 필드가 있음.
 */
async function parseTranscript(transcriptPath) {
  const result = {
    inputTokens: 0,
    outputTokens: 0,
    promptCount: 0,
  };

  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return result;
  }

  const fileStream = fs.createReadStream(transcriptPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);

      // 프롬프트 카운트: user 타입 메시지
      if (entry.type === 'user' && entry.message?.role === 'user') {
        result.promptCount++;
      }

      // 토큰 합산: assistant 메시지의 usage 필드
      const usage = entry.message?.usage;
      if (usage) {
        result.inputTokens += (usage.input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0)
          + (usage.cache_read_input_tokens || 0);
        result.outputTokens += (usage.output_tokens || 0);
      }
    } catch {
      // 파싱 실패한 줄은 무시
    }
  }

  return result;
}

module.exports = { parseTranscript };
