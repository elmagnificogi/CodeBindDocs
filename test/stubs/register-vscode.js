'use strict';

/**
 * Intercept `require('vscode')` / import for Node unit tests.
 */
const Module = require('module');
const path = require('path');

const stub = path.join(__dirname, 'vscode-stub.js');
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return originalLoad.call(this, stub, parent, isMain);
  }
  return originalLoad.apply(this, arguments);
};
