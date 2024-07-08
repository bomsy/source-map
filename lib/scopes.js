/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

// Maybe replace with base64VLQ which already exists
const vlq = require("vlq");
const originalScopeFlags = {
  HAS_NAME: 0x1
};

const generatedRangeFlags = {
  HAS_DEFINITION: 0x1,
  HAS_CALLSITE: 0x2,
  IS_SCOPE: 0x4,
};

class Scopes { 
  constructor() {
    // This is a Map of all the original scopes trees based on their original scope indexes
    this.originalScopes = new Map();
    // A tree of all the generated ranges
    this.generatedRanges = null;
  }

  /**
   * Decodes the encoded VLQ string of the original scopes
   * @param {String} encodedOriginalScopes -
   * @param {Array} names - Array of function and binding names
   * 
   **/
  decodeOriginalScopes(encodedOriginalScopes, names) { 
    for (const [sourceIndex, encodedOrignalScope] of encodedOriginalScopes.entries()) {
      const originalScope = this._decodeOriginalScope(encodedOrignalScope, names, sourceIndex);
      this.originalScopes.set(sourceIndex, originalScope);
    }
  }

  decodeGeneratedRanges(encodedGeneratedRanges, names) { 
    if (this.originalScopes.size == 0) { 
      throw new Error("No original scopes have been decoded");
    }
    const encodedLines = encodedGeneratedRanges.split(";");
    this.generatedRanges = this._decodeGeneratedRanges(encodedLines);
  }

  // This checks if the scope item is a start itmen or end item
  _isStartItem(item) {
    // Thought: A start item can also be determined by a field that would neever exist
    // in the end item.
    return item.length > 2;
  }

  // This returns the type of the scope
  _getScopeKind(kind) {
    const scopeKinds = { 
      0x1: "global",
      0x2: "function",
      0x3: "class",
      0x4: "block"
    }
    const kindName = scopeKinds[kind];
    if (!kindName) { 
      throw new Error(`Invalid scope kind ${kind}`);
    }
    return kindName;
  }

  _decodeOriginalScope(encodedOrignalScope, names, sourceIndex) { 
    const items = encodedOrignalScope.split(",").map(vlq.decode);
    const scopeItemsStack = [];
    // Allows access to the scope items
    const scopeItemsByIndex = new Map();
    // caches the line of the last produced item as
    let currentLine = 0;

    for (const [index, item] of items.entries()) { 
      if (this._isStartItem(item)) {
        currentLine += item[0];

        const originalScopeItem = {
          start: { sourceIndex, line: currentLine, column: item[1] },
          kind: this._getScopeKind(item[2]),
          variables: [],
          children: []
        };
        let i = 4;
        const flags = item[3];
        if (flags & originalScopeFlags.HAS_NAME) { 
          originalScopeItem.name = names[item[i]];
          i++;
        };
        // The rest of the VLQ numbers represent the variables
        while (i < item.length) { 
          originalScopeItem.variables.push(names[item[i]]);
          i++
        }

        // If there is a previous start item on the stack, 
        // this start item definately a child
        if (scopeItemsStack[scopeItemsStack.length - 1]) { 
          scopeItemsStack[scopeItemsStack.length - 1].children.push(originalScopeItem);
        }
        // Goes onto the scope until its corresponding end item is found
        scopeItemsStack.push(originalScopeItem);
      } else { 
        const originalScopeItem = scopeItemsStack.pop();
        currentLine += item[0];
        if (!originalScopeItem) { 
          throw new Error(`Invalid original scope: found end item without a start item`);
        }
        originalScopeItem.end = { sourceIndex, line: currentLine, column: item[1] };
        scopeItemsByIndex.set(index, originalScopeItem);
        if (scopeItemsStack.length == 0) { 
          return { root: originalScopeItem, scopeItemsByIndex };
        }
      }
    }
    return null;
  }

  _decodeGeneratedRanges(encodedLines) {
    const rangeItemStack = [];

    let currentColumn = 0;
    let currentDefinitionSourceIndex = 0;
    let currentCallsiteSourceIndex = 0;
    let currentCallsiteLine = 0;
    let currentCallsiteColumn = 0;
    let currentScopeIndex = 0;

    for (const [line, encodedLine] of encodedLines.entries()) {
      const items = encodedLine.split(",").map(vlq.decode);
      for (const item of items) {
        if (this._isStartItem(item)) {
          let i = 0;
          currentColumn += item[i];
          const flags = item[++i];
        
          const generatedRangeItem = {
            start: { line, column: currentColumn },
            isScope: !!(flags & generatedRangeFlags.IS_SCOPE),
            bindings: [],
            children: []
          };

          if (flags & generatedRangeFlags.HAS_DEFINITION) {
            currentDefinitionSourceIndex += item[++i];
            // If the source index is 0, this means that source is the same as the previous source
            // therefore the scope index is relative to the previous scope index.
            currentScopeIndex = item[++i] + (currentDefinitionSourceIndex == 0 ? currentScopeIndex : 0);
            const originalScopeTree = this.originalScopes.get(currentDefinitionSourceIndex);
            const originalScope = originalScopeTree.scopeItemsByIndex.get(currentScopeIndex);
            generatedRangeItem.originalScope = currentScopeIndex;
          }
          // The callsite is set when the function is inlined
          if (flags & generatedRangeFlags.HAS_CALLSITE) {
            currentCallsiteSourceIndex += item[++i];
            const callsiteLine = item[++i];
            currentCallsiteLine = callsiteLine + (currentCallsiteSourceIndex == 0 ? currentCallsiteLine : 0);
            currentCallsiteColumn = item[++i] +
              (currentCallsiteSourceIndex == 0 && callsiteLine == 0 ? currentCallsiteColumn : 0);
          
            generatedRangeItem.callsite = {
              sourceIndex: currentCallsiteSourceIndex,
              line: currentCallsiteLine,
              column: currentCallsiteColumn,
            };
          }

          // The rest of the VLQ numbers represent the bindings
          this._resolveBindings();

           // If there is a previous start item on the stack, this start item definately a child
          if (rangeItemStack[rangeItemStack.length - 1]) {
            rangeItemStack[rangeItemStack.length - 1].children.push(generatedRangeItem);
          }

          rangeItemStack.push(generatedRangeItem);
        } else {
          const generatedRangeItem = rangeItemStack.pop();
          if (!generatedRangeItem) {
            throw new Error(`Invalid generated range item: found end item without a start item`);
          }
          generatedRangeItem.end = { line, column: item[1] };
          if (rangeItemStack.length == 0) {
            return generatedRangeItem;
          }
        }
      }
    }
    return null;
  }

  _resolveBindings() { 

  }

}
exports.Scopes = Scopes;
