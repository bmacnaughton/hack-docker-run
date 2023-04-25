'use strict';

// candidate to be replaced
const dockerRawStream = require('docker-raw-stream');
const debug = require('debug')('docker-run');


const SocketConnection = require('./socket-fetch');

class MakeContainer {
  constructor(image, cmd, options = {}) {
    this.image = image;
    this.cmd = cmd
    this.fetch = new SocketConnection('/var/run/docker.sock');
    this.version = options.version || 'v1.41';

    this.createOpts = {
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      StdinOnce: true,
      Image: this.image,
      ExposedPorts: {},
      Env: [],
      Volumes: {},
      Cmd: cmd,
      HostConfig: {
        Binds: [],
        Links: [],
        NetworkMode: 'host',
        PortBindings: {},
        Privileged: true,
      }
    }

    if (options.ports) {
      Object.keys(opts.ports).forEach(host => {
        const container = opts.ports[host];
        if (!/\//.test(container)) {
          container += '/tcp';
        }
        this.createOpts.ExposedPorts[container] = {};
        this.createOpts.HostConfig.PortBindings[container] = [{ HostPort: `${host}`}];
      });
    }

    if (options.env) {
      Object.keys(options.env).forEach(name => {
        this.createOpts.Env.push(`${name}=${options.env[name]}`);
      });
    }

    if (options.volumes) {
      for (const localName in options.volumes) {
        let containerName = options.volumes[localName];
        this.createOpts.Volumes[localName] = {}
        if (!/:r(w|o)$/.test(containerName)) {
          containerName += ':rw';
        }

        this.createOpts.HostConfig.Binds.push(`${localName}:${containerName}`);
      }
    }
  }

  async create(options = {}) {
    const path = this.addVersion('/containers/create');
    const response = await this.fetch.post(path, { json: this.createOpts });

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


class DockerRun {
  constructor(image, cmd, options = {}) {
    this.image = image;
    this.cmd = cmd;
    this.dd = new MakeContainer(image, cmd, options);
  }

  async run(options = {}) {
    debug('creating container with %s', this.image);
    let { statusCode, body } = await this.dd.create();
    if (statusCode !== 201) {
      throw DockerRun.makeError('create', { statusCode, body })
    }

    const id = body.Id;
    if (body.warnings) {
      console.log('create warnings', body.warnings);
    }
    debug('container %s created from %s', id, this.image);

    if (options.attach) {
      debug('attaching to %s', this.image);
      const { req, res } = await this.dd.attach(id);
      if (res.statusCode >= 400) {
        throw DockerRun.makeError('attach', { statusCode, body })
      }
      const parser = res.pipe(dockerRawStream());

      req.on('finish', function() {
        req.socket.end();
      })

    }

    debug('starting %s', this.image);
    ({ statusCode, body } = await this.dd.start(id));
    if (statusCode !== 204) {
      throw DockerRun.makeError('start', { statusCode, body })
    }

    debug('waiting for %s to complete', this.image);
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
  MakeContainer,
  DockerRun,
};

