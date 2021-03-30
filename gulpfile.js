const gulp = require('gulp');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

const git = require('gulp-git');

const stringify = require('json-stringify-pretty-compact');

function getManifest() {
  const json = {};


  const modulePath = 'module.json';

  if (fs.existsSync(modulePath)) {
    json.file = fs.readJSONSync(modulePath);
    json.name = 'module.json';
  } else {
    return;
  }

  return json;
}

function getConfig() {
  const configPath = 'foundryconfig.json';
  let config;

  if (fs.existsSync(configPath)) {
    config = fs.readJSONSync(configPath);
    return config;
  } else {
    return;
  }
}

/********************/
/*		BUILD		*/
/********************/
/**
 * Copy static files
 */
async function copyFiles() {
  const statics = ['images', 'module.json', 'packs', 'README.md'];
  try {
    for (const file of statics) {
      if (fs.existsSync(file)) {
        await fs.copy(file, path.join('dist', file));
      }
    }
    return Promise.resolve();
  } catch (err) {
    Promise.reject(err);
  }
}

/**
 * Watch for changes for each build step
 */
function buildWatch() {
  gulp.watch(['module.json'], { ignoreInitial: false }, copyFiles);
}

/********************/
/*		CLEAN		*/
/********************/

/**
 * Remove built files from `dist` folder
 * while ignoring source files
 */
async function clean() {
  const name = path.basename(path.resolve('.'));
  const files = [];

  // If the project uses TypeScript
  if (fs.existsSync(path.join('src', `${name}.ts`))) {
    files.push('lang', 'templates', 'assets', 'module', `${name}.js`, 'module.json', 'system.json', 'template.json');
  }

  // If the project uses Less or SASS
  if (fs.existsSync(path.join('src', `${name}.less`)) || fs.existsSync(path.join('src', `${name}.scss`))) {
    files.push('fonts', `${name}.css`);
  }

  // Attempt to remove the files
  try {
    for (const filePath of files) {
      await fs.remove(path.join('dist', filePath));
    }
    return Promise.resolve();
  } catch (err) {
    Promise.reject(err);
  }
}


/*********************/
/*		PACKAGE		 */
/*********************/

/**
 * Update version and URLs in the manifest JSON
 */
function updateManifest(cb) {
  const packageJson = fs.readJSONSync('package.json');
  const config = getConfig(),
    manifest = getManifest(),
    rawURL = config.rawURL,
    repoURL = config.repository,
    manifestRoot = manifest.root;

  if (!config) cb(Error('foundryconfig.json not found'));
  if (!manifest) cb(Error('Manifest JSON not found'));
  if (!rawURL || !repoURL) cb(Error('Repository URLs not configured in foundryconfig.json'));

  try {
    const version = packageJson.version;

    /* Update version */

    const versionMatch = /^(\d{1,}).(\d{1,}).(\d{1,})$/;
    const currentVersion = manifest.file.version;
    let targetVersion = '';

    if (!version) {
      cb(Error('Missing version number'));
    }
    
    if (versionMatch.test(version)) {
      targetVersion = version;
    } else {
      targetVersion = currentVersion.replace(versionMatch, (substring, major, minor, patch) => {
        console.log(substring, Number(major) + 1, Number(minor) + 1, Number(patch) + 1);
        if (version === 'major') {
          return `${Number(major) + 1}.0.0`;
        } else if (version === 'minor') {
          return `${major}.${Number(minor) + 1}.0`;
        } else if (version === 'patch') {
          return `${major}.${minor}.${Number(patch) + 1}`;
        } else {
          return '';
        }
      });
    }

    if (targetVersion === '') {
      return cb(Error('Error: Incorrect version arguments.'));
    }

    if (targetVersion === currentVersion) {
      return cb(Error('Error: Target version is identical to current version.'));
    }
    console.log(`Updating version number to '${targetVersion}'`);

    manifest.file.version = targetVersion;

    /* Update URLs */

    manifest.file.url = repoURL;
    manifest.file.manifest = `${repoURL}/releases/latest/download/module.json`;
    manifest.file.download = `${repoURL}/releases/download/v${targetVersion}/module.zip`;

    const prettyProjectJson = stringify(manifest.file, {
      maxLength: 35,
      indent: '\t',
    });

    fs.writeJSONSync('package.json', packageJson, { spaces: '\t' });
    fs.writeFileSync(manifest.name, prettyProjectJson, 'utf8');

    return cb();
  } catch (err) {
    cb(err);
  }
}

function gitCommit() {
  return gulp.src('./*').pipe(
    git.commit(`version bump v${getManifest().file.version}`, {
      args: '-a',
      disableAppendPaths: true,
    })
  );
}

function gitTag() {
  const manifest = getManifest();
  return git.tag(`v${manifest.file.version}`, `Updated to ${manifest.file.version}`, (err) => {
    if (err) throw err;
  });
}

const execGit = gulp.series(
  //gitAdd,
  gitCommit,
  gitTag
);

const execBuild = gulp.parallel(copyFiles);

exports.build = gulp.series(clean, execBuild);
exports.watch = buildWatch;
exports.clean = clean;
exports.update = updateManifest;
exports.publish = gulp.series(updateManifest, execGit);
