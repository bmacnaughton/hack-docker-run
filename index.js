'use strict';

'use strict'

const path = require('path');
const fs = require('fs');

const dockerPull = require('@vweevers/docker-pull');
const { DockerRun } = require('./docker-api');
const logger = require('log-update');

const log = logger.create(process.stderr, { showCursor: true });
const debug = require('debug')('prebuilder');

//
//



async function main() {
  // separate the images and options
  const [images, argv] = getImagesAndRemoveFromArgv(process.argv.slice(2));
  if (!images.length) {
    throw new Error('must specify one or more images');
  }
  debug('images: %o', images);

  let buildsToDo = builds(images, argv);

  for await (const r of buildsToDo) {
    if (r.State.Status !== 'exited' || r.State.ExitCode !== 0) {
      throw new Error(`build failed status: ${r.State.Status}, code: ${r.State.ExitCode}`);
    }
  }
}

async function* builds(images, argv) {
  for (const image of images) {
    const args = argv.slice();
    // add tags for cross compilations
    if (/^(ghcr\.io\/)?prebuild\/(linux|android)-arm/.test(image)) {
      args.push('--tag-armv');
    } else if (/^(ghcr\.io\/)?prebuild\/(centos|alpine)/.test(image)) {
      args.push('--tag-libc');
    }

    debug('fetching image %s', image);
    await getImage(image);

    const command = ['npx', '--no-install', 'prebuildify'].concat(args);
    const dopts = {
      volumes: { [process.cwd()]: '/input' },
      cwd: '/input'
    };
    debug('building %s with %o', image, command);
    const dr = new DockerRun(image, command, dopts);

    yield await dr.run({});
  }
}

main()
  .then(() => {
    console.log('done');
  })
  .catch(e => {
    console.log('ERROR:', e);
    process.exit(1);
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

function getImagesAndRemoveFromArgv(args) {
  let images = [];

  while (args[0] === '-i') {
    // we don't use custom images, so just use these
    images.push(`ghcr.io/prebuild/${args[1]}:2`);
    args = args.slice(2);
  }

  return [images, args];
}
