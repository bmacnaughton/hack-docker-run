'use strict';

'use strict'

const path = require('path');
const fs = require('fs');

const dockerPull = require('@vweevers/docker-pull');
const dockerRun = require('docker-run');
const logger = require('log-update');
const log = logger.create(process.stderr, { showCursor: true })

const image = 'ghcr.io/prebuild/centos7-devtoolset7:2';

getImage()
  .then(r => {
    console.log('got image');
  })
  .then(() => {
    return runBuild();
  })
  .catch(e => {
    console.log('ERROR:', e);
  })

async function getImage() {
  let opts = {};

  let resolve;
  let reject;
  const p = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });


  dockerPull(image)
    .on('progress', progress)
    .on('error', reject)
    .on('end', resolve)

  function progress() {
    if (process.env.CI) {
      console.error(`> prebuildify-cross pull ${this.image}`)
      return this.removeListener('progress', progress)
    }

    const count = `${this.layers} layers`
    const ratio = `${bytes(this.transferred)} / ${bytes(this.length)}`

    log(`> prebuildify-cross pull ${this.image}: ${count}, ${ratio}`)
  }
}

async function runBuild() {
  let resolve;
  let reject;
  const p = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  const useStream = false;
  const streamOrFile = useStream ? '-' : '/input/guest.js';

  const child = dockerRun(image, {
      entrypoint: 'node',
      argv: [streamOrFile].concat(['--stuff', '--for', '--func']),
      volumes: {
        [path.resolve('.')]: '/input',
      },
  });

  child.on('error', reject);
  child.on('exit', () => {resolve('exit')});

  child.stderr.pipe(process.stderr, { end: false });

  if (useStream) {
    const stream = fs.createReadStream(path.resolve('./guest.js'), 'utf8');
    stream.pipe(child.stdin);
  }


  child.stdout.pipe(process.stdout);
  child.stdout.on('finish', () => {resolve('finish')});
  child.stdout.on('error', reject);
}
