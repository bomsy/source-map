/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

const Scopes = require("../lib/scopes").Scopes

/*
Original source:
```javascript
0 const n = 2;
1
2 function f(x, y = Math.max(x, n)) {
3   const n = 3;
4   console.log(y);
5   console.log(n);
6 }
7
8 f(1);
```

Generated source:
```javascript
0 const a = 2;
1
2 function b(c, d = Math.max(c, a)) {
3   const a = 3;
4   console.log(d);
5   console.log(a);
6 }
7
8 b(1);
```
*/

const scopeNames = ["n", "f", "x", "y", "a", "b", "c", "d"];
const encodedOriginalScopes = ["AACAAC,EUECCEG,AkCIAA,IC,AC,EK"];
const encodedGeneratedRanges = "AKAAOQ;;UKACSU,wBKACO;;;;C,A;;K";

const originalScopes = [
  {
    start: { sourceIndex: 0, line: 0, column: 0 },
    end: { sourceIndex: 0, line: 8, column: 5 },
    kind: "module",
    variables: ["n", "f"],
    children: [
      {
        start: { sourceIndex: 0, line: 2, column: 10 },
        end: { sourceIndex: 0, line: 6, column: 1 },
        kind: "function",
        name: "f",
        variables: ["x", "y"],
        children: [
          {
            start: { sourceIndex: 0, line: 2, column: 34 },
            end: { sourceIndex: 0, line: 6, column: 1 },
            kind: "block",
            variables: ["n"],
            children: []
          }
        ]
      },
    ]
  }
];

exports["test decoded scopes from sourcemap"] = function(assert) {
  const scopes = new Scopes();
  assert.equal(scopes.decodeOriginalScopes(encodedOriginalScopes, scopeNames), originalScopes);
};
