'use strict';

const http = require('http');

class SocketConnection {
  constructor(socket, options = {}) {
    this.socketPath = socket;
  }

  async get(path, options = {}) {
    return new Promise((resolve, reject) => {
      const method = 'GET';
      const o = Object.assign({}, options, { path, socketPath: this.socketPath, method });
      const req = http.request(o);

      req.once('error', reject);
      req.once('response', async res => {
        const bufs = [];
        for await (const buf of res) {
          bufs.push(buf);
        }
        resolve(JSON.parse(Buffer.concat(bufs)));
      });

      req.end();
    });
  }

  async post(path, options = {}) {
    return new Promise((resolve, reject) => {
      const method = 'POST';

      const { json, body, streams } = options;

      if (json && body) {
        throw new Error('cannot specify both json and body options');
      }
      const o = Object.assign({}, options, { path, socketPath: this.socketPath, method });
      const req = http.request(o);

      req.once('error', reject);
      req.once('response', async res => {
        // if the caller wants the raw streams resolve with them
        if (streams) {
          resolve({ req, res });
          return;
        }
        // otherwise, collect the body
        const bufs = [];
        for await (const buf of res) {
          bufs.push(buf);
        }
        const body = bufs.length ? JSON.parse(Buffer.concat(bufs)) : '';
        resolve({ statusCode: res.statusCode, body });
      });

      if (json) {
        const textBody = JSON.stringify(json);
        req.setHeader('content-length', textBody.length);
        req.setHeader('content-type', 'application/json');
        req.end(textBody);
      } else {
        const textBody = body || '';
        req.setHeader('content-length', textBody.length);
        req.end(textBody);
      }

    });
  }

  async delete(path, options) {
    return new Promise((resolve, reject) => {
      const method = 'DELETE';
      const o = Object.assign({}, options, { path, socketPath: this.socketPath, method });
      const req = http.request(o);

      req.once('error', reject);
      req.once('response', async res => {
        const bufs = [];
        for await (const buf of res) {
          bufs.push(buf);
        }
        resolve(JSON.parse(Buffer.concat(bufs)));
      });

      req.end();
    });
  }

}

module.exports = SocketConnection;

if (require.main) {
  const x = new SocketConnection('/var/run/docker.sock');

  x.get('/containers/json')
    .then(console.log)
    .catch(console.error);
}



//get({ path: '/v1.41/containers/json', socketPath: '/var/run/docker.sock' })
//  .then(console.log)
//  .catch(console.error);
//
