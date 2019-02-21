'use strict';

const {
  src,
  dest
} = require('gulp');
const ts = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const del = require('del');
const mochaC8 = require('gulp-mocha-c8');
const argv = require('yargs').argv;

exports.clean = function () {
  return del(['dist']);
}

exports.build = function () {
  const tsProject = ts.createProject('tsconfig.json');
  const tsResult = tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject());
  return tsResult.js
    .pipe(sourcemaps.write())
    .pipe(dest('dist'));
}
exports['build-test'] = function () {
  const tsProject = ts.createProject('tsconfig.test.json');
  const tsResult = tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject());
  return tsResult.js
    .pipe(sourcemaps.write())
    .pipe(dest('dist'));
}

exports.test = function () {
  return src([argv.src || 'dist/**.spec.js'], {
      read: false
    })
    .pipe(mochaC8({
      mochaOpts: {
        reporter: 'spec'
      },
      c8Opts: {
        coverageDirectory: './coverage',
        exclude: ['dist/**.spec.js']
      }
    }));
}