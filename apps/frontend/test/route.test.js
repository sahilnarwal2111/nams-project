import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGES, pageFromHash, hashForPage, anchorFromHash } from "../src/route.js";

test("pageFromHash reads #/page and falls back to home", () => {
  assert.equal(pageFromHash("#/work"), "work");
  assert.equal(pageFromHash("#/payments"), "payments");
  assert.equal(pageFromHash("#/enquiries"), "enquiries");
  assert.equal(pageFromHash("#/team"), "team");
  assert.equal(pageFromHash("#/activity"), "activity");
  assert.equal(pageFromHash("#/completed"), "completed");
  assert.equal(pageFromHash("#/work?x=1"), "work");
  for (const h of ["", "#", "#/", "#/nope", "#services", "#enquiry", undefined, null, "#/__proto__", "#/constructor"]) {
    assert.equal(pageFromHash(h), "home", String(h));
  }
});

test("hashForPage and pageFromHash agree for every page", () => {
  for (const p of PAGES) assert.equal(pageFromHash(hashForPage(p)), p);
  assert.equal(hashForPage("home"), "#/");
  assert.equal(hashForPage("nope"), "#/");
});

test("anchorFromHash finds landing page sections only", () => {
  assert.equal(anchorFromHash("#services"), "services");
  assert.equal(anchorFromHash("#enquiry"), "enquiry");
  assert.equal(anchorFromHash("#/work"), null);
  assert.equal(anchorFromHash(""), null);
  assert.equal(anchorFromHash("#a b"), null);
});
