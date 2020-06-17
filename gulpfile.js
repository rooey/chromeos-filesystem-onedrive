const gulp = require('gulp');
const rm = require('rimraf');
const zip = require('gulp-zip');
const bump = require('gulp-bump');
const eslint = require('gulp-eslint');
const args = require('yargs').argv;

gulp.task('clean', done => {
  rm('./dist', done);
});

gulp.task('bump', function () {
  /// <summary>
  /// It bumps revisions
  /// Usage:
  /// 1. gulp bump : bumps the package.json and bower.json to the next minor revision.
  ///   i.e. from 0.1.1 to 0.1.2
  /// 2. gulp bump --version 1.1.1 : bumps/sets the package.json and bower.json to the 
  ///    specified revision.
  /// 3. gulp bump --type major       : bumps 1.0.0 
  ///    gulp bump --type minor       : bumps 0.1.0
  ///    gulp bump --type patch       : bumps 0.0.2
  ///    gulp bump --type prerelease  : bumps 0.0.1-2
  /// </summary>

  var type = args.type;
  var version = args.version;
  var options = {};
  var msg = args.msg;

  if (version) {
      options.version = version;
      msg += ' to ' + version;
  } else {
      options.type = type;
      msg += ' for a ' + type;
  }

  return gulp
    .src(['package.json', 'src/manifest.json'], {base: './'})
    .pipe(bump(options))
    .pipe(gulp.dest('./'))
});

gulp.task('copy-src-files', () => {
  return gulp.src([
    './src/scripts/**/*.js',
    './src/styles/**/*.css',
    './src/icons/**/*.png',
    './src/_locales/**/*.json',
    './src/window.html',
    './src/manifest.json'
], {
    base: 'src'
  }).pipe(gulp.dest('./dist'));
});

gulp.task('copy-dependent-files', () => {
  return gulp.src([
    './node_modules/jquery/dist/jquery.min.js',
    './node_modules/raven-js/dist/raven.js',
    './node_modules/bootstrap/dist/js/bootstrap.js',
    './node_modules/jquery-toast-plugin/dist/jquery.toast.min.js',
    './node_modules/bootstrap/dist/css/bootstrap.css',
    './node_modules/jquery-toast-plugin/dist/jquery.toast.min.css',
    './node_modules/bootstrap/dist/fonts/**/*'
], {
    base: 'node_modules'
  }).pipe(gulp.dest('./dist/node_modules'));
});

gulp.task('copy-files', gulp.parallel('copy-src-files', 'copy-dependent-files'));

gulp.task('package', () => {
  const manifest = require('./dist/manifest.json');
  const version = manifest.version;
  return gulp.src('./dist/**/*').pipe(zip(`chromeos-filesystem-onedrive-${version}.zip`)).pipe(gulp.dest('./package'));
});

gulp.task('watch', () => {
  gulp.watch('./src/**/*', gulp.task('default'));
});

gulp.task('lint', () => {
  return gulp.src([
    './src/scripts/*.js'
  ]).pipe(eslint({
    useEslintrc: true,
    fix: true
  })).pipe(eslint.format()).pipe(eslint.failAfterError());
});

gulp.task('default', gulp.series('clean', 'lint', 'copy-files', 'package'));
