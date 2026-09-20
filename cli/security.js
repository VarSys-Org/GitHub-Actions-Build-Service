#!/usr/bin/env node

const crypto = require('crypto');
const dns = require('dns').promises;

const PRIVATE_IPV4 = [
  [/^10\./, 'private IPv4'],
  [/^127\./, 'loopback IPv4'],
  [/^169\.254\./, 'link-local IPv4'],
  [/^192\.168\./, 'private IPv4'],
  [/^172\.(1[6-9]|2\d|3[01])\./, 'private IPv4'],
];

function isPrivateAddress(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return 'loopback IPv6';
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return 'private IPv6';
  for (const [pattern, label] of PRIVATE_IPV4) {
    if (pattern.test(normalized)) return label;
  }
  return null;
}

function assertSafeHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('private or local host is not allowed');
  }
  if (isPrivateAddress(host)) throw new Error('private or local address is not allowed');
  return host;
}

function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error(`${label} must use https without credentials`);
  }
  assertSafeHost(url.hostname);
  return url;
}

function normalizeEndpoint(value) {
  const url = assertHttpsUrl(value, 'Appwrite endpoint');
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/v1')) throw new Error('Appwrite endpoint must end in /v1');
  return url;
}

function assertId(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(String(value || ''))) {
    throw new Error(`${label} is invalid`);
  }
  return String(value);
}

function extractAppwriteFileId(sourceUrl, endpoint, bucketId) {
  const candidate = assertHttpsUrl(sourceUrl, 'source_url');
  const trusted = normalizeEndpoint(endpoint);
  const bucket = assertId(bucketId, 'Appwrite bucket ID');
  const expectedPrefix = `${trusted.origin}${trusted.pathname}/storage/buckets/${encodeURIComponent(bucket)}/files/`;
  if (!candidate.href.startsWith(expectedPrefix) || candidate.search || candidate.hash) {
    throw new Error('source_url is not an allowed Appwrite download URL');
  }
  const remainder = candidate.href.slice(expectedPrefix.length);
  const match = remainder.match(/^([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/download$/);
  if (!match) throw new Error('source_url is not an allowed Appwrite download URL');
  return match[1];
}

function buildAppwriteDownloadUrl(endpoint, bucketId, fileId) {
  const trusted = normalizeEndpoint(endpoint);
  const bucket = assertId(bucketId, 'Appwrite bucket ID');
  const file = assertId(fileId, 'Appwrite file ID');
  return `${trusted.origin}${trusted.pathname}/storage/buckets/${encodeURIComponent(bucket)}/files/${encodeURIComponent(file)}/download`;
}

function allowedCallbackHost(hostname, allowedHosts) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return allowedHosts.some((entry) => {
    const rule = entry.trim().toLowerCase().replace(/\.$/, '');
    if (!rule) return false;
    return rule.startsWith('*.') ? host.endsWith(rule.slice(1)) && host !== rule.slice(2) : host === rule;
  });
}

async function validateCallbackUrl(value, allowedHosts) {
  const url = assertHttpsUrl(value, 'callback URL');
  if (url.port && url.port !== '443') throw new Error('callback URL must use HTTPS port 443');
  if (!allowedCallbackHost(url.hostname, allowedHosts)) throw new Error('callback host is not allowlisted');
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  for (const address of addresses) {
    const reason = isPrivateAddress(address.address);
    if (reason) throw new Error(`callback host resolves to ${reason}`);
  }
  return url;
}

function callbackSignature(secret, timestamp, body) {
  if (!secret || secret.length < 32) throw new Error('CALLBACK_SIGNING_SECRET must be at least 32 characters');
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

async function postCallback() {
  const allowedHosts = String(process.env.CALLBACK_ALLOWED_HOSTS || '').split(',').filter(Boolean);
  const url = await validateCallbackUrl(process.env.CALLBACK_URL, allowedHosts);
  const body = process.env.CALLBACK_PAYLOAD;
  if (!body) throw new Error('CALLBACK_PAYLOAD is required');
  JSON.parse(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      'content-type': 'application/json',
      'user-agent': 'varsys-build-service/secure-callback',
      'x-build-signature': callbackSignature(process.env.CALLBACK_SIGNING_SECRET, timestamp, body),
      'x-build-signature-timestamp': timestamp,
    },
    body,
  });
  if (!response.ok) throw new Error(`callback returned HTTP ${response.status}`);
}

