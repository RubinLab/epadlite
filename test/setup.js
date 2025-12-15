let server;
before(async () => {
  const host = '127.0.0.1';
  const port = 5987;
  process.env.host = host;
  process.env.port = port;
  const buildServer = require('../server'); // eslint-disable-line
  server = buildServer();
  await server.listen({ host, port });
  // eslint-disable-next-line no-underscore-dangle
  global.__SERVER__ = server;
});
after(async () => {
  server.log.info('Trying to close the server');
  await server.close();
  // eslint-disable-next-line no-underscore-dangle
  await global.__SERVER__.close();
});
