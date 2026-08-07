/**
 * Steps for the STATIC generated explorer face (issue #42). A real Chromium loads the self-contained
 * explorer.html the CLI `generate` emits (baked model, no server) over a file:// URL, its ~1,100-line
 * vanilla-JS client (client-script.ts) builds the DOM, and Playwright locators drive and read it — so
 * a passing scenario proves the generated file's own click -> select -> render wiring, independent of
 * the live SPA (src/web), which is a DIFFERENT implementation of the same views.
 *
 * Selectors are read from client-script.ts / html.ts, NOT assumed to match the SPA: the tab bar is
 * `#tabbar` with per-tab buttons, board cards are `.sticky` (label in `.nlabel`), the detail panel is
 * `#detail.open` with an `h3` heading, and each tab section is `#datamodel` / `#glossary` / `#overview`
 * / `#gallery`, shown by a `.show` class. Baked source anchors are vscode:// links that cannot resolve
 * headless, so no step drives them — only user-visible board / panel / tab outcomes are asserted.
 */
import { expect, type Page } from '@playwright/test';
import { Given, When, Then } from './fixtures.js';

// The sidebar flow list, scoped so a flow name matched here is a sidebar entry, not the board header.
const flowItem = (page: Page, name: string) => page.locator('#flowlist .flow-item', { hasText: name });

Given('the static explorer is open', async ({ page, staticExplorerUrl }) => {
  await page.goto(staticExplorerUrl);
  // the board renders its stickies imperatively once the baked model has loaded
  await expect(page.locator('.sticky').first()).toBeVisible();
});

// The same generated explorer, but built from the CONVENTIONAL toy-shop model (issue #33). Once the
// page has loaded, every When/Then step below operates on `page` and is agnostic to which model was
// baked in, so the conventional scenarios reuse them wholesale — only the entry point differs.
Given('the conventional static explorer is open', async ({ page, staticExplorerToyShopUrl }) => {
  await page.goto(staticExplorerToyShopUrl);
  await expect(page.locator('.sticky').first()).toBeVisible();
});

Then('the static board shows stickies', async ({ page }) => {
  expect(await page.locator('.sticky').count()).toBeGreaterThan(0);
});

When('I select the static flow named {string}', async ({ page }, name: string) => {
  await flowItem(page, name).first().click();
});

Then('the static flow board is titled {string}', async ({ page }, name: string) => {
  await expect(page.locator('#flowheader h2')).toContainText(name);
});

Then('the static board renders the node {string}', async ({ page }, label: string) => {
  const sticky = page.locator('.sticky').filter({ has: page.getByText(label, { exact: true }) }).first();
  await expect(sticky).toBeVisible();
});

When('I click the static node labelled {string}', async ({ page }, label: string) => {
  const sticky = page.locator('.sticky').filter({ has: page.getByText(label, { exact: true }) }).first();
  await expect(sticky).toBeVisible();
  await sticky.click();
});

Then('the static detail panel names {string}', async ({ page }, label: string) => {
  const detail = page.locator('#detail.open');
  await expect(detail).toBeVisible();
  await expect(detail.locator('h3')).toHaveText(label);
});

When('I switch to the static {string} tab', async ({ page }, tab: string) => {
  await page.locator('#tabbar').getByRole('button', { name: tab, exact: true }).click();
});

Then('the static data model view renders a store named {string}', async ({ page }, name: string) => {
  const view = page.locator('#datamodel');
  await expect(view).toBeVisible();
  await expect(view.getByText(name, { exact: true }).first()).toBeVisible();
});

Then('the static glossary view lists {string}', async ({ page }, text: string) => {
  const view = page.locator('#glossary');
  await expect(view).toBeVisible();
  await expect(view.getByText(text, { exact: true }).first()).toBeVisible();
});

Then('the static overview view renders {int} flow boxes', async ({ page }, n: number) => {
  await expect(page.locator('#overview .context-box')).toHaveCount(n);
});

Then('the static gallery lists the node type {string}', async ({ page }, typeName: string) => {
  const view = page.locator('#gallery');
  await expect(view).toBeVisible();
  await expect(view.locator('.type-chips').getByText(typeName, { exact: true })).toBeVisible();
});

Then('the static gallery renders sticky cards', async ({ page }) => {
  expect(await page.locator('#gallery .gcard').count()).toBeGreaterThan(0);
});

// ---- Issue #74: first-open self-heal of the source root on a shared (--shareable) board ----------
// A shareable explorer.html bakes NO source root, so every source link renders as vscode://file//...
// (empty root). The scenario proves the reader is nudged (banner) and, on the first source-link click,
// auto-prompted; setting a root flips the links to it and the banner stays gone across a reload.
Given('the shareable static explorer is open', async ({ page, staticExplorerShareableUrl }) => {
  await page.goto(staticExplorerShareableUrl);
  await expect(page.locator('.sticky').first()).toBeVisible();
});

// The first source (vscode://) link in the open detail panel — the reader-overridable deep link.
const detailSourceLink = (page: Page) => page.locator('#detail a[href^="vscode:"]').first();

Then('the static source-root banner is shown', async ({ page }) => {
  await expect(page.locator('#reporoot-banner')).toBeVisible();
});

Then('the static source-root banner is not shown', async ({ page }) => {
  await expect(page.locator('#reporoot-banner')).toHaveCount(0);
});

// Neutral == generated-elsewhere: the empty baked root yields a vscode://file// link (double slash),
// carrying none of the reader's local path yet.
Then('a static source link is neutral until a root is set', async ({ page }) => {
  const href = await detailSourceLink(page).getAttribute('href');
  expect(href, 'a baked source link is present').toBeTruthy();
  expect(href!.startsWith('vscode://file//'), `link should carry no reader root yet: ${href}`).toBe(true);
});

When('I click a static source link and set the source root to {string}', async ({ page }, root: string) => {
  const link = detailSourceLink(page);
  await expect(link).toBeVisible();
  // The client intercepts the first source-link click (no root set) and opens window.prompt. Capture
  // the dialog to prove the auto-prompt fired, then answer it with the reader's local checkout path.
  const dialog = new Promise<string>((resolve) => {
    page.once('dialog', async (d) => { const msg = d.message(); await d.accept(root); resolve(msg); });
  });
  await link.click();
  const message = await dialog;
  expect(message, 'the first source-link click opens the Source-root prompt').toContain('source links');
});

Then('the static source link resolves under {string}', async ({ page }, root: string) => {
  const href = await detailSourceLink(page).getAttribute('href');
  expect(href, `link should resolve under the reader's root ${root}: ${href}`).toContain(root + '/');
});

When('I reload the static explorer', async ({ page }) => {
  await page.reload();
  await expect(page.locator('.sticky').first()).toBeVisible();
});
