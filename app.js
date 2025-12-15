// app.js
const buildServer = require('./server'); // eslint-disable-line
const server = buildServer();

const host = process.env.HOST || '0.0.0.0';
const port = process.env.PORT || 5987;

async function start() {
  try {
    await server.listen({ host, port });
    server.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
