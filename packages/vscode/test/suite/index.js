const path = require('node:path');
const Mocha = require('mocha');
const { glob } = require('glob');

exports.run = async function run() {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
  const testsRoot = __dirname;
  const files = await glob('**/*.test.js', { cwd: testsRoot });
  files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) reject(new Error(`${failures} testes falharam.`));
      else resolve();
    });
  });
};
