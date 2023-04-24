'use strict';

'use strict'

const path = require('path');
const fs = require('fs');

const dockerPull = require('@vweevers/docker-pull');
const dockerRun = require('docker-run');
const logger = require('log-update');

const log = logger.create(process.stderr, { showCursor: true });




async function main() {
  console.log('got', process.argv);
  // remove node and this script from argv
  const [images, argv] = getImagesAndRemoveFromArgv(process.argv.slice(2));
  console.log('executing images', images);
  console.log('args:', argv);

  while (images.length) {
    const image = images.shift();
    console.log('executing image:', image)
    await getImage(image);

    await runBuild(image, argv);
  }
}

main()
  .then(() => {
    console.log('done');
  })
  .catch(e => {
    console.log('ERROR:', e)
  });

async function getImage(image) {
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

async function runBuild(image, argv) {
  let resolve;
  let reject;
  const p = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  const inputDir = path.resolve('.');
  const builderDir = path.dirname(require.resolve('./guest.js'));

  const dopts = {
    //entrypoint: 'npx',
    //argv: ['--no-install', 'prebuildify', ...argv],
    entrypoint: 'node',
    argv: ['/builder/guest.js'],
    volumes: {
      [inputDir]: '/input',
      [builderDir]: '/builder',
    },
    cwd: '/input',
  }
  console.log('target:', dopts);

  const child = dockerRun(image, dopts);

  child.on('error', reject);
  child.on('exit', () => {resolve('exit')});

  child.stderr.pipe(process.stderr, { end: false });

  child.stdout.pipe(process.stdout);
  child.stdout.on('finish', () => {resolve('finish')});
  child.stdout.on('error', reject);
}


function getImagesAndRemoveFromArgv(args) {
  let images = [];

  while (args[0] === '-i') {
    // we don't use custom images, so just use these
    images.push(`ghcr.io/prebuild/${args[1]}:2`);
    args = args.slice(2);
  }

  return [images, args];
}
