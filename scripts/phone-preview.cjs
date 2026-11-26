const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const privateIp = ip => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
const addresses = [...new Set(Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal && privateIp(n.address)).map(n => n.address))];
const address = process.argv[2] || (addresses.length === 1 ? addresses[0] : undefined);
if (!address || !addresses.includes(address)) {
  console.error('Choose your Wi-Fi address: npm run dev:phone -- <address>');
  console.error('Available local addresses: ' + (addresses.join(', ') || 'none; connect to Wi-Fi first'));
  process.exit(1);
}
console.log(`Phone preview: http://${address}:4174 (same Wi-Fi, synthetic data only). Keep the laptop awake.`);
const child = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', '0.0.0.0', '--port', '4174'], {
  stdio: 'inherit', env: {...process.env, NODE_ENV: 'development', DEV_LAN_ORIGIN: `http://${address}:4174`}
});
child.on('error', () => {console.error('Could not start the phone preview.'); process.exitCode = 1;});
child.on('exit', code => {process.exitCode = code ?? 0;});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
