var util = require('util');

module.exports.extend = function() {
  if (arguments.length <= 1 || 'object' != typeof arguments[0]) return;
  var destination = arguments[0];
  Array.prototype.slice.call(arguments, 1).forEach(function(source) {
    if ('object' == typeof source) extend(destination, source);
  });
}

function extend(dest, from) {
  var props = Object.getOwnPropertyNames(from);
  props.forEach(function (name) {
    if (typeof from[name] === 'object') {
      if (typeof dest[name] !== 'object') dest[name] = {};
      extend(dest[name], from[name]);
    } else {
      var destination = Object.getOwnPropertyDescriptor(from, name);
      Object.defineProperty(dest, name, destination);
    }
  });
}
