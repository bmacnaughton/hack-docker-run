'use strict';

// candidate to be replaced
const dockerRawStream = require('docker-raw-stream');

const SocketConnection = require('./socket-fetch');

class DockerDaemon {
  constructor(options = {}) {
    this.fetch = new SocketConnection('/var/run/docker.sock');
    this.version = options.version || 'v1.41';
  }

  async create(image, cmd, options = {}) {
    const createOpts = {
      Image: image,
      Cmd: cmd,
    };
    const path = this.addVersion('/containers/create');
    const response = await this.fetch.post(path, { json: createOpts });

    return response;
  }

  async start(id) {
    const path = this.addVersion(`/containers/${id}/start`);
    return await this.fetch.post(path);
  }

  async wait(id) {
    const path = this.addVersion(`/containers/${id}/wait`);
    return await this.fetch.post(path);
  }

  // is this really necessary? or just look at logs?
  async attach(id) {
    let path = this.addVersion(`/containers/${id}/attach?stderr=1&stdout=1&stdin=1&stream=1`);

    const response = await this.fetch.post(path, { streams: true });
    return response;
  }

  addVersion(path) {
    if (!this.version) {
      return path;
    }
    return `/${this.version}${path}`;
  }
}

// create container
// request.post('/containers/create', {json: copts, qs })

// attach to container
// qs = { stderr: 1, stdout: 1, stdin: 1, stream: 1 };
// headers = {'Content-Length': '0'};
// request.post('/containers/<id>/attach', { qs, headers })

// delete container
// request.del('/containers/<id>')

// stop container
// qs = { opts.wait || 10 };
// request.post('/containers/<id>/stop', {qs, json: true, body: null});

// start container
// request.post('/container/<id>/start', {json: {}})

// wait for container to exit
// request.post('/containers/<id>/wait', {json: true, body: null});

// resize?
// qs = { h: height, w: width };
// request.post('/containers/<id>/resize', { qs, buffer: true, body: null });

// sequence
// create
// attach
// start
//  ? resize
//  stdin/stdout/stderr
// wait
//  ? remove


class DockerRun {
  constructor() {
    this.dd = new DockerDaemon();
  }

  async run(image, cmdLine, options = {}) {
    let { statusCode, body } = await this.dd.create(image, cmdLine);
    if (statusCode !== 201) {
      throw DockerRun.makeError('create', { statusCode, body })
    }

    const id = body.Id;
    if (body.warnings) {
      console.log('create warnings', body.warnings);
    }

    if (options.attach) {
      const { req, res } = await this.dd.attach(id);
      if (res.statusCode >= 400) {
        throw DockerRun.makeError('attach', { statusCode, body })
      }
      console.log('attach')
    }

    console.log('starting');
    ({ statusCode, body } = await this.dd.start(id));
    if (statusCode !== 204) {
      throw DockerRun.makeError('start', { statusCode, body })
    }

    console.log('waiting');
    ({ statusCode, body } = await this.dd.wait(id));
    if (statusCode !== 200) {
      throw DockerRun.makeError('create', { statusCode, body })
    }

  }

  static makeError(msg, { statusCode, body }) {
    if (body) {
      return new Error(`${msg} ${statusCode}: ${JSON.stringify(body)}`);
    }

    return new Error(`${msg} ${statusCode}`);
  }
}

module.exports = {
  DockerDaemon,
  DockerRun,
};