async function countActiveRuns() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const api = process.env.GITHUB_API_URL || 'https://api.github.com';
  if (!token || !repository) throw new Error('GitHub API admission configuration is incomplete');
  const active = [];
  for (const status of ['queued', 'in_progress', 'waiting', 'requested', 'pending']) {
    const response = await fetch(`${api}/repos/${repository}/actions/workflows/remote-build.yml/runs?status=${status}&per_page=100`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub quota query returned HTTP ${response.status}`);
    const data = await response.json();
    active.push(...(data.workflow_runs || []));
  }
  return active.filter((run, index, runs) => runs.findIndex((item) => item.id === run.id) === index && String(run.id) !== String(process.env.GITHUB_RUN_ID));
}

async function enforceQuota() {
  const team = assertId(process.env.BUILD_TEAM_ID || 'default-team', 'team ID');
  const project = assertId(process.env.BUILD_PROJECT_ID || 'default-project', 'project ID');
  const allowedTeams = String(process.env.BUILD_ALLOWED_TEAMS || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowedProjects = String(process.env.BUILD_ALLOWED_PROJECTS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowedTeams.includes(team)) throw new Error('team ID is not allowlisted');
  if (!allowedProjects.includes(project)) throw new Error('project ID is not allowlisted');
  const teamLimit = Number(process.env.BUILD_MAX_TEAM_CONCURRENCY || 2);
  const projectLimit = Number(process.env.BUILD_MAX_PROJECT_CONCURRENCY || 1);
  if (!Number.isInteger(teamLimit) || teamLimit < 1 || !Number.isInteger(projectLimit) || projectLimit < 1) throw new Error('build concurrency limits must be positive integers');
  const marker = `[team=${team} project=${project}]`;
  const runs = await countActiveRuns();
  const matchingTeam = runs.filter((run) => String(run.display_title || '').includes(`[team=${team} `));
  const matchingProject = runs.filter((run) => String(run.display_title || '').includes(marker));
  if (matchingTeam.length >= teamLimit) throw new Error(`team build quota exceeded (${teamLimit})`);
  if (matchingProject.length >= projectLimit) throw new Error(`project build quota exceeded (${projectLimit})`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'source-url') {
    let fileId = process.env.SOURCE_FILE_ID;
    if (!fileId && process.env.SOURCE_URL_INPUT) fileId = extractAppwriteFileId(process.env.SOURCE_URL_INPUT, process.env.APPWRITE_ENDPOINT, process.env.APPWRITE_BUCKET_ID);
    process.stdout.write(`${buildAppwriteDownloadUrl(process.env.APPWRITE_ENDPOINT, process.env.APPWRITE_BUCKET_ID, fileId)}\n`);
  } else if (command === 'source-file-id') {
    process.stdout.write(`${extractAppwriteFileId(process.env.SOURCE_URL_INPUT, process.env.APPWRITE_ENDPOINT, process.env.APPWRITE_BUCKET_ID)}\n`);
  } else if (command === 'callback') {
    await postCallback();
  } else if (command === 'quota') {
    await enforceQuota();
  } else {
    throw new Error('unknown security command');
  }
}

if (require.main === module) main().catch((error) => { console.error(`[security] ${error.message}`); process.exit(1); });

module.exports = { assertSafeHost, normalizeEndpoint, buildAppwriteDownloadUrl, extractAppwriteFileId, validateCallbackUrl, callbackSignature };
