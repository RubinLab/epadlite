let server;
before(async () => {
  const host = '127.0.0.1';
  const port = 5987;
  process.env.host = host;
  process.env.port = port;
  // eslint-disable-next-line global-require
  const buildServer = require('../server');
  server = buildServer();
  await server.ready();
  server.hostname = `${host}:${port}`;
  await server.listen({ host, port });
  // eslint-disable-next-line no-underscore-dangle
  global.__SERVER__ = server;
});

after(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
  // eslint-disable-next-line no-underscore-dangle
  global.__SERVER__ = undefined;
});
