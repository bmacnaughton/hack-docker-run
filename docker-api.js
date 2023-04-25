'use strict';

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

    if (options.cwd) {
      this.createOpts.WorkingDir = options.cwd;
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
    return this.fetch.post(path, { json: this.createOpts });
  }

  async start(id) {
    const path = this.addVersion(`/containers/${id}/start`);
    return this.fetch.post(path);
  }

  async wait(id) {
    const path = this.addVersion(`/containers/${id}/wait`);
    return this.fetch.post(path);
  }

  // is this really necessary? or just look at logs?
  async attach(id) {
    let path = this.addVersion(`/containers/${id}/attach?stderr=1&stdout=1&stdin=1&stream=1`);

    return this.fetch.post(path, { streams: true });
  }

  async inspect(id) {
    let path = this.addVersion(`/containers/${id}/json`);

    return this.fetch.get(path);
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

    this.id = id;

    if (options.attach) {
      throw new Error('attack option not implemented');
      // candidate to be replaced
      const dockerRawStream = require('docker-raw-stream');

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

    debug('inspecting %s', this.image);
    ({ statusCode, body } = await this.dd.inspect(id));
    if (statusCode !== 200) {
      throw DockerRun.makeError('inspect', { statusCode, body });
    } else {
      return body;
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

if (require.main) {
  process.env.DEBUG = 'docker-run';
  const dr = new DockerRun(
    'ghcr.io/prebuild/centos7-devtoolset7:2',
    ['npx', '--no-install', 'prebuildify', '-t', '18.7.0', '-t', '16.9.1', '--tag-libc'],
    {
      volumes: { [process.cwd()]: '/input' },
      cwd: '/input'
    }
  );

  dr.run({})
    .then(r => {
      if (r.State.Status !== 'exited' || r.State.ExitCode !== 0) {
        console.error('job failed', r.State);
      } else {
        console.log('done', r.State);
      }
    });
}

