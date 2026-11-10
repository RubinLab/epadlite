const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const yauzl = require('yauzl');

// unix file type bits kept in the high 16 bits of the zip external file attributes
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const UNIX = 3; // "version made by" host system id

const isSymlink = (entry) =>
  entry.versionMadeBy >> 8 === UNIX && ((entry.externalFileAttributes >>> 16) & S_IFMT) === S_IFLNK; // eslint-disable-line no-bitwise

/**
 * Extracts a zip file into options.dir.
 *
 * Replacement for the extract-zip package (unfixed symlink advisories GHSA-jmr9-qjv8-65gv and
 * GHSA-7pqw-9j4j-h8q3). Differences from extract-zip:
 *  - entries that are symlinks are refused (the extraction fails), nothing is ever linked
 *  - every entry has to resolve inside options.dir, also after following existing symlinks
 *  - file permissions are not restored, files are written 0644 and directories 0755
 *
 * @param {string} zipPath path of the zip file
 * @param {{dir: string}} options dir is the folder to extract to, it is created if missing
 * @returns {Promise<void>}
 */
function extractZip(zipPath, options = {}) {
  return new Promise((resolve, reject) => {
    if (!options.dir) {
      reject(new Error('extractZip: options.dir is required'));
      return;
    }
    const root = path.resolve(options.dir);
    let realRoot;
    try {
      fs.mkdirSync(root, { recursive: true });
      realRoot = fs.realpathSync(root);
    } catch (err) {
      reject(err);
      return;
    }

    const within = (base, target) => target === base || target.startsWith(base + path.sep);

    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr) {
        reject(openErr);
        return;
      }
      let finished = false;
      const fail = (err) => {
        if (finished) return;
        finished = true;
        zipfile.close();
        reject(err);
      };

      zipfile.on('error', fail);
      zipfile.on('end', () => {
        if (finished) return;
        finished = true;
        resolve();
      });

      zipfile.on('entry', (entry) => {
        const dest = path.resolve(root, entry.fileName);
        // yauzl already refuses .. and absolute names; this is the second line of defense
        if (!within(root, dest)) {
          fail(new Error(`Entry ${entry.fileName} is outside of the target directory`));
          return;
        }
        if (isSymlink(entry)) {
          fail(new Error(`Entry ${entry.fileName} is a symbolic link, refusing to extract`));
          return;
        }

        const isDir = entry.fileName.endsWith('/');
        const parent = isDir ? dest : path.dirname(dest);
        try {
          fs.mkdirSync(parent, { recursive: true, mode: 0o755 });
          // a symlink that was already in the target dir must not lead us out of it
          if (!within(realRoot, fs.realpathSync(parent))) {
            fail(new Error(`Entry ${entry.fileName} resolves outside of the target directory`));
            return;
          }
          const existing = isDir ? null : fs.lstatSync(dest, { throwIfNoEntry: false });
          if (existing && existing.isSymbolicLink()) {
            fail(new Error(`Entry ${entry.fileName} would be written through a symbolic link`));
            return;
          }
        } catch (err) {
          fail(err);
          return;
        }
        if (isDir) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            fail(streamErr);
            return;
          }
          pipeline(readStream, fs.createWriteStream(dest, { mode: 0o644 }), (writeErr) => {
            if (writeErr) fail(writeErr);
            else zipfile.readEntry();
          });
        });
      });

      zipfile.readEntry();
    });
  });
}

module.exports = extractZip;
