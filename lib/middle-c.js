const assert = require('assert')
const path = require('path')
const _ = require('lodash')

const libclang = require('libclang')

const Cursor = libclang.Cursor
const Index = libclang.Index
const TranslationUnit = libclang.TranslationUnit
const Type = libclang.Type

/*
 * Accepts an object as defined below
 * opts.filename -- required -- the full path to the header source file to parse
 * opts.includes -- optional -- a set of directory paths to aid type expansion
 * opts.compiler_args -- optional -- a set of clang command line options passed to the parser
 *
 * returns an object with the following fields
 * unmapped -- an array where each element object describes a function that failed to map
 *   position -- indicates which field failed to map, -1 is return value, otherwise argument index
 *   arg -- the kind of type in question
 *   name -- the spelling of the function
 *   decl -- the method signature (excluding the result type)
 * serialized -- string representation of the types and module [eval or save]
 */
const generate = function (opts) {
  const schemaMapType = require('./json-type-map')

  var rootObject = {}
  var fname = path.normalize(opts.filename)
  var includes = opts.includes || []
  var compilerArgs = []
  var singleFile = opts.single_file || false

  var idx = new Index(true, true)
  var tu

  if (opts.compiler_args) {
    compilerArgs = opts.compiler_args.slice(0)
  }

  includes.forEach(function (include) {
    compilerArgs.push('-I' + include)
  })

  tu = TranslationUnit.fromSource(idx, fname, compilerArgs)

  var curs = tu.cursor

  var unmapped = []
  var structs = {}
  var enums = {}

  var toRender = {
    enums: [],
    types: [],
    functions: []
  }

  var WrapType = function (name) {
    this.name = name
    this.type = name
    this.abort = false
    this.opaque = false
    this.arrSize = false
    this.return_type = undefined
    this.args = []
    this.elements = []
    this.unionCount = 0
  }

  /* For a given Typedef try and iterate fields and define an FFI struct */
  var defineType = function (type, unionName) {
    /* We've previously defined this type
     * TODO XXX FIXME? wanted to use type.usr since it's relevant per translation unit
     * but using just the regular spelling makes things nicer for accessibility
     */
    var name = type.spelling
    var wrap
    var currObject

    if (!name && unionName) {
      name = unionName
    }

    if (!name && type.usr) {
      // TODO XXX FIXME we probably have a record here and are hacking our way
      // to find out its name
      name = type.usr.split('@').slice(-1)[0]
    }

    if (!name) {
      // console.error(name, !name, type.spelling, type.usr);
      return undefined
    }

    wrap = structs[name]

    if (wrap) {
      return wrap
    }

    wrap = new WrapType(name)

    if (currObject === undefined) {
      currObject = {}
    }

    var first = true
    type.visitChildren(function (parent) {
      var ret, t, tname
      /* First item in the cursor is the one we started with?
       * immediately move beyond it
       */
      // console.error('visiting', this.kind, this.spelling, parent.kind, parent.spelling);

      if (first && this.kind === Cursor.StructDecl) {
        first = false
        return Cursor.Recurse
      }

      if (this.kind === Cursor.UnionDecl) {
        var un = this.type.declaration.spelling || 'union' + wrap.unionCount++
        // console.error('UnionDecl', un, this.kind);
        var union = defineType(this.type.declaration, un)
        if (union) {
          union.kind = 'union'
          wrap.elements.push(union)
        } else {
          return Cursor.Continue
        }
      }

      if (
        this.kind === Cursor.CXXAccessSpecifier ||
        this.kind === Cursor.TemplateTypeParameter) {
        return Cursor.Continue
      }

      /* TODO XXX FIXME?
       * If the current position of the cursor has an empty string, we're
       * probably still at the start of the struct/typedef
       */
      if (this.spelling) {
        /* Potentially some recursion here -- if this type depends on a type
         * a type we have yet to define this call should recurse until we're
         * in a sane state -- undefined if we can't map the type.
         */
        if (this.kind === Cursor.TypeRef) {
          t = mapType(this.referenced.type, this.referenced.spelling)
          tname = this.referenced.spelling
        } else if (this.kind === Cursor.UnexposedDecl) {
          t = mapType(this.type, this.type.spelling)
          tname = this.type.spelling
        } else if (this.kind === Cursor.FieldDecl && this.type.kind === Type.Unexposed) {
          // console.error('FieldDecl', this.type.kind, this.type.spelling);
          t = wrap.elements[wrap.elements.length - 1]
          /* This may not be entirely correct, we're assuming that because we
           * already have elements defined that we're at the name of it,
           * consider `union { int foo; } myUnion;` but it's also possible
           * we are at an actual definition and we should be defining this type
           *
           * TODO -- man I need tests.
           */
          if (t) {
            t.name = this.spelling
            return Cursor.Continue
          } else {
            t = defineType(this.type.declaration)
            tname = this.spelling
          }
        } else if (
          this.kind === Cursor.CXXMethod ||
          this.kind === Cursor.Constructor ||
          this.kind === Cursor.Destructor) {
          return Cursor.Continue
        } else if (this.kind === Cursor.NamespaceRef) {
          return Cursor.Recurse
        } else if (this.kind === Cursor.TemplateRef) {
          t = defineType(this.referenced)
          tname = this.referenced.spelling
        } else {
          t = mapType(this.type, this.spelling)
          tname = _.camelCase(this.spelling)
        }
        if (!t) {
          /* This type has an element we don't know how to map yet, abort */
          wrap.abort = {
            name: tname
          }
          // console.error('breaking because of unmapped type', tname, this.kind);
          ret = Cursor.Break
        } else {
          currObject[tname] = t.type

          /* Add the field for the struct */
          wrap.elements.push({
            name: tname,
            type: t.kind === 'struct' ? t.name : t.type || t.name
          })
          ret = Cursor.Continue
        }
      } else if (this.kind === Cursor.UnexposedDecl || this.kind === Cursor.UnexposedAttr) {
        // console.error('unexposed decl', this.type.spelling);
        ret = Cursor.Continue
      } else if (this.type.kind === Cursor.BlockExpr) {
        // console.error('block expr');
        ret = Cursor.Continue
      } else {
        // console.error('breaking because of unknown kind', this.type.kind, this.kind);
        wrap.abort = {
          kind: this.type.kind
        }
        ret = Cursor.Break
      }
      first = false
      return ret
    })

    /* types should probably contain at least one type, and don't claim to support partially defined types */
    if (!wrap.abort && wrap.elements.length > 0) {
      if (!unionName) {
        wrap.type = { type: 'object', 'properties': currObject }
        wrap.kind = 'struct'
        toRender.types.push(wrap)
        structs[wrap.name] = wrap
      } else {
        wrap.type = wrap
        wrap.kind = 'union'
      }
      return wrap
    } else {
      console.error(wrap)
      return undefined
    }
  }

  var mapEnum = function (type, ret) {
    var def
    type.visitChildren(function (parent) {
      var val

      if (ret.name[0] === 'u') {
        val = this.enumUValue
      } else {
        val = this.enumValue
      }

      def = enums[parent.spelling]
      if (!def) {
        def = enums[parent.spelling] = {}
      }

      def[this.spelling] = val

      return Cursor.Continue
    })
    // console.error(def);
  }

  var defineOpaque = function (canonical) {
    let ret = new WrapType(canonical)
    ret.opaque = true
    if (!structs[ret.name]) {
      toRender.types.push({
        name: ret.name,
        type: ret
      })
      structs[ret.name] = ret
    }
    return ret
  }

  var defineFunction = function (name, type) {
    // console.error('defining function', name);

    var ret = new WrapType(name)

    var result = mapType(type.result, name)

    if (!result) {
      // console.error('could not map return type', type.result.spelling);
      ret.abort = {
        name: name,
        arg: type.result.spelling,
        position: -1,
        kind: type.declaration.spelling
      }
      return ret
    }

    ret.result = result.name

    var i, arg, a
    for (i = 0; i < type.argTypes; i++) {
      a = type.getArg(i)

      // console.error('mapping argument', i);
      arg = mapType(a, name + '-arg' + i)
      if (!arg) {
        ret.abort = {
          name: name,
          displayname: a.declaration.displayname,
          arg: a.spelling,
          position: i
        }
        return ret
      }
      ret.args.push(arg)
    }

    return ret
  }

  var mapType = function (type, fieldname) {
    var ret

    // type 119 is "Elaborated", which is not defined in this version of libclang.
    if ((type.kind === Type.Pointer && type.pointeeType.kind === Type.Char_S) ||
      (type.kind === 119 && type.canonical.declaration.spelling === 'basic_string')) {
      ret = new WrapType(schemaMapType.CString)
    } else {
      switch (type.kind) {
        case Type.Typedef:
          /* Handle the case where someone has simply redefined an existing type */
          var canonical = type.canonical

          if (canonical.kind === Type.Pointer && canonical.declaration.kind === Cursor.NoDeclFound &&
            type.declaration.spelling) {
            if (canonical.pointeeType.kind === Type.FunctionProto) {
              ret = structs[type.declaration.spelling]
              if (!ret) {
                ret = defineFunction(type.declaration.spelling, canonical.pointeeType)
                if (!ret.abort) {
                  toRender.types.push({
                    name: ret.name
                  })
                  structs[type.declaration.spelling] = ret
                } else {
                  unmapped.push(ret.abort)
                  return undefined
                }
              }
              return ret
            } else {
              ret = defineType(canonical.pointeeType.declaration)
              if (ret) {
                return new WrapType(ret.name + 'Ptr')
              } else {
                return defineOpaque(type.declaration.spelling)
              }
            }
          }
          canonical = mapType(canonical, fieldname)

          if (canonical) {
            ret = canonical
          } else { /* If this is a struct try and create */
            ret = defineType(type.declaration)
          }
          break
        case Type.Unexposed:
          /* Special case enums so we can pass them around as integer type */
          if (type.declaration.kind === Cursor.EnumDecl) {
            ret = mapType(type.declaration.enumType, fieldname)
            mapEnum(type.declaration, ret)
          } else if (
            type.declaration.kind === Cursor.StructDecl ||
            type.declaration.kind === Cursor.ClassDecl ||
            type.declaration.kind === Cursor.ClassTemplate) {
            ret = defineType(type.declaration)
          }
          break
        case Type.Enum:
          ret = mapType(type.declaration.enumType, fieldname)
          mapEnum(type.declaration, ret)
          break
        case Type.Pointer:
          ret = mapType(type.pointeeType, fieldname)

          if (!ret) {
            if (type.pointeeType.declaration.kind === Cursor.TypedefDecl && type.pointeeType.declaration.spelling) {
              ret = defineOpaque(type.pointeeType.declaration.spelling)
            } else {
              ret = {
                type: '',
                name: ''
              }
            }
          } else {
            ret = new WrapType(ret.name + 'Ptr')
          }
          break
        case Type.ConstantArray:
          // Arrays of chars become strings.
          // Arrays of one int 64 are assumed to be dates.
          // TODO: Map dates in a better way.
          if (type.elementType.kind === Type.Char_S) {
            ret = new WrapType({ type: 'string', maxLength: type.arraySize })
          } else if (type.elementType.canonical.kind === Type.Long && type.arraySize === 1) {
            ret = new WrapType({ type: 'string', format: 'date-time', default: new Date(0).toJSON() })
          } else {
            ret = mapType(type.elementType, fieldname)

            if (!ret) {
              ret = defineType(type.elementType.declaration)
            }

            ret.arrSize = type.arraySize
            ret.type = { type: 'array', items: ret.type }
          }
          break
        case Type.Record:
          ret = defineType(type.declaration)
          break
        case Type.Elaborated:
          ret = mapType(type.namedType, fieldname)
          break
        default:
          ret = schemaMapType(type.kind)

          if (ret !== undefined) {
            ret = new WrapType(ret)
          }
          assert(type.kind !== 0)
          break
      }
    }

    return ret
  }

  /*
   * Main source traversal -- We're only concerned with wrapping types.
   */
  curs.visitChildren(function tuVisitor (parent) {
    if (singleFile && path.normalize(this.location.presumedLocation.filename) !== fname) {
      return Cursor.Continue
    }

    switch (this.kind) {
      case Cursor.ClassDecl:
      case Cursor.StructDecl:
        var result = defineType(this)
        if (result.abort) {
          unmapped.push(result.abort)
        } else {
          rootObject['title'] = _.upperFirst(_.camelCase(this.spelling))
          Object.assign(rootObject, result.type)
        }

        break
    }

    return Cursor.Recurse
  })

  // tu.dispose();
  idx.dispose()

  Object.keys(enums).forEach(function (e) {
    var ee = { name: e, values: [] }
    Object.keys(enums[e]).forEach(function (vname) {
      ee.values.push({
        name: vname,
        value: enums[e][vname]
      })
    })
    toRender.enums.push(ee)
  })

  return {
    unmapped: unmapped,
    serialized: rootObject
  }
}

exports.generate = generate

exports.asyncGenerate = (opts) => {
  return new Promise((resolve, reject) => {
    var result = generate(opts)
    if (result.unmapped.length === 0) {
      return resolve(result.serialized)
    } else {
      return reject(new Error('Unable to map the following elements: ' + result.unmapped))
    }
  })
}
