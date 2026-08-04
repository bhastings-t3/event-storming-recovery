/**
 * Steps for the Explorer SPA face. A real Chromium loads the running `view` server, the imperative
 * layout engine builds the board's `.sticky` cards, and Playwright locators drive and read the DOM —
 * so a passing scenario proves the click -> selection -> detail-panel wiring, not a mock of it.
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures.js';

Given('the explorer is open on the example model', async ({ page, viewServer }) => {
  await page.goto(viewServer.url);
  // the board renders its stickies imperatively once the model has loaded
  await expect(page.locator('.sticky').first()).toBeVisible();
});

When('I click the node labelled {string}', async ({ page, world }, label: string) => {
  // narrow to the sticky whose label cell is exactly `label` (not its type cell, not a substring)
  const sticky = page.locator('.sticky').filter({ has: page.getByText(label, { exact: true }) }).first();
  await expect(sticky).toBeVisible();
  await sticky.click();
  world.clickedLabel = label;
});

Then('the detail panel names {string}', async ({ page }, label: string) => {
  const detail = page.locator('#detail.open');
  await expect(detail).toBeVisible();
  await expect(detail.locator('h3')).toHaveText(label);
});

Then('that node is marked selected on the board', async ({ page, world }) => {
  const selected = page.locator('.sticky.selected').filter({ has: page.getByText(world.clickedLabel!, { exact: true }) });
  await expect(selected).toBeVisible();
});
