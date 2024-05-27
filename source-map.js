/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator =
  require("./lib/source-map-generator").SourceMapGenerator;
exports.SourceMapConsumer =
  require("./lib/source-map-consumer").SourceMapConsumer;
exports.SourceNode = require("./lib/source-node").SourceNode;

// Re-export the tag constants.
var tags = require('./lib/tags');
Object.getOwnPropertyNames(tags).forEach(function (tag) {
  Object.defineProperty(exports, tag, {
    writable: false,
    configurable: false,
    value: tags[tag]
  });
});
