// Private, temporary demonstration. Credentials and existing data are not changed.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {createPreviewGate} = require('./preview-gate.cjs');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const directory = path.join(root, '.data', 'quick-tunnel');
const executable = path.join(root, '.tools', 'cloudflared.exe');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') require('node:child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, stdio:'ignore'});
      else child.kill('SIGTERM');
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
async function main() {
  if (!fs.existsSync(executable)) throw new Error('Cloudflare is missing from .tools/cloudflared.exe. Install the official Windows cloudflared executable there.');
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error('Port 4174 is already in use. Stop the other Ryuu launcher first.')));
    probe.listen(4174, '127.0.0.1', () => probe.close(resolve));
  });
  fs.mkdirSync(directory, {recursive:true});
  const gate = createPreviewGate();
  await new Promise((resolve, reject) => {gate.server.once('error', reject); gate.server.listen(4175, '127.0.0.1', resolve);});
  const log = fs.createWriteStream(path.join(directory, 'cloudflare.log'), {flags:'w'});
  const tunnel = spawn(executable, ['tunnel', '--url', 'http://127.0.0.1:4175', '--no-autoupdate'], {windowsHide:true, stdio:['ignore','pipe','pipe']});
  children.push(tunnel);
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Cloudflare did not create a link within 90 seconds. See .data/quick-tunnel/cloudflare.log.')), 90000);
    let buffer = '';
    const output = chunk => {
      log.write(chunk);
      buffer = (buffer + chunk.toString()).slice(-30000);
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
      if (match) {clearTimeout(timeout); resolve(match[0]);}
    };
    tunnel.stdout.on('data', output); tunnel.stderr.on('data', output);
    tunnel.once('error', error => {clearTimeout(timeout); reject(error);});
    tunnel.once('exit', () => {clearTimeout(timeout); reject(new Error('Cloudflare stopped. See .data/quick-tunnel/cloudflare.log.'));});
  });
  gate.setOrigin(origin);
  // Keep synthetic data isolated; Gmail verification uses the configured local sender.
  const env = {...process.env, NODE_ENV:'development', APP_URL:origin, DEV_TUNNEL_ORIGIN:origin,
    DEV_LAN_ORIGIN:'http://127.0.0.1:4174', DEMO_MODE:'true', DATABASE_URL:'', TEST_DATABASE:'',
    DATA_DIR:path.join(directory, 'demo-data'), WHATSAPP_TOKEN:'',
    DEVICE_INGEST_SECRET:''};
  const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '4174'], {env, windowsHide:true, stdio:'inherit'});
  children.push(server);
  server.once('error', error => {console.error(error.message); stop(1);});
  server.once('exit', code => stop(code || 0));
  tunnel.once('exit', () => {console.error('The temporary tunnel closed.'); stop(1);});
  const accessLink = gate.accessLink(origin);
  fs.writeFileSync(path.join(directory, 'url.txt'), origin + '\n');
  fs.writeFileSync(path.join(directory, 'private-link.txt'), accessLink + '\n', {mode:0o600});
  console.log('\nPRIVATE RYUU TEST LINK\n' + accessLink);
  console.log('Open the complete link once on each device. No email codes; this browser is remembered for seven days while this launch stays running.');
  console.log('Keep the link private. Wait for the website to say Ready before opening.');
  console.log('Uses separate demo records. Gmail verification uses .env.local when configured; WhatsApp remains disabled.');
  console.log('Keep this window and laptop running. Ctrl+C stops the website and link.\n');
}
main().catch(error => {console.error(error.message); stop(1);});
