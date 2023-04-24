'use strict';

let fetchFunction;
async function getFetch() {
  if (fetchFunction) {
    return fetchFunction;
  }
  ({ default: fetch } = await import('node-fetch'));
  fetchFunction = fetch;
  return fetchFunction;
}

async function fetch(...args) {
  return getFetch().then(fetch => {
    console.log(fetch);
    return fetch(...args)
  });
}

module.exports = fetch;
