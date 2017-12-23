var libclang = require('libclang');
var Type = libclang.Type;

module.exports = function (type) {
  var ret = { type: '' };
  switch (type) {
    case Type.Bool:
      ret.type = 'boolean';
      break;
    case Type.UChar:
    case Type.SChar:
      ret.type = 'integer';
      ret.format = 'int8';
      break;
    case Type.UShort:
    case Type.Short:
      ret.type = 'integer';
      ret.format = 'int16';
      break;
    case Type.UInt:
    case Type.Int:
      ret.type = 'integer';
      ret.format = 'int32';
      break;
    case Type.Void:
    case Type.ULong:
    case Type.Long:
    case Type.ULongLong:
    case Type.LongLong:
      ret.type = 'integer';
      ret.format = 'int64';
      break;
    case Type.Float:
      ret.type = 'number';
      ret.format = 'float';
      break;
    case Type.Double:
      ret.type = 'number';
      ret.format = 'double';
      break;
    case Type.Char_S:
    case Type.Char_U:
      ret.type = 'string';
      break;
  }
  return ret;
};
module.exports.CString = { type: 'string' };
