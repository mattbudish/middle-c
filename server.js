'use strict'

const program = require('commander')
  .version('0.0.1')
  .description('Generate JSON Schema for a given header file')
  .option('-p, --port <port>', 'Listen on a non-standard port')
  .option('-d, --directory <path>', 'Root directory of solution.')
  .parse(process.argv)

const path = require('path')
const express = require('express')
const morgan = require('morgan')
const middleC = require('./lib/middle-c')

const port = program.port || 80
const modelsRootPath = program.directory || '.'
var app = express()

app.use(morgan('short'))
  .use(express.static('public'))
  .get('/api/:fileName', (req, res) => {
    const opts = {
      filename: path.join(modelsRootPath, req.params.fileName),
      module: 'Model',
      single_file: true,
      compiler_args: [
        '-Wno-pragma-once-outside-header',
        '-std=c++11',
        '-x',
        'c++',
        '-I' + modelsRootPath
      ]
    }

    res.json(middleC.generate(opts).serialized)
  })
  .use((req, res, next) => {
    res.status(404).send("Sorry, can't find that!")
  })
  .use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).send('Something broke!')
  })
  .listen(port, () => console.log('Middle C listening on port', port))
