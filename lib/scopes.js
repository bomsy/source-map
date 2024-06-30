/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

// Maybe replace with base64VLQ which already exists
const vlq = require("vlq"); 

class Scopes { 
  constructor() {
    // This is a Map of all the original scopes trees based on their original source indexes
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
    let sourceIndex = 0;
    for (const encodedOrignalScope of encodedOriginalScopes) {
      const originalScopeTree = this._decodeOriginalScope(encodedOrignalScope, names, sourceIndex);
      this.originalScopes.set(sourceIndex, originalScopeTree);
      sourceIndex++;
    }
    return this.originalScopes.values();
  }

  decodeGeneratedRanges(encodedGeneratedRanges, names) { 
    if (this.originalScopes.size == 0) { 
      throw new Error("No original scopes have been decoded");
    }
    const lines = encodedGeneratedRanges.split(";");
  }

  // This checks if the scope item is a start itmen or end item
  _isStartScopeItem(item) { 
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
    let rootScopeItem;
    let currentLine = 0;

    for (const item of items) { 
      if (this._isStartScopeItem(item)) {
        currentLine += item[0];
        const flags = item[3];
        const originalScopeItem = {
          start: { sourceIndex, line: currentLine, column: item[1] },
          kind: this._getScopeKind(item[2]),
          //flags: item[3], // what does this field mean ??
          variables: [],
          children: []
        };
        let i = 4;
        if (flags & 1) { 
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
        if (originalScopeItem) { 
          originalScopeItem.end = { sourceIndex, line: currentLine, column: item[1]};
        } else {
          throw new Error(`Invalid original scope: found end item without a start item`);
        }
        if (scopeItemsStack.length == 0) { 
          rootScopeItem = originalScopeItem;
        }
      }
    }
    return rootScopeItem;
  }

  _decodeGeneratedRange() { 

  }

}
exports.Scopes = Scopes;
