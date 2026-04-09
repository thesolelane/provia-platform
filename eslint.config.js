const reactPlugin = (() => {
  try {
    return require('eslint-plugin-react');
  } catch {
    return null;
  }
})();

const reactHooksPlugin = (() => {
  try {
    return require('eslint-plugin-react-hooks');
  } catch {
    return null;
  }
})();

module.exports = [
  {
    ignores: ['node_modules/**', 'client/node_modules/**', 'client/build/**', '**/*.min.js']
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Promise: 'readonly',
        Error: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        isFinite: 'readonly',
        encodeURIComponent: 'readonly',
        decodeURIComponent: 'readonly',
        String: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        RegExp: 'readonly',
        Symbol: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Proxy: 'readonly',
        Reflect: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        fetch: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'no-undef': 'warn',
      'no-console': 'off',
      'no-unreachable': 'warn',
      'no-duplicate-case': 'warn',
      'no-empty': 'warn',
      'no-extra-semi': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-prototype-builtins': 'warn',
      'no-sparse-arrays': 'warn',
      'no-template-curly-in-string': 'warn',
      'no-unsafe-finally': 'warn',
      'use-isnan': 'warn',
      'valid-typeof': 'warn'
    }
  },
  {
    files: ['client/src/**/*.js', 'client/src/**/*.jsx'],
    plugins: {
      ...(reactPlugin ? { react: reactPlugin } : {}),
      ...(reactHooksPlugin ? { 'react-hooks': reactHooksPlugin } : {})
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        EventSource: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        Promise: 'readonly',
        Error: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        isFinite: 'readonly',
        encodeURIComponent: 'readonly',
        decodeURIComponent: 'readonly',
        String: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        RegExp: 'readonly',
        Symbol: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        Image: 'readonly',
        Worker: 'readonly',
        ServiceWorker: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        SpeechRecognition: 'readonly',
        webkitSpeechRecognition: 'readonly',
        MediaRecorder: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        performance: 'readonly',
        crypto: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        structuredClone: 'readonly',
        queueMicrotask: 'readonly'
      }
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'no-undef': 'warn',
      'no-console': 'off',
      'no-unreachable': 'warn',
      'no-duplicate-case': 'warn',
      'no-empty': 'warn',
      'no-extra-semi': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-sparse-arrays': 'warn',
      'no-template-curly-in-string': 'warn',
      'no-unsafe-finally': 'warn',
      'use-isnan': 'warn',
      'valid-typeof': 'warn',
      ...(reactPlugin
        ? {
            'react/jsx-uses-react': 'warn',
            'react/jsx-uses-vars': 'warn',
            'react/jsx-no-duplicate-props': 'warn',
            'react/jsx-no-undef': 'warn',
            'react/no-unknown-property': 'warn',
            'react/jsx-key': 'warn',
            'react/self-closing-comp': 'warn'
          }
        : {}),
      ...(reactHooksPlugin
        ? {
            'react-hooks/rules-of-hooks': 'warn',
            'react-hooks/exhaustive-deps': 'warn'
          }
        : {})
    }
  }
];
