const http = require('http');
const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, '.bridge-state.json');
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

async function sendCommand(action, params = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ action, params, timeoutMs });
    const req = http.request({
      hostname: state.host || '127.0.0.1',
      port: state.port || 17892,
      path: '/api/command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-AE-Bridge-Token': state.token
      },
      timeout: timeoutMs + 2000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.ok) resolve(parsed.result);
          else reject(new Error(parsed.error || 'Command failed'));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

const action = process.argv[2];
const params = process.argv[3] ? JSON.parse(process.argv[3]) : {};

if (!action) {
  console.log("Usage: node send_ae_cmd.js <action> [jsonParams]");
  process.exit(1);
}

sendCommand(action, params)
  .then(res => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
  });
