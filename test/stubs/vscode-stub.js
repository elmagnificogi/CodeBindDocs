/**
 * Minimal vscode stub so Node unit tests can `require('vscode')` when loading src modules.
 * Only implements what module top-level / light helpers need.
 */
const vscode = {
  Uri: {
    file(p) {
      return { fsPath: p, scheme: 'file', path: p.replace(/\\/g, '/') };
    },
    joinPath(base, ...parts) {
      const sep = '/';
      const root = (base.fsPath || base.path || '').replace(/\\/g, '/');
      return {
        fsPath: [root, ...parts].join(sep).replace(/\/+/g, '/'),
        scheme: 'file',
        path: [root, ...parts].join(sep).replace(/\/+/g, '/'),
      };
    },
  },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration() {
      return {
        get(_key, defaultValue) {
          return defaultValue;
        },
      };
    },
    fs: {
      async readFile() {
        return Buffer.from('');
      },
      async writeFile() {},
      async createDirectory() {},
      async stat() {
        throw Object.assign(new Error('FileNotFound'), { code: 'FileNotFound' });
      },
    },
    asRelativePath(uri) {
      return uri.fsPath || uri.path || '';
    },
    findFiles: async () => [],
    onDidChangeConfiguration() {
      return { dispose() {} };
    },
    onDidSaveTextDocument() {
      return { dispose() {} };
    },
    onDidRenameFiles() {
      return { dispose() {} };
    },
  },
  window: {
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    createStatusBarItem() {
      return {
        show() {},
        hide() {},
        dispose() {},
        text: '',
        command: undefined,
        tooltip: undefined,
      };
    },
    createWebviewPanel() {
      return {
        webview: { html: '', postMessage: async () => {}, onDidReceiveMessage() { return { dispose() {} }; }, asWebviewUri: (u) => u, cspSource: '' },
        reveal() {},
        dispose() {},
        onDidDispose() { return { dispose() {} }; },
      };
    },
    activeTextEditor: undefined,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor() {
      return { dispose() {} };
    },
    onDidChangeTextEditorSelection() {
      return { dispose() {} };
    },
  },
  commands: {
    executeCommand: async () => undefined,
    registerCommand() {
      return { dispose() {} };
    },
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1, Two: 2, Beside: -2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(id) {
      this.id = id;
    }
  },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  EventEmitter: class {
    constructor() {
      this.event = () => ({ dispose() {} });
    }
    fire() {}
  },
  Range: class {
    constructor(a, b, c, d) {
      this.start = { line: a, character: b };
      this.end = { line: c, character: d };
    }
  },
  CodeLens: class {
    constructor(range, command) {
      this.range = range;
      this.command = command;
    }
  },
  RelativePattern: class {
    constructor(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    }
  },
  ConfigurationTarget: { Workspace: 2 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  languages: {
    createDiagnosticCollection() {
      return { set() {}, clear() {}, dispose() {} };
    },
    registerCodeLensProvider() {
      return { dispose() {} };
    },
  },
};

module.exports = vscode;
