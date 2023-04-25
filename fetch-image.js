'use strict'

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
