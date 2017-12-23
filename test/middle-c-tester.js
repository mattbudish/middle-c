const mc = require('../lib/middle-c')
const expect = require('chai').expect

describe('Main Test Suite', () => {
  it('Simple Test Case', () => {
    const opts = {
      filename: 'test/driver.h',
      module: 'Module',
      includes: ['examples'],
      compiler_args: ['-std=c++11', '-x', 'c++'],
      single_file: true
    }

    const serialized = {
      title: 'RaceCarDriver',
      type: 'object',
      properties: {
        name: {
          type: 'string',
          maxLength: 20
        },
        rank: {
          type: 'integer',
          format: 'int32'
        },
        flagStatus: {
          type: 'integer',
          format: 'int32'
        },
        catchPhrase: {
            type: 'string'
        },
        driversCar: {
          type: 'object',
          properties: {
            modelName: {
              type: 'string',
              maxLength: 80
            },
            weight: {
              type: 'number',
              format: 'double'
            },
            electric: {
              type: 'boolean'
            },
            dimensions: {
              type: 'array',
              items: {
                type: 'integer',
                format: 'int32'
              }
            }
          }
        }
      }
    }

    const output = {
      serialized: serialized,
      unmapped: []
    }
    return expect(mc.generate(opts)).to.deep.equal(output)
  })
})
