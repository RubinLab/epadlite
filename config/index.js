const env = process.env.NODE_ENV || 'development';
const config = require(`./${env}`); // eslint-disable-line
config.authConfig = {};
if (config.auth && config.auth != 'none') config.authConfig = require(`./${config.auth}.json`); // eslint-disable-line
config.dicomWebConfig = {};
if (config.dicomweb) config.dicomWebConfig = require(`./${config.dicomweb}.json`); // eslint-disable-line
config.mode = config.mode || 'lite'; // default lite
config.filesDir = config.filesDir || 'files';
module.exports = config;
