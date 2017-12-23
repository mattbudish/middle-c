#!/usr/bin/env node
'use strict'

const middleC = require('../lib/middle-c')
const path = require('path')
const program = require('commander')
  .version('0.0.1')
  .description('Generate JSON Schema for a given header file')
  .arguments('<file>')
  .option('-d, --directory <path>', 'Directory target file is located in.')
  .option('-I, --include <path>', 'Directory to search for additional include files.')
  .parse(process.argv)

if (program.args.length < 1) {
  program.help()
}

const modelsRootPath = program.directory || '.'

var opts = {
  filename: path.join(modelsRootPath, program.args[0]),
  module: 'Model',
  single_file: true,
  compiler_args: [
    '-Wno-pragma-once-outside-header',
    '-std=c++11',
    '-x',
    'c++'
  ]
}

if (program.include) {
  opts.compiler_args.push('-I' + program.include)
}

console.log(JSON.stringify(middleC.generate(opts).serialized, null, 4))
