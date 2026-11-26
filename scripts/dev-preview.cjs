// Starts the Version 2 dev server from its own folder (so .env.local and .data resolve here) on port 4184.
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const port = process.argv[2] || '4184';
const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', port], {stdio: 'inherit', cwd: root});
child.on('exit', code => process.exit(code ?? 0));
