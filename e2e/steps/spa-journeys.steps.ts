/**
 * Steps for the core Explorer SPA journeys (issue #20 slice): flow selection, hotspots, the source
 * behind an anchor, the context bundle, comments, search, and tab switching. They reuse the node
 * click / detail-panel steps already defined in spa.steps.ts and add the rest.
 *
 * Locators are chosen to survive the coming refactor (#21): roles and visible text where possible,
 * a handful of stable structural ids the SPA already carries (`#flowlist`, `#search`, `#detail`,
 * `#datamodel`, `#glossary`, `#overview`, `#tabbar`), and two `data-testid` hooks added to the
 * bundle drawer and comment dialog so those overlays can be scoped without nth-child chains. The
 * assertions are on user-visible outcomes (what the panel names, what the drawer lists, what code
 * comes back), never on CSS internals or the imperative layout engine's structure.
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures.js';

// The sidebar flow list, scoped so a flow name matched here is a sidebar entry, not the board header.
const flowItem = (page: import('@playwright/test').Page, name: string) =>
  page.locator('#flowlist').locator('.flow-item', { hasText: name });

// --- flow selection ---------------------------------------------------------

When('I select the flow named {string}', async ({ page }, name: string) => {
  await flowItem(page, name).first().click();
});

Then('the flow board is titled {string}', async ({ page }, name: string) => {
  await expect(page.locator('#flowheader h2')).toContainText(name);
});

Then('the board renders the node {string}', async ({ page }, label: string) => {
  const sticky = page.locator('.sticky').filter({ has: page.getByText(label, { exact: true }) }).first();
  await expect(sticky).toBeVisible();
});

// --- hotspots & source ------------------------------------------------------

When('I open the hotspots drawer for the current flow', async ({ page }) => {
  await page.getByRole('button', { name: /Hotspots/ }).click();
});

When('I click the hotspot card {string}', async ({ page }, label: string) => {
  await page.locator('.hs-card').filter({ hasText: label }).first().click();
});

Then('the detail panel shows the hotspot {string}', async ({ page }, label: string) => {
  const detail = page.locator('#detail.open');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.dtype')).toHaveText('Hotspot');
  await expect(detail.locator('h3')).toHaveText(label);
});

When('I reveal the source behind its first anchor', async ({ page }) => {
  await page.locator('#detail').getByRole('button', { name: 'view source' }).first().click();
});

Then('the real source code is shown for that anchor', async ({ page }) => {
  const code = page.locator('#detail .src-code').first();
  await expect(code).toBeVisible();
  expect((await code.innerText()).trim().length).toBeGreaterThan(0);
});

// --- context bundle ---------------------------------------------------------

const drawer = (page: import('@playwright/test').Page) => page.getByTestId('context-drawer');

When('I add the open node to the context bundle', async ({ page }) => {
  await page.locator('#detail').getByRole('button', { name: /Add to context/ }).click();
});

When('I add the flow named {string} to the context bundle', async ({ page }, name: string) => {
  await flowItem(page, name).first().click({ button: 'right' });
  await page.locator('.ctxmenu').getByRole('button', { name: /Add flow to context bundle/ }).click();
});

When('I open the context bundle', async ({ page }) => {
  await page.getByRole('button', { name: /^Context/ }).click();
  await expect(drawer(page)).toBeVisible();
});

// --- board sticky right-click menu (issue #63) ------------------------------
// The contextmenu handler that opens the menu is wired by the imperative layout engine
// (flow-geometry.js placeCard adds the listener on each `.sticky`), not by React, so these steps
// drive the real board path #42 refactored. `click({ button: 'right' })` fires the `contextmenu`
// event the handler listens for; the handler calls preventDefault, so no native menu appears.

When('I right-click the board node labelled {string}', async ({ page }, label: string) => {
  const sticky = page.locator('.sticky').filter({ has: page.getByText(label, { exact: true }) }).first();
  await expect(sticky).toBeVisible();
  await sticky.click({ button: 'right' });
});

Then('the board context menu offers the node actions for {string}', async ({ page }, label: string) => {
  const menu = page.locator('.ctxmenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.ctxmenu-head')).toHaveText(label);
  await expect(menu.getByRole('button', { name: /Add node to context bundle/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: /Copy this node for Claude/ })).toBeVisible();
});

When('I add the node to the context bundle from its context menu', async ({ page }) => {
  await page.locator('.ctxmenu').getByRole('button', { name: /Add node to context bundle/ }).click();
});

Then('the context bundle lists {string}', async ({ page }, label: string) => {
  await expect(drawer(page).getByText(label, { exact: true })).toBeVisible();
});

Then('the context bundle does not list {string}', async ({ page }, label: string) => {
  await expect(drawer(page).getByText(label, { exact: true })).toHaveCount(0);
});

When('I copy the bundle for Claude', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await drawer(page).getByRole('button', { name: /Copy all for Claude/ }).click();
  // the button flips to "Copied ✓" only if navigator.clipboard.writeText resolved
  await expect(drawer(page).getByRole('button', { name: /Copied/ })).toBeVisible();
});

Then('the copied payload is non-empty', async ({ page }) => {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.trim().length).toBeGreaterThan(0);
});

Then('the copied payload names {string}', async ({ page }, needle: string) => {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(needle);
});

When('I remove {string} from the context bundle', async ({ page }, label: string) => {
  await drawer(page).locator('.bundle-row').filter({ hasText: label }).getByTitle('Remove').click();
});

When('I clear the context bundle', async ({ page }) => {
  await drawer(page).getByRole('button', { name: 'Clear' }).click();
});

Then('the context bundle is empty', async ({ page }) => {
  await expect(drawer(page).locator('.bundle-row')).toHaveCount(0);
});

// --- comments (writable model copy) -----------------------------------------

Given('the explorer is open on a writable copy of the example model', async ({ page, writableViewServer }) => {
  await page.goto(writableViewServer.url);
  await expect(page.locator('.sticky').first()).toBeVisible();
});

When('I open the comment dialog for the node {string}', async ({ page }, label: string) => {
  const sticky = page.locator('.sticky').filter({ has: page.getByText(label, { exact: true }) }).first();
  await sticky.click({ button: 'right' });
  await page.locator('.ctxmenu').getByRole('button', { name: /Add comment/ }).click();
  await expect(page.getByTestId('comment-dialog')).toBeVisible();
});

When('I add the comment {string}', async ({ page }, text: string) => {
  const dialog = page.getByTestId('comment-dialog');
  await dialog.locator('.cmt-input').fill(text);
  await dialog.getByRole('button', { name: 'Add comment' }).click();
});

Then('the comment {string} is shown in the dialog', async ({ page }, text: string) => {
  await expect(page.getByTestId('comment-dialog').getByText(text, { exact: true })).toBeVisible();
});

When('I delete the comment {string}', async ({ page }, text: string) => {
  await page.getByTestId('comment-dialog').locator('.cmt-item').filter({ hasText: text }).getByTitle('Delete').click();
});

Then('the dialog shows no comments', async ({ page }) => {
  await expect(page.getByTestId('comment-dialog').getByText('No comments yet.')).toBeVisible();
});

// --- search / filter --------------------------------------------------------

Then('the sidebar lists {int} flows', async ({ page }, n: number) => {
  await expect(page.locator('#flowlist .flow-item')).toHaveCount(n);
});

When('I filter the flows by {string}', async ({ page }, query: string) => {
  await page.getByPlaceholder('Filter flows...').fill(query);
});

Then('the sidebar lists fewer than {int} flows', async ({ page }, n: number) => {
  await expect.poll(() => page.locator('#flowlist .flow-item').count()).toBeLessThan(n);
  expect(await page.locator('#flowlist .flow-item').count()).toBeGreaterThan(0);
});

Then('the flow named {string} is listed', async ({ page }, name: string) => {
  await expect(flowItem(page, name)).toHaveCount(1);
});

Then('the flow named {string} is not listed', async ({ page }, name: string) => {
  await expect(flowItem(page, name)).toHaveCount(0);
});

// --- tab switching ----------------------------------------------------------

When('I switch to the {string} tab', async ({ page }, tab: string) => {
  await page.locator('#tabbar').getByRole('button', { name: tab, exact: true }).click();
});

Then('the data model view renders a store named {string}', async ({ page }, name: string) => {
  const view = page.locator('#datamodel');
  await expect(view).toBeVisible();
  await expect(view.getByText(name, { exact: true }).first()).toBeVisible();
});

Then('the glossary view lists the term {string}', async ({ page }, term: string) => {
  const view = page.locator('#glossary');
  await expect(view).toBeVisible();
  await expect(view.getByText(term, { exact: true }).first()).toBeVisible();
});

Then('the overview view renders {int} flow boxes', async ({ page }, n: number) => {
  await expect(page.locator('#overview .context-box')).toHaveCount(n);
});
