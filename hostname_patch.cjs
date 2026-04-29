const os = require('os');
const _orig = os.hostname.bind(os);
os.hostname = function () {
  return _orig().replace(/[^\x00-\x7F]/g, 'X');
};
const path = require('path');
process.argv = ['node', 'vercel', 'deploy', '--prebuilt', '--prod'];
require(path.join(process.env.APPDATA, 'npm', 'node_modules', 'vercel', 'dist', 'index.js'));
