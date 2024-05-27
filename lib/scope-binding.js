/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

/**
   * Encode a new binding in the source map being generated.
   *
   * @param SourceMapGenerator generator
   *        The generator for the source map being created.
   * @param {SourceMapGenerator|Scope} parent
   *        The parent of this binding. The SourceMapGenerator itself if this is
   *        a top level, global binding. Otherwise, this binding's parent scope.
   * @param {Object} args
   *        An object of the form specified by `SourceMapGenerator.prototype.addBinding`.
   */
class Binding{
  constructor(generator, parent, aArgs) {
    this._generator = generator;
    this._type = util.getArg(aArgs, 'type');

    var name = util.getArg(aArgs, 'name');
    generator.names.add(name);
    this._name = generator.names.indexOf(name);

    var value = util.getArg(aArgs, 'value');
    generator.names.add(value);
    this._value = generator.names.indexOf(value);

    parent._bindings.push(this);
  };

  /**
   * Serialize this binding into the format used by the `x_env` property on a
   * source map.
   */
  serialize(serializeContext) {
    if (serializeContext.usingAbbreviations) {
      return this._serializeAbbreviated(serializeContext);
    }

    var str = '';
    str += base64VLQ.encode(tags.RECORD_BINDING);

    str += base64VLQ.encode(tags.PROPERTY_TYPE);
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_TYPE,
                                                   this._type));

    str += base64VLQ.encode(tags.PROPERTY_NAME);
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_NAME,
                                                   this._name));

    str += base64VLQ.encode(tags.PROPERTY_VALUE);
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_VALUE,
                                                   this._value));

    str += base64VLQ.encode(tags.RECORD_DONE);
    return str;
  };

  _serializeAbbreviated(serializeContext) {
    var abbreviationId = this._generator.ensureAbbreviationDefinition(
      tags.RECORD_BINDING,
      [
        tags.PROPERTY_TYPE,
        tags.PROPERTY_NAME,
        tags.PROPERTY_VALUE
      ]
    );

    var str = '';
    str += base64VLQ.encode(tags.RECORD_ABBREVIATED);
    str += base64VLQ.encode(abbreviationId);

    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_TYPE,
                                                   this._type));
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_NAME,
                                                   this._name));
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_VALUE,
                                                   this._value));

    str += base64VLQ.encode(tags.RECORD_DONE);
    return str;
  };