#!/usr/bin/env node
// Unit tests for viewer-request.js CloudFront Function logic.
// Run: node function.test.js
// No dependencies required.

const assert = require("assert");

// ── Inline the handler with DOMAIN substituted ────────────────────────────────
// We copy the function body here, substituting DOMAIN = "example.com"
// so the tests are domain-agnostic.

const DOMAIN = "example.com";

function handler(event) {
  var req = event.request;
  if (!req.headers.host) return req;
  var host = req.headers.host.value;
  var uri  = req.uri;

  if (host === DOMAIN) {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: { location: { value: "https://www." + DOMAIN + uri } }
    };
  }

  if (uri.endsWith("/")) {
    req.uri = uri + "index.html";
  } else if (!uri.split("/").pop().includes(".")) {
    req.uri = uri + "/index.html";
  }

  return req;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(host, uri) {
  return { request: { headers: { host: { value: host } }, uri } };
}

function makeEventNoHost(uri) {
  return { request: { headers: {}, uri } };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("\nCloudFront Function: viewer-request\n");

test("apex redirect: /about → 301 to https://www.example.com/about", () => {
  const result = handler(makeEvent(DOMAIN, "/about"));
  assert.strictEqual(result.statusCode, 301);
  assert.strictEqual(result.headers.location.value, "https://www.example.com/about");
});

test("apex redirect: root / → 301 to https://www.example.com/", () => {
  const result = handler(makeEvent(DOMAIN, "/"));
  assert.strictEqual(result.statusCode, 301);
  assert.strictEqual(result.headers.location.value, "https://www.example.com/");
});

test("www passthrough with rewrite: /about → /about/index.html", () => {
  const event = makeEvent("www.example.com", "/about");
  const result = handler(event);
  assert.strictEqual(result.uri, "/about/index.html");
  assert.ok(!result.statusCode, "should not be a redirect");
});

test("trailing slash: /about/ → /about/index.html", () => {
  const event = makeEvent("www.example.com", "/about/");
  const result = handler(event);
  assert.strictEqual(result.uri, "/about/index.html");
});

test("root path: / → /index.html", () => {
  const event = makeEvent("www.example.com", "/");
  const result = handler(event);
  assert.strictEqual(result.uri, "/index.html");
});

test("has extension: /style.css → unchanged", () => {
  const event = makeEvent("www.example.com", "/style.css");
  const result = handler(event);
  assert.strictEqual(result.uri, "/style.css");
});

test("has extension: /favicon.ico → unchanged", () => {
  const event = makeEvent("www.example.com", "/favicon.ico");
  const result = handler(event);
  assert.strictEqual(result.uri, "/favicon.ico");
});

test("missing host header → passthrough unchanged", () => {
  const result = handler(makeEventNoHost("/about"));
  assert.strictEqual(result.uri, "/about");
  assert.ok(!result.statusCode, "should not be a redirect");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
