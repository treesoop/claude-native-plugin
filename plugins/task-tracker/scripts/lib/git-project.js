const { execSync } = require('child_process');

/**
 * cwd에서 git remote origin URL을 읽어 "owner/repo" 형태로 반환.
 * git repo가 아니거나 remote가 없으면 "기타" 반환.
 */
function getProjectName(cwd) {
  try {
    const url = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (sshMatch) return sshMatch[1];

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    if (httpsMatch) return httpsMatch[1];

    return url;
  } catch {
    return '기타';
  }
}

module.exports = { getProjectName };
