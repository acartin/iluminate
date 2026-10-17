import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the root layout does not force every route to use the home canonical", async () => {
  const [layout, seo] = await Promise.all([read("app/layout.tsx"), read("lib/seo.ts")]);

  assert.doesNotMatch(layout, /alternates\s*:\s*\{\s*canonical\s*:\s*["']\/["']/);
  assert.match(seo, /alternates:\s*\{ canonical: path \}/);
});

test("the simulator is discoverable through navigation and the sitemap", async () => {
  const [header, sitemap, simulator, spanishAlias] = await Promise.all([
    read("components/site-header.tsx"),
    read("app/sitemap.ts"),
    read("app/simulator/page.tsx"),
    read("app/simulador/page.tsx"),
  ]);

  assert.match(header, /\["Simulador", "\/simulator"\]/);
  assert.match(sitemap, /"\/simulator"/);
  assert.match(simulator, /path: "\/simulator"/);
  assert.match(simulator, /vista conceptual/i);
  assert.match(spanishAlias, /redirect\("\/simulator"\)/);
});

test("robots explicitly allows the OpenAI search crawler", async () => {
  const robots = await read("app/robots.ts");

  assert.match(robots, /userAgent: "OAI-SearchBot", allow: "\/"/);
});
