const env = process.env.NODE_ENV || 'development';
const config = require(`./${env}`); // eslint-disable-line
config.authConfig = {};
if (config.auth && config.auth != 'none') config.authConfig = require(`./${config.auth}.json`); // eslint-disable-line
config.dicomWebConfig = {};
if (config.dicomweb) config.dicomWebConfig = require(`./${config.dicomweb}.json`); // eslint-disable-line
config.mode = config.mode || 'lite'; // default lite
config.imageExt = config.imageExt || 'jpg|jpeg|png';
config.reportExt = config.reportExt || 'txt|pdf';
config.validExt = `${config.imageExt}|${config.reportExt}`;
config.prefix = config.prefix || '';
config.thickDb = config.thickDb || {
  name: 'epaddb',
  host: 'localhost',
  port: '3306',
  user: 'pacs',
  pass: 'pacs',
};
config.maxConcurrent = config.maxConcurrent || 5;
config.disableStats = config.disableStats || false;
config.statsEpad = config.statsEpad || 'https://epad-public.stanford.edu';
module.exports = config;
