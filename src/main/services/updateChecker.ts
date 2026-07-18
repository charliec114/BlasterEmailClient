const RELEASES_API_URL = 'https://api.github.com/repos/charliec114/BlasterEmailClient/releases/latest'

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  url: string
}

interface GithubReleaseResponse {
  tag_name?: string
  html_url?: string
}

function parseVersionParts(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0)
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersionParts(latest)
  const currentParts = parseVersionParts(current)
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] ?? 0
    const c = currentParts[i] ?? 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const res = await fetch(RELEASES_API_URL, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) {
    throw new Error(`GitHub respondió ${res.status}`)
  }
  const data = (await res.json()) as GithubReleaseResponse
  const latestVersion = (data.tag_name ?? '').replace(/^v/i, '')

  return {
    hasUpdate: latestVersion !== '' && isNewerVersion(latestVersion, currentVersion),
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    url: data.html_url ?? 'https://github.com/charliec114/BlasterEmailClient/releases'
  }
}
