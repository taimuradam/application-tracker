import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath) {
  const fileUrl = new URL("../" + relativePath, import.meta.url);
  return readFileSync(fileUrl, "utf8");
}

function findVersion(text, fileName) {
  const escapedName = fileName.replace(".", "\\.");
  const pattern = new RegExp(escapedName + "\\?v=([A-Za-z0-9._-]+)");
  const match = text.match(pattern);
  if (match === null) {
    return "";
  }
  return match[1];
}

test("every versioned file link uses the same version", function () {
  const indexHtml = readProjectFile("index.html");
  const appJs = readProjectFile("app.js");

  const stylesVersion = findVersion(indexHtml, "styles.css");
  const appVersion = findVersion(indexHtml, "app.js");
  const moduleVersion = findVersion(appJs, "company-from-url.js");

  assert.notEqual(stylesVersion, "", "index.html links styles.css without ?v=");
  assert.notEqual(appVersion, "", "index.html links app.js without ?v=");
  assert.notEqual(moduleVersion, "", "app.js imports company-from-url.js without ?v=");
  assert.equal(appVersion, stylesVersion, "app.js and styles.css versions differ in index.html");
  assert.equal(moduleVersion, appVersion, "the company-from-url.js import version differs from index.html");
});
