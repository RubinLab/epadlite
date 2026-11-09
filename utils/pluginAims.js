const fs = require('fs-extra');
const path = require('path');

// recursively lists every .json file under dir as {path, file} (same shape as findFilesAndSubfilesInternal)
const listJsonFiles = (dir, found = []) => {
  fs.readdirSync(dir).forEach((name) => {
    const fullPath = path.join(dir, name);
    if (fs.statSync(fullPath).isDirectory()) {
      listJsonFiles(fullPath, found);
    } else if (name.toLowerCase().endsWith('.json')) {
      found.push({ path: dir, file: name });
    }
  });
  return found;
};

const isAimJson = (aimFile) => {
  try {
    const content = JSON.parse(fs.readFileSync(path.join(aimFile.path, aimFile.file), 'utf8'));
    return !!(content && content.ImageAnnotationCollection);
  } catch (err) {
    return false;
  }
};

// returns the aim json files found under the given folders. folders that do not exist are skipped
// and json files that are not aims are ignored
const collectPluginAimFiles = (dirs) => {
  const aimFiles = [];
  const seen = new Set();
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    listJsonFiles(dir).forEach((aimFile) => {
      const key = path.join(aimFile.path, aimFile.file);
      if (!seen.has(key) && isAimJson(aimFile)) {
        seen.add(key);
        aimFiles.push(aimFile);
      }
    });
  });
  return aimFiles;
};

module.exports = { collectPluginAimFiles };
