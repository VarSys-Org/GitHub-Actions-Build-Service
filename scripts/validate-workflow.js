const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'remote-build.yml'), 'utf8');

assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(workflow, /concurrency:[\s\S]*group: remote-build-dedup-.*dedup_key/);
assert.match(workflow, /cancel-in-progress:\s*true/);
assert.match(workflow, /node build-service\/cli\/security\.js quota/);
assert.match(workflow, /BUILD_ALLOWED_TEAMS/);
assert.match(workflow, /BUILD_ALLOWED_PROJECTS/);
assert.match(workflow, /node build-service\/cli\/security\.js source-url/);
assert.match(workflow, /node build-service\/cli\/security\.js callback/);
assert.doesNotMatch(workflow, /curl[^\n]*\$\{\{ steps\.build_info\.outputs\.SOURCE_URL \}\}/);
assert.doesNotMatch(workflow, /-H "X-Appwrite-Key: \$\{\{/);
assert.doesNotMatch(workflow, /"\$\{\{ steps\.build_info\.outputs\.SOURCE_URL \}\}"/);
assert.match(fs.readFileSync(path.join(__dirname, '..', 'cli', 'security.js'), 'utf8'), /x-build-signature/);
console.log('remote-build workflow security validation passed');
