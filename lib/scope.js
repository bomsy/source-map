/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

/**
   * Represents a lexical scope in the source map being generated.
   *
   * @param SourceMapGenerator generator
   *        The generator for the source map being created.
   * @param {SourceMapGenerator|Scope} parent
   *        The parent of this scope. The SourceMapGenerator itself if this is a
   *        top level scope. Otherwise, this scope's parent scope.
   * @param {Object} args
   *        An object of the form specified by `SourceMapGenerator.prototype.addScope`.
   */
class Scope {
  constructor(generator, parent, args) {
    this._type = util.getArg(args, 'type');
    this._bindings = [];
    this._scopes = new RedBlackTree(Scope.compare);
    this._name = null;
    this._start = null;
    this._end = null;
    this._generator = generator;

    var start = util.getArg(args, 'start');
    var mappings = generator._getMappings();
    var idx = binarySearch(start, mappings, function (a, b) {
      return util.compareByGeneratedPositionsInflated(a, b, true);
    });
    if (idx === -1) {
      throw new Error("Bad scope starting boundary: there must be a " +
                      "corresponding mapping in the SourceMapGenerator.");
    }
    this._start = mappings[idx];

    var end = util.getArg(args, 'end');
    idx = binarySearch(end, mappings, function (a, b) {
      return util.compareByGeneratedPositionsInflated(a, b, true);
    });
    if (idx === -1) {
      throw new Error("Bad scope ending boundary: there must be a " +
                      "corresponding mapping in the SourceMapGenerator");
    }
    this._end = mappings[idx];

    var name = util.getArg(args, 'name', null);
    if (name) {
      generator.names.add(name);
      this._name = generator.names.indexOf(name);
    }

    parent._scopes.insert(this);
  }

  /**
   * Compare two sibling Scope objects by their start positions. We needn't
   * worry about end positions because sibling scopes mustn't overlap.
   */
  compare(a, b) {
    return util.compareByGeneratedPositionsInflated(a._start, b._start, true);
  };

  /**
   * Add a child scope that is enclosed within this one.
   *
   * @see SourceMapGenerator.prototype.addScope
   */
  addScope(args) {
    return new Scope(this._generator, this, args);
  };

  /**
   * Add a binding within this scope.
   *
   * @see SourceMapGenerator.prototype.addBinding
   */
  addBinding(args) {
    return new Binding(this._generator, this, args);
  };

  ensureAbbreviationDefinition(recordType, properties) {
    return this._generator.ensureAbbreviationDefinition(recordType, properties);
  };

  _assertChildScopesAreContainedAndNonOverlapping() {
    var lastChildScopeEnd = null;
    this._scopes.inOrderWalk(function (s) {
      if (lastChildScopeEnd) {
        if (util.compareByGeneratedPositionsInflated(lastChildScopeEnd, s._start, true) >= 0) {
          throw new Error("Child scopes must be non-overlapping");
        }
        lastChildScopeEnd = s._end;

        if (Scope.compareContained(s._start, s.getParentScope()) !== 0 ||
            Scope.compareContained(s._end, s.getParentScope()) !== 0) {
          throw new Error("Child scopes must be wholly contained within their parent scope");
        }
      }
    });
  };

  /**
   * Serialize this scope, its bindings, and child scopes into the format used
   * by the `x_env` property on a source map.
   */
  serialize(serializeContext) {
    var mappings = this._generator._getMappings();

    var startIdx = binarySearch(this._start, mappings, function (a, b) {
      return util.compareByGeneratedPositionsInflated(a, b, true);
    });
    var endIdx = binarySearch(this._end, mappings, function (a, b) {
      return util.compareByGeneratedPositionsInflated(a, b, true);
    });

    if (serializeContext.usingAbbreviations) {
      return this._serializeAbbreviated(serializeContext, startIdx, endIdx);
    }

    var str = '';
    str += base64VLQ.encode(tags.RECORD_SCOPE);

    str += base64VLQ.encode(tags.PROPERTY_TYPE);
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_TYPE,
                                                   this._type));

    str += base64VLQ.encode(tags.PROPERTY_START);
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_START,
                                                   startIdx));

    str += base64VLQ.encode(tags.PROPERTY_END);
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_END,
                                                   endIdx));

    if (this._name !== null) {
      str += base64VLQ.encode(tags.PROPERTY_NAME);
      str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                     tags.PROPERTY_NAME,
                                                     this._name));
    }

    str += this._serializeChildren(serializeContext);
    str += base64VLQ.encode(tags.RECORD_DONE);
    return str;
  };

  Scope.prototype._serializeAbbreviated = function (serializeContext, startIdx, endIdx) {
    var properties = [
      tags.PROPERTY_TYPE,
      tags.PROPERTY_START,
      tags.PROPERTY_END
    ];
    if (this._name !== null) {
      properties.push(tags.PROPERTY_NAME);
    }

    var abbreviationId = this._generator.ensureAbbreviationDefinition(tags.RECORD_SCOPE,
                                                                      properties);

    var str = '';
    str += base64VLQ.encode(tags.RECORD_ABBREVIATED);
    str += base64VLQ.encode(abbreviationId);

    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_TYPE,
                                                   this._type));
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_START,
                                                   startIdx));
    str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                   tags.PROPERTY_END,
                                                   endIdx));

    if (this._name !== null) {
      str += base64VLQ.encode(getRelativeToLastValue(serializeContext,
                                                     tags.PROPERTY_NAME,
                                                     this._name));
    }

    str += this._serializeChildren(serializeContext);
    str += base64VLQ.encode(tags.RECORD_DONE);
    return str;
  };

  Scope.prototype._serializeChildren = function (serializeContext) {
    var str = '';

    if (this._bindings.length || this._scopes.size()) {
      str += base64VLQ.encode(tags.RECORD_CHILDREN);

      for (var i = 0; i < this._bindings.length; i++) {
        str += this._bindings[i].serialize(serializeContext);
      }

      if (!serializeContext.skipValidation) {
        this._assertChildScopesAreContainedAndNonOverlapping();
      }
      this._scopes.inOrderWalk(function (node) {
        str += node.value.serialize(serializeContext);
      });
    }

    return str;
  };