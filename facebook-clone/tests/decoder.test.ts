import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';

const projectRequire = createRequire(path.resolve('package.json'));
const decoderPath = path.resolve('src/platform/decode-uri-component.cjs');
const decode: (value: unknown) => string = projectRequire(decoderPath);
const queryPath = projectRequire.resolve('query-string');
const queryRequire = createRequire(queryPath);

function queryStringWithAlias() {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(queryPath, 'utf8'),
    {
      module,
      exports: module.exports,
      require: (name: string) => (name === 'decode-uri-component' ? decode : queryRequire(name)),
    },
    { filename: queryPath },
  );
  return module.exports as typeof import('query-string');
}

test('callable CJS decoder preserves valid Unicode, reserved characters and plus behavior', () => {
  assert.equal(typeof decode, 'function');
  const upstream: (value: string) => string = projectRequire('decode-uri-component');
  for (const value of [
    'hello+world',
    'a%2Bb',
    '%26%3D%23%3F',
    'a&b=c#d',
    '%E2%98%83',
    '%F0%9F%8C%BF',
    '%2525',
    'a+b%2Bc',
  ]) {
    assert.equal(decode(value), upstream(value), value);
  }
  assert.throws(() => decode(null), TypeError);
  assert.throws(() => decode({ toString: () => 'not a string' }), TypeError);
});

test('installed query-string 7 parses arrays and malformed components through the alias', () => {
  assert.equal(projectRequire('query-string/package.json').version, '7.1.3');
  const query = queryStringWithAlias();
  assert.equal(query.parse('q=a%2Bb+c&tag=one&tag=two').q, 'a+b c');
  assert.deepEqual(Array.from(query.parse('tag=one&tag=two').tag as string[]), ['one', 'two']);
  assert.equal(query.parse('q=%E2%98%83').q, '☃');
  assert.equal(query.parse('q=a%26b%3Dc%23d%FF').q, 'a&b=c#d�');
  assert.equal(query.parse('q=a%2Bb+c%FF').q, 'a+b c�');
  const original = { q: 'garden 🌿 & friends', tag: ['one', 'two'] };
  const parsed = query.parse(query.stringify(original));
  assert.equal(parsed.q, original.q);
  assert.deepEqual(Array.from(parsed.tag as string[]), original.tag);
});

test('malformed input uses the same WHATWG behavior provided by Expo native', () => {
  const { URLSearchParams } = projectRequire('whatwg-url-minimum');
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(decoderPath, 'utf8'), { module, URLSearchParams });
  const nativeDecode = module.exports as (value: string) => string;
  for (const value of ['%FF', 'a&b=c#d%FF', 'a%2Bb+c%FF', '%C3%A5%FF', '%E0%A4%A']) {
    assert.equal(nativeDecode(value), decode(value));
  }
});

test('large hostile input completes within a bounded child process', () => {
  const program = `
    const decode = require(process.argv[1]);
    const { URLSearchParams } = require('whatwg-url-minimum');
    global.URLSearchParams = URLSearchParams;
    const inputs = [
      '%80'.repeat(100000),
      Array.from({length: 25000}, (_, i) => '%41' + i.toString(16) + '%80').join('-') + '%zz'
    ];
    for (const input of inputs) {
      const result = decode(input);
      if (typeof result !== 'string' || result.length > input.length) process.exit(1);
    }
    process.stdout.write('completed');
  `;
  const result = spawnSync(process.execPath, ['-e', program, decoderPath], {
    encoding: 'utf8',
    timeout: 3000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'completed');
});

test('Metro aliases the installed vulnerable decoder and preserves unrelated resolutions', () => {
  const config = projectRequire('./metro.config.js');
  const originalPath = projectRequire.resolve('decode-uri-component');
  assert.equal(projectRequire('decode-uri-component/package.json').version, '0.2.2');
  const calls: unknown[][] = [];
  let result = { type: 'sourceFile', filePath: originalPath };
  const context = {
    resolveRequest: (...args: unknown[]) => {
      calls.push(args);
      return result;
    },
  };
  assert.deepEqual(config.resolver.resolveRequest(context, 'decode-uri-component', 'ios'), {
    type: 'sourceFile',
    filePath: decoderPath,
  });
  assert.deepEqual(calls[0], [context, 'decode-uri-component', 'ios']);
  result = { type: 'sourceFile', filePath: '/different/package/index.js' };
  assert.equal(config.resolver.resolveRequest(context, 'different-package', 'web'), result);
  result = { type: 'sourceFile', filePath: '/nested/node_modules/decode-uri-component/index.js' };
  assert.equal(config.resolver.resolveRequest(context, 'decode-uri-component', 'ios'), result);
});
