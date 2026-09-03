import { expect, Page, Request as PWRequest, Response as PWResponse } from '@playwright/test';
import { Locator } from 'playwright';
import { registerDashboard, registerDatasource, registerDatasourceUid } from './fixtures';

// in ms
export const defaultTimeout = 2000;

export function log(message: string) {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  console.log(`[${now}] ${message}`);
}

export async function getGrafanaVersion(page: Page): Promise<string> {
  const resp = await page.request.get('http://localhost:3000/api/health');
  const body = await resp.json();
  return body.version;
}

/**
 * Dashboard editing comes in two shapes:
 *  - up to Grafana 12: a toolbar with "Add" / "Settings" buttons and, on an empty
 *    dashboard, an "Add visualization" call-to-action;
 *  - from Grafana 13: an edit sidebar whose "Add" pane offers Panel / Row / Variable and
 *    whose "Options" pane replaces the settings button.
 * The helpers below tell the two apart from the DOM (not the version number) so a
 * feature toggle or a backport cannot fool them.
 */
function legacyEditControls(page: Page): Locator {
  return page
    .getByTestId('data-testid Add button')
    .or(page.getByTestId('data-testid Dashboard settings'))
    .or(page.getByTestId('data-testid Create new panel button'));
}

function sidebarEditControls(page: Page): Locator {
  return page
    .getByTestId('data-testid Dashboard Sidebar new button')
    .or(page.getByTestId('data-testid sidebar add new panel'))
    .or(page.getByTestId('data-testid sidebar-show-hide-toggle'));
}

/** Resolves once either editing shape has rendered; true for the Grafana 13 sidebar. */
async function usesEditSidebar(page: Page): Promise<boolean> {
  await legacyEditControls(page)
    .or(sidebarEditControls(page))
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  return (await sidebarEditControls(page).count()) > 0;
}

/**
 * Clicks "Edit" when the dashboard is in view mode. Grafana 13 keeps the same testid on
 * the "Exit edit" button, so the text guard is what keeps this from leaving edit mode.
 */
async function enterDashboardEditMode(page: Page) {
  // A save that leaves the scene "dirty" (a query variable refreshing its value, for
  // one) pops "Unsaved changes" on the way out of edit mode; its backdrop swallows clicks
  await dismissUnsavedChangesModal(page);
  const editBtn = page.getByTestId('data-testid Edit dashboard button').filter({ hasNotText: 'Exit' }).first();
  const editing = legacyEditControls(page).or(sidebarEditControls(page)).first();
  await editBtn
    .or(editing)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click();
    log('--> Clicked "Edit dashboard"');
    await editing.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  } else {
    log('--> Edit button not present (already in edit mode)');
  }
}

/** Grafana 13: makes sure the sidebar shows its "Add" pane (Panel / Row / Variable). */
async function openSidebarAddPane(page: Page) {
  const addPanel = page.getByTestId('data-testid sidebar add new panel').first();
  if (!(await addPanel.isVisible().catch(() => false))) {
    await page.getByTestId('data-testid Dashboard Sidebar new button').first().click();
    await addPanel.waitFor({ state: 'visible', timeout: 10000 });
  }
}

/**
 * Grafana 13: adds a panel through the sidebar. The panel lands unconfigured, so open
 * its full editor — which shows the query editor alongside the visualization picker.
 * The entry point is the panel's own "Configure visualization" call-to-action on an
 * empty dashboard, or the sidebar's "Edit visualization" on one that has panels
 * (matched by name: their testids differ between 13.1 and 13.2).
 */
async function addPanelViaSidebar(page: Page) {
  await openSidebarAddPane(page);
  await page.getByTestId('data-testid sidebar add new panel').first().click();
  const configure = page
    .getByRole('button', { name: 'Configure visualization' })
    .or(page.getByRole('button', { name: 'Edit visualization' }))
    .first();
  await configure.waitFor({ state: 'visible', timeout: 10000 });
  await configure.click();
  await page.locator('.query-editor-row textarea').first().waitFor({ state: 'visible', timeout: 15000 });
  log('--> Added a panel through the sidebar and opened its editor');
}

/**
 * The panel editor can open on the visualization picker instead of the options pane
 * (Grafana 12.4+ for a brand-new panel, always on 13). Pick "Time series" so the options
 * pane — and its Title field — renders. A no-op when the pane is already there.
 */
async function ensurePanelOptionsPane(page: Page) {
  const titleInput = page.getByTestId('data-testid Panel editor option pane field input Title').first();
  const allVizTab = page
    .getByTestId('data-testid Tab Visualizations')
    .or(page.getByTestId('data-testid Tab All visualizations'))
    .first();
  const timeSeries = page.getByTestId('data-testid Plugin visualization item Time series').first();
  await titleInput.or(allVizTab).or(timeSeries).first().waitFor({ state: 'visible', timeout: 10000 });
  if (await titleInput.isVisible().catch(() => false)) {
    return;
  }
  // Grafana 13 opens the picker on its (empty) "Suggestions" tab
  if (await allVizTab.isVisible().catch(() => false)) {
    await allVizTab.click();
  }
  await timeSeries.waitFor({ state: 'visible', timeout: 10000 });
  await timeSeries.click();
  await titleInput.waitFor({ state: 'visible', timeout: 10000 });
  log('--> Picked "Time series", panel options pane visible');
}

/**
 * Selects the datasource of the panel being edited. Grafana 12 pops a "Select data
 * source" modal of cards when a panel is added to an empty dashboard; otherwise (a
 * dashboard that already has panels, or Grafana 13) the query editor shows the picker
 * input preset to the default datasource, and the choice comes from its dropdown.
 */
export async function selectPanelDatasource(page: Page, dsName: string) {
  const card = page.locator('[data-testid="data-source-card"]').filter({ hasText: dsName }).first();
  const picker = page
    .locator('input#data-source-picker, input[data-testid="data-testid Select a data source"]')
    .first();
  await card.or(picker).first().waitFor({ state: 'visible', timeout: 15000 });
  if (await card.isVisible().catch(() => false)) {
    await card.click();
    log(`--> Selected datasource "${dsName}" (card)`);
    return;
  }
  await picker.click();
  const option = page
    .getByRole('option', { name: dsName, exact: true })
    .or(page.locator('[data-testid="data-source-card"]').filter({ hasText: dsName }))
    .first();
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click();
  log(`--> Selected datasource "${dsName}" (picker)`);
}

async function openDashboardEdit(page: Page) {
  await enterDashboardEditMode(page);
  // Now, try to open dashboard settings using known selectors.
  await clickDashboardSettingsButton(page);
}

/**
 * Loads the dashboard settings view through its URL. Works on every Scenes-based
 * Grafana and is the only route on 13, where the toolbar settings button is gone.
 */
async function openDashboardSettingsByUrl(page: Page) {
  const url = new URL(page.url());
  url.searchParams.set('editview', 'settings');
  await page.goto(url.toString());
  await page
    .locator('button[data-testid="data-testid Dashboard settings page delete dashboard button"]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });
  log('--> Opened dashboard settings (editview=settings)');
}

function isVersionGreaterOrEqual(v: string, target: string): boolean {
  const vParts = v.split('.').map(Number);
  const tParts = target.split('.').map(Number);
  for (let i = 0; i < tParts.length; i++) {
    if ((vParts[i] ?? 0) > tParts[i]) {
      return true;
    }
    if ((vParts[i] ?? 0) < tParts[i]) {
      return false;
    }
  }
  return true;
}

async function isInDashboardSettings(page: Page) {
  const selectors = [
    'button[data-testid="data-testid Dashboard settings page delete dashboard button"]',
    'button[aria-label="Dashboard settings page delete dashboard button"]',
    'button:has-text("Delete Dashboard")',
    'button:has-text("Delete dashboard")',
    'button.css-ttl745-button:has-text("Delete Dashboard")', // for class-based
    'button.css-ttl745-button:has-text("Delete dashboard")',
  ];
  for (const sel of selectors) {
    if ((await page.locator(sel).count()) > 0) {
      return true;
    }
  }
  return false;
}

async function clickDashboardSettingsButton(page: Page) {
  log('--> Trying to open dashboard settings');
  // The probes below use $()/count() (no auto-wait): wait until either the settings
  // button or the settings page itself (delete button) has rendered
  await page
    .locator(
      'button[data-testid="data-testid Dashboard settings"], button[data-testid="data-testid Dashboard settings page delete dashboard button"]'
    )
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  if (
    (await page.locator('button[data-testid="data-testid Dashboard settings page delete dashboard button"]').count()) >
    0
  ) {
    log('--> Already in dashboard settings, skipping settings button');
    return;
  }
  const byTestId = await page.$('button[data-testid="data-testid Dashboard settings"]');
  if (byTestId) {
    await byTestId.click();
    log('--> Clicked dashboard settings (data-testid)');
    return;
  }
  const byRole = page.getByRole('button', { name: 'Dashboard settings' });
  if ((await byRole.count()) > 0) {
    await byRole.first().click();
    log('--> Clicked dashboard settings (role/name)');
    return;
  }
  // No settings button (Grafana 13 sidebar): the settings view is still reachable by URL
  await openDashboardSettingsByUrl(page);
}

async function clickDeleteDashboardButton(page: Page, version: string) {
  // Always open settings first for all recent Grafana versions!
  await openDashboardSettingsForDelete(page);

  // Try all known delete button selectors
  const selectors = [
    'button[data-testid="data-testid Dashboard settings page delete dashboard button"]',
    'button[aria-label="Dashboard settings page delete dashboard button"]',
    'button:has-text("Delete dashboard")',
    'button.css-ttl745-button:has-text("Delete dashboard")',
  ];

  let deleteClicked = false;
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click();
      log(`--> Clicked Delete Dashboard button using selector: ${sel}`);
      deleteClicked = true;
      break;
    }
  }
  if (!deleteClicked) {
    throw new Error('Delete dashboard button not found for any known selector');
  }

  // Confirm input if needed
  if (isVersionGreaterOrEqual(version, '10.2.0')) {
    const deleteInput = page.locator('input[placeholder="Type \\"Delete\\" to confirm"]');
    if (await deleteInput.count()) {
      await deleteInput.fill('Delete');
      log('--> Typed "Delete" in confirmation input');
    }
  }

  // Confirm deletion (all versions)
  const confirmBtn = page.getByTestId('data-testid Confirm Modal Danger Button');
  if (await confirmBtn.count()) {
    await confirmBtn.click();
    log('--> Confirmed dashboard deletion');
  } else {
    // fallback
    const altConfirm = page.locator('button:has-text("Delete")');
    if (await altConfirm.count()) {
      await altConfirm.click();
      log('--> Confirmed dashboard deletion (by text)');
    } else {
      log('Confirm deletion button not found for dashboard');
    }
  }
}

/**
 * Adds a panel to the current dashboard and lands in its editor with the query editor
 * visible. Enters edit mode first when needed (a freshly saved dashboard opens in view
 * mode), then goes through the sidebar (Grafana 13) or the "Add visualization"
 * call-to-action of an empty dashboard (Grafana 12).
 */
export async function clickAddPanelButton(page: Page) {
  await enterDashboardEditMode(page);
  if (await usesEditSidebar(page)) {
    await addPanelViaSidebar(page);
    return;
  }

  const selectors = [
    '[data-testid="data-testid Create new panel button"]',
    '[data-testid="add-panel-button"]',
    'button[aria-label="Add new panel"]',
    'button:has-text("Add visualization")',
  ];
  // page.$() has no auto-wait, so first wait for any candidate to render
  // (the dashboard page can take a while to hydrate on a loaded machine)
  await page
    .locator(selectors.join(', '))
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click();
      log(`--> Clicked Add Panel button with selector: ${sel}`);
      return;
    }
  }

  throw new Error('Could not find "Add Panel" button for any known selector or Grafana version.');
}

/**
 * Opens /connections/datasources/new and selects the Warp10 tile.
 * Selecting the tile creates the datasource (POST) and navigates to its edit page,
 * but before the SPA finishes hydrating the click can land on an inert element and
 * do nothing — so retry until the edit form (name field) actually shows up.
 */
export async function openNewWarp10Datasource(page: Page) {
  await page.goto('http://localhost:3000/connections/datasources/new');
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  // The tile click POSTs the datasource under Grafana's default name ('Warp10');
  // record the uid of every datasource created here so autoCleanup can delete it
  // even when the test dies before the rename is saved (the name-based cleanup
  // would then look for a name that was never persisted)
  const onCreated = async (res: PWResponse) => {
    if (res.url().endsWith('/api/datasources') && res.request().method() === 'POST') {
      const body = await res.json().catch(() => null);
      const uid = body?.datasource?.uid ?? body?.uid;
      if (uid) {
        registerDatasourceUid(uid);
      }
    }
  };
  page.on('response', onCreated);
  try {
    // The edit form is recognized by its name control: an input up to Grafana 12, the
    // editable page title (pencil button) from Grafana 13
    const nameControl = page.locator('#basic-settings-name').or(editDatasourceTitleButton(page)).first();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page
        .getByRole('button', { name: 'Warp10' })
        .click({ timeout: 5000 })
        .catch(() => {});
      try {
        await nameControl.waitFor({ state: 'visible', timeout: 5000 });
        log('--> Clicked "Warp10" tile, edit form visible');
        return;
      } catch {
        log(`--> Warp10 tile click did not land (attempt ${attempt}), retrying`);
      }
    }
    throw new Error('Warp10 datasource edit form never appeared after clicking the tile');
  } finally {
    page.off('response', onCreated);
  }
}

/** Grafana 13's pencil button next to the datasource page title (13.1 has no testid on it). */
function editDatasourceTitleButton(page: Page): Locator {
  return page
    .getByTestId('data-testid Editable title edit button')
    .or(page.getByRole('button', { name: 'Edit title' }))
    .first();
}

/**
 * Names the datasource being edited. Up to Grafana 12 the name is a plain form field;
 * from 13 it is the editable page title (pencil button, input, Enter to commit). Both
 * are persisted by the next "Save & test".
 */
export async function setDatasourceName(page: Page, dsName: string) {
  const legacyField = page.locator('#basic-settings-name');
  if (await legacyField.isVisible().catch(() => false)) {
    await legacyField.fill(dsName);
  } else {
    await editDatasourceTitleButton(page).click();
    const titleInput = page.locator('#page-editable-title');
    await titleInput.waitFor({ state: 'visible', timeout: 5000 });
    await titleInput.fill(dsName);
    await titleInput.press('Enter');
    await expect(page.locator('h1').first()).toHaveText(dsName);
  }
  log(`--> Entered datasource name: ${dsName}`);
}

export async function setupDatasource(page: Page, dsName: string) {
  log('--> Creating test datasource');
  registerDatasource(dsName);
  await openNewWarp10Datasource(page);
  await setDatasourceName(page, dsName);
  await page.fill('#url', 'http://warp10:8080');
  log('--> Entered datasource URL');
  // Selecting the Warp10 tile already created the datasource and navigated to its edit page;
  // "Save & test" issues a PUT there, so sync on that save round-trip
  const saveResponse = page
    .waitForResponse((res) => res.url().includes('/api/datasources') && res.request().method() === 'PUT', {
      timeout: 15000,
    })
    .catch(() => null);
  await page.getByRole('button', { name: 'Save & test' }).click();
  log('--> Clicked "Save & test"');
  await saveResponse;
  log('--> Datasource setup complete');
}

type SelectorMethod =
  | { method: 'role'; role: string; name: string }
  | { method: 'testId'; testId: string }
  | { method: 'text'; text: string }
  | { method: 'css'; css: string };

async function openDashboardSettingsForDelete(page: Page) {
  const selectors = [
    'button[aria-label="Dashboard settings"]',
    'button[data-testid="data-testid Dashboard settings"]',
    'button[aria-label="Dashboard settings (old)"]',
  ];
  // isInDashboardSettings and the $() loop below have no auto-wait: let either the
  // settings button or the settings page (delete button) render first
  await page
    .locator(
      `${selectors.join(', ')}, button[data-testid="data-testid Dashboard settings page delete dashboard button"]`
    )
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  if (await isInDashboardSettings(page)) {
    log('--> Already in dashboard settings page (delete button visible), skipping settings button click');
    return;
  }
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click();
      log(`--> Clicked dashboard settings with selector: ${sel}`);
      // The caller looks the delete button up with $() (no auto-wait), so wait for the settings page here
      await page
        .locator('button[data-testid="data-testid Dashboard settings page delete dashboard button"]')
        .waitFor({ state: 'visible', timeout: 5000 })
        .catch(() => {});
      return;
    }
  }
  // No settings button (Grafana 13 sidebar): the settings view is still reachable by URL
  await openDashboardSettingsByUrl(page);
}

async function openDashboardByTitle(page: Page, dashboardTitle: string) {
  // count() below has no auto-wait — let the list render the title or a folder first
  await page
    .getByText(dashboardTitle, { exact: true })
    .first()
    .or(page.getByText('General', { exact: true }).first())
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  let dash = page.getByText(dashboardTitle, { exact: true });
  if (await dash.count()) {
    await dash.first().click();
    log(`--> Opened dashboard "${dashboardTitle}" (top-level)`);
    return;
  }
  const generalSection = page.getByText('General', { exact: true });
  if (await generalSection.count()) {
    await generalSection.first().click();
    log('--> Opened "General" folder');
    // Wait for dashboards to appear after the folder click (count() below has no auto-wait)
    await page
      .getByText(dashboardTitle, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    dash = page.getByText(dashboardTitle, { exact: true });
    if (await dash.count()) {
      await dash.first().click();
      log(`--> Opened dashboard "${dashboardTitle}" (in General)`);
      return;
    }
  }
  throw new Error(`Dashboard "${dashboardTitle}" not found in root or General folder.`);
}

async function clickSaveDashboardButton(page: Page) {
  const selectors: SelectorMethod[] = [
    { method: 'role', role: 'button', name: 'Dashboard settings aside actions Save button' },
    { method: 'testId', testId: 'data-testid Save dashboard button' },
    { method: 'text', text: 'Save dashboard' },
    { method: 'css', css: 'button:has-text("Save dashboard")' },
  ];

  for (const sel of selectors) {
    try {
      let btn;
      if (sel.method === 'role') {
        btn = page.getByRole('button', { name: sel.name });
      } else if (sel.method === 'testId') {
        btn = page.getByTestId(sel.testId);
      } else if (sel.method === 'text') {
        btn = page.getByText(sel.text, { exact: true });
      } else if (sel.method === 'css') {
        btn = page.locator(sel.css);
      }
      if (btn && (await btn.count()) && (await btn.first().isVisible())) {
        // Short click timeout: a wrong candidate must fall through to the next selector,
        // not eat the whole test timeout in its actionability wait
        await btn.first().click({ timeout: 3000 });
        log(`--> Clicked Save Dashboard button using ${sel.method} selector`);
        return;
      }
    } catch (e) {
      // Try next
    }
  }
  throw new Error('No Save Dashboard button found for any known selector or Grafana version.');
}

async function clickDashboardFinalSaveButton(page: Page) {
  // The drawer's Save button stays disabled until the title field is validated, which
  // only triggers on blur — so blur the freshly filled title first
  const titleField = page.locator('input[aria-label="Save dashboard title field"]');
  if (await titleField.count()) {
    await titleField.press('Tab').catch(() => {});
  }
  // The save drawer animates open; give its button a chance to appear before probing selectors
  await page
    .getByTestId('data-testid Save dashboard drawer button')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});
  // Navigating away while the save request is still in flight pops an "Unsaved changes"
  // modal that blocks everything after — so sync on the save round-trip below
  const saveResponse = page
    .waitForResponse((res) => res.url().includes('/api/dashboards/db') && res.request().method() === 'POST', {
      timeout: 10000,
    })
    .catch(() => null);

  // Known-good candidate first, with a timeout long enough to wait out the
  // enabled/stable actionability checks while title validation completes
  const drawerBtn = page.getByTestId('data-testid Save dashboard drawer button').first();
  if (await drawerBtn.isVisible().catch(() => false)) {
    try {
      await drawerBtn.click({ timeout: 15000 });
      log('--> Clicked Save button (drawer)');
      await saveResponse;
      return;
    } catch (e) {
      log(`--> Drawer Save button not clickable (${(e as Error).message.split('\n')[0]}), probing fallbacks`);
    }
  }

  const selectors = [
    { method: 'role', role: 'button', name: 'Save dashboard button' },
    { method: 'testId', testId: 'data-testid Save dashboard drawer button' },
    { method: 'testId', testId: 'data-testid Save dashboard button' },
    { method: 'text', text: 'Save' },
    { method: 'css', css: 'button:has-text("Save")' },
  ];

  for (const sel of selectors) {
    try {
      let btn;
      if (sel.method === 'role' && sel.name) {
        btn = page.getByRole('button', { name: sel.name });
      } else if (sel.method === 'testId' && sel.testId) {
        btn = page.getByTestId(sel.testId);
      } else if (sel.method === 'text' && sel.text) {
        btn = page.getByText(sel.text, { exact: true });
      } else if (sel.method === 'css' && sel.css) {
        btn = page.locator(sel.css);
      }
      if (btn && (await btn.count()) && (await btn.first().isVisible())) {
        // Short click timeout: a wrong candidate must fall through to the next selector,
        // not eat the whole test timeout in its actionability wait
        await btn.first().click({ timeout: 3000 });
        log(
          `--> Clicked Save button using ${sel.method}${sel.testId ? ' ' + sel.testId : sel.name ? ' ' + sel.name : ''}`
        );
        await saveResponse;
        return;
      }
    } catch (e) {}
  }
  throw new Error('No "Save" dashboard button found for any known selector or Grafana version.');
}

/**
 * Leaving the dashboard settings right after a save can still pop the "Unsaved changes"
 * modal (the settings view considers pending edits). Confirm it so the flow can continue.
 */
async function dismissUnsavedChangesModal(page: Page) {
  const modal = page.getByText('Unsaved changes', { exact: true });
  const appeared = await modal
    .first()
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) {
    return;
  }
  log('--> "Unsaved changes" modal detected, saving');
  const saveBtn = page.getByRole('dialog').getByRole('button', { name: 'Save dashboard' });
  if (await saveBtn.count()) {
    await saveBtn
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
  } else {
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Discard' })
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
  }
  await modal
    .first()
    .waitFor({ state: 'hidden', timeout: 5000 })
    .catch(() => {});
}

type VariableType = 'query' | 'custom' | 'constant' | 'interval';
const VARIABLE_TYPE_LABEL: Record<VariableType, string> = {
  query: 'Query',
  custom: 'Custom',
  constant: 'Constant',
  interval: 'Interval',
};

/** The variable name field: settings form up to Grafana 12, sidebar pane from 13. */
function variableNameInput(page: Page): Locator {
  return page
    .locator('[data-testid="data-testid Variable editor Form Name field"]')
    .or(page.getByTestId('data-testid variable name input'))
    .first();
}

/**
 * Opens the editor of a brand-new variable on the dashboard being edited.
 * Grafana 12: settings > Variables > Add variable > type dropdown.
 * Grafana 13: sidebar "Add" pane > Variable > type card.
 */
async function openNewVariableEditor(page: Page, type: VariableType) {
  if (await usesEditSidebar(page)) {
    await openSidebarAddPane(page);
    // The "Variable" entry of the Add pane only carries a testid from 13.2 on
    await page.locator('#sidebar-container').getByRole('button', { name: 'Variable', exact: true }).first().click();
    const typeCard = page.getByTestId(`data-testid variable type ${type}`).first();
    await typeCard.waitFor({ state: 'visible', timeout: 10000 });
    await typeCard.getByRole('button').first().click();
    await variableNameInput(page).waitFor({ state: 'visible', timeout: 10000 });
    log(`--> Opened a new ${VARIABLE_TYPE_LABEL[type]} variable in the sidebar`);
    return;
  }

  await clickDashboardSettingsButton(page);
  await page.getByText('Variables').click();
  log('--> Clicked "Variables" tab');
  await page.getByRole('button', { name: 'Add variable' }).click();
  log('--> Clicked "Add variable"');
  await selectTypeInVariablePanel(page, VARIABLE_TYPE_LABEL[type]);
}

/** Grafana 12 needs an explicit "Apply"; the Grafana 13 sidebar saves edits live. */
async function applyVariableIfNeeded(page: Page) {
  const applyBtn = page.getByTestId('data-testid Variable editor Apply button').first();
  if (await applyBtn.isVisible().catch(() => false)) {
    await applyBtn.click();
    log('--> Clicked "Apply" to save variable');
  }
}

async function saveNewDashboardAs(page: Page, dashboardTitle: string) {
  await clickSaveDashboardButton(page);
  log('--> Clicked save');
  registerDashboard(dashboardTitle);
  await page.fill('input[aria-label="Save dashboard title field"]', dashboardTitle);
  log(`--> Set dashboard title: "${dashboardTitle}"`);
  await clickDashboardFinalSaveButton(page);
  log('--> Clicked "Save dashboard" button');
}

export async function createDashboardWithQueryVariable(
  page: Page,
  dsName: string,
  varName: string,
  varQuery: string,
  dashboardTitle: string
) {
  log('--> Creating dashboard with Query variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await openNewVariableEditor(page, 'query');

  await variableNameInput(page).fill(varName);
  log(`--> Set variable name to "${varName}"`);

  // Grafana 13 keeps the datasource + query behind an "Open variable editor" modal
  const openEditor = page.getByTestId('data-testid Query Variable editor open button').first();
  if (await openEditor.isVisible().catch(() => false)) {
    await openEditor.click();
    log('--> Opened the query variable editor modal');
  }

  // Select the datasource
  await page.click('input[aria-label="Select a data source"]');
  log('--> Clicked datasource input');
  await page
    .getByRole('option', { name: dsName, exact: true })
    .or(page.getByText(dsName, { exact: true }))
    .first()
    .click();
  log(`--> Selected datasource: ${dsName}`);

  // Set the query for the variable
  const textarea = await getVariableQueryTextarea(page);
  await textarea.fill(varQuery);
  log(`--> Set query for variable: "${varQuery}"`);

  // 13.2 confirms the modal with "Apply"; 13.1 applies edits live and only offers "Close"
  const applyModal = page.getByTestId('data-testid Query Variable editor apply button').first();
  const closeModal = page.getByRole('dialog').getByRole('button', { name: 'Close' }).first();
  if (await applyModal.isVisible().catch(() => false)) {
    await applyModal.click();
    log('--> Applied the query variable editor modal');
  } else if (await closeModal.isVisible().catch(() => false)) {
    await closeModal.click();
    log('--> Closed the query variable editor modal');
  }
  await applyVariableIfNeeded(page);

  await saveNewDashboardAs(page, dashboardTitle);
  log('--> Dashboard with variable created');
}

async function selectTypeInVariablePanel(page: Page, varType: String) {
  log('--> Try to opened variable type dropdown...');
  await page.click('[data-testid="data-testid Variable editor Form Type select"]');
  log('--> Variable type dropdown opened');

  // need to change the selector according to Grafana version
  const gfVersionMajor = (await getGrafanaVersion(page)).split('.')[0];
  log(`--> Detect grafana version: ${gfVersionMajor}`);
  if (gfVersionMajor === '12') {
    await page.click(`[data-testid="data-testid Select menu"]  >> span:has-text("${varType}")`);
  } else {
    await page.click(`[data-testid="data-testid Select option"]  >> span:has-text("${varType}")`);
  }
  log(`--> Typed "${varType}" into variable type input`);
  log(`--> Selected "${varType}" from dropdown`);
}

export async function createDashboardWithConstVariable(
  page: Page,
  dsName: string,
  varName: string,
  constValue: string,
  dashboardTitle: string
) {
  log('--> Creating dashboard with Const variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await openNewVariableEditor(page, 'constant');

  await variableNameInput(page).fill(varName);
  log(`--> Set variable name to "${varName}"`);

  await page
    .locator('[data-testid="data-testid Variable editor Form Constant Query field"]')
    .or(page.locator('[data-testid="data-testid variable-type Value field property editor"] input'))
    .first()
    .fill(constValue);
  log(`--> Set constant value to "${constValue}"`);

  await applyVariableIfNeeded(page);
  await saveNewDashboardAs(page, dashboardTitle);
  log('--> Dashboard with const variable created');
}

export async function createDashboardWithCustomMultiVariable(
  page: Page,
  dsName: string,
  varName: string,
  varValues: string[],
  dashboardTitle: string
): Promise<boolean> {
  log('--> Creating dashboard with Custom multi-value variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await openNewVariableEditor(page, 'custom');

  await variableNameInput(page).fill(varName);
  log(`--> Set variable name to "${varName}"`);

  // Grafana 13 keeps the values behind an "Open variable editor" modal
  const openValues = page.getByTestId('data-testid custom-variable-options-open-button').first();
  if (await openValues.isVisible().catch(() => false)) {
    await openValues.click();
    log('--> Opened the custom variable values modal');
  }
  await page.locator('[data-testid="data-testid custom-variable-input"]').first().fill(varValues.join(','));
  log(`--> Set custom variable values to "${varValues.join(',')}"`);
  const applyValues = page.getByTestId('data-testid custom-variable-apply-button').first();
  if (await applyValues.isVisible().catch(() => false)) {
    await applyValues.click();
    log('--> Applied the custom variable values modal');
  }

  // Enable Multi-value
  const multiSwitch = page
    .locator('input[data-testid="data-testid Variable editor Form Multi switch"]')
    .or(
      page.locator(
        '[data-testid="data-testid selection-options-category Multi-value field property editor"] input[role="switch"]'
      )
    )
    .first();
  await multiSwitch.waitFor({ state: 'attached', timeout: 10000 });
  await multiSwitch.check({ force: true });
  await expect(multiSwitch).toBeChecked();
  log('--> Enabled Multi-value for custom variable');

  await applyVariableIfNeeded(page);
  await saveNewDashboardAs(page, dashboardTitle);
  // No selection happens here: the historical post-save block probed dropdown options
  // 'sensorsB'/'sensorsC', which never exist (the values are sensorA..C), so it only
  // burned a 5s swallowed wait. The real selection lives in
  // executeQueryAndCapturePayloadMulti, which runs when this returns false.
  log('--> Dashboard with custom multi-value variable created');
  return false;
}

export async function createDashboardWithIntervalVariable(
  page: Page,
  dsName: string,
  varName: string,
  dashboardTitle: string
) {
  log('--> Creating dashboard with Interval variable');
  await page.goto('http://localhost:3000/dashboard/new');
  await openNewVariableEditor(page, 'interval');

  // Set variable name (default is "interval", but set it explicitly)
  await variableNameInput(page).fill(varName);
  log(`--> Set interval variable name to "${varName}"`);

  await applyVariableIfNeeded(page);
  await saveNewDashboardAs(page, dashboardTitle);
  log('--> Dashboard with interval variable created');
}

/**
 * Leaves the panel editor or the dashboard settings view. The button carries the
 * 'Back to dashboard' testid in the panel editor, but only a role/name in the
 * settings view — so try both, then confirm the "Unsaved changes" modal if it pops.
 */
async function backToDashboard(page: Page) {
  const candidates = [
    page.locator('button[data-testid="data-testid Back to dashboard button"]'),
    page.getByRole('button', { name: 'Back to dashboard' }),
  ];
  for (const candidate of candidates) {
    const visible = await candidate
      .first()
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (visible) {
      await candidate
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
      log('--> Clicked "Back to dashboard"');
      await dismissUnsavedChangesModal(page);
      return;
    }
  }
  log('--> "Back to dashboard" button not found or not visible, skipping.');
}

export async function executeQueryAndCapturePayload(
  page: Page,
  dsName: string,
  query: string
): Promise<{
  payload: any;
  response: PWResponse;
  responseBody: any;
}> {
  log('--> Preparing to execute query in panel');

  await backToDashboard(page);

  await clickAddPanelButton(page);
  log('--> Clicked to add new panel');
  await selectPanelDatasource(page, dsName);
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.fill(query);
  log(`--> Entered query:\n${query}`);

  // Wait for the request and response triggered by clicking "Run"
  const [queryRequest, queryResponse] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/ds/query') && req.method() === 'POST'),
    page.waitForResponse((res) => res.url().includes('/api/ds/query') && res.request().method() === 'POST'),
    page.getByTestId('data-testid RefreshPicker run button').click(),
  ]);
  log('--> Clicked "Run" button');

  // Parse and log the request payload
  let payload: any = null;
  try {
    const postData = queryRequest.postData();
    payload = postData ? JSON.parse(postData) : null;
    log('--> Request payload sent to backend:');
    log(JSON.stringify(payload, null, 2));
  } catch (e) {
    log('--> Failed to parse request payload');
  }
  expect(payload).not.toBeNull();

  // Parse and log backend response body
  let responseBody: any = null;
  try {
    responseBody = await queryResponse.json();
    log('--> Backend response:');
    log(JSON.stringify(responseBody, null, 2));
  } catch (e) {
    log('--> Failed to parse backend response body');
  }

  return { payload, response: queryResponse, responseBody };
}

export async function executeQueryAndCapturePayloadMulti(
  page: Page,
  dsName: string,
  query: string,
  indicator: boolean
): Promise<{
  payload: any;
  response: PWResponse;
  responseBody: any;
}> {
  log('--> Preparing to execute query in panel');

  await backToDashboard(page);

  await clickAddPanelButton(page);
  log('--> Clicked to add new panel');
  await selectPanelDatasource(page, dsName);
  const el = page.getByTestId('data-testid template variable');
  if ((await el.count()) > 0 && (await el.isVisible()) && indicator === false) {
    await el.click();
    // Wait for the variable dropdown options to render (count() below has no auto-wait)
    await page
      .getByText('sensorB', { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    for (const sensor of ['sensorB', 'sensorC']) {
      const option = page.getByText(sensor, { exact: true });
      if (await option.count()) {
        await option.click();
      }
    }
    // Close the dropdown so the selection is committed; no refresh click here — a
    // fire-and-forget run at this point can land its POST inside the capture window
    // below and satisfy it with an expr that predates the query fill
    await page.keyboard.press('Escape').catch(() => {});
    log('--> Selected all sensors for variable');
  } else {
    log('--> Element data-testid template variable Not Found');
  }
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.fill(query);
  log(`--> Entered query:\n${query}`);

  // Make sure the editor content is committed before triggering the run
  await expect(editor).toHaveValue(query);
  // Wait for the request and response triggered by clicking "Run". The variable
  // selection above can leave a variable-triggered query in flight, so match both
  // sides on the body actually carrying the filled query — matching by URL alone
  // could also pair a request and a response from two different exchanges.
  const carriesQuery = (postData: string | null) => (postData || '').includes(query.split('\n')[0]);
  const [queryRequest, queryResponse] = await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes('/api/ds/query') && req.method() === 'POST' && carriesQuery(req.postData())
    ),
    page.waitForResponse(
      (res) =>
        res.url().includes('/api/ds/query') &&
        res.request().method() === 'POST' &&
        carriesQuery(res.request().postData())
    ),
    page.getByTestId('data-testid RefreshPicker run button').click(),
  ]);
  log('--> Clicked "Run" button');

  // Parse and log the request payload
  let payload: any = null;
  try {
    const postData = queryRequest.postData();
    payload = postData ? JSON.parse(postData) : null;
    log('--> Request payload sent to backend:');
    log(JSON.stringify(payload, null, 2));
  } catch (e) {
    log('--> Failed to parse request payload');
  }
  expect(payload).not.toBeNull();

  // Parse and log backend response body
  let responseBody: any = null;
  try {
    responseBody = await queryResponse.json();
    log('--> Backend response:');
    log(JSON.stringify(responseBody, null, 2));
  } catch (e) {
    log('--> Failed to parse backend response body');
  }

  return { payload, response: queryResponse, responseBody };
}

export async function executeQueryAndValidate(
  page: Page,
  dsName: string,
  query: string,
  expectedConstantValue?: string
): Promise<{
  payload: any;
  response: PWResponse;
  responseBody: any;
}> {
  log('--> Preparing to execute query in panel');

  // Prepare to capture request & response
  let queryRequest: PWRequest | undefined;
  let queryResponse: PWResponse | undefined;

  // UI steps to create panel and execute query
  await backToDashboard(page);
  await clickAddPanelButton(page);
  log('--> Clicked to add new panel');
  await selectPanelDatasource(page, dsName);
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.fill(query);
  await expect(editor).toHaveValue(query);
  log(`--> Entered query:\n${query}`);

  // Wait for the request and response triggered by clicking "Run"
  const runPromise = Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/ds/query') && req.method() === 'POST'),
    page.waitForResponse((res) => res.url().includes('/api/ds/query') && res.request().method() === 'POST'),
  ]);
  await page.getByTestId('data-testid RefreshPicker run button').click();
  log('--> Clicked "Run" button');
  [queryRequest, queryResponse] = await runPromise;

  // Parse and log the request payload
  let payload: any = null;
  try {
    const postData = queryRequest.postData();
    payload = postData ? JSON.parse(postData) : null;
    log('--> Request payload sent to backend:');
    log(JSON.stringify(payload, null, 2));
  } catch (e) {
    log('--> Failed to parse request payload');
  }
  expect(payload).not.toBeNull();

  // Check constant in payload if needed
  if (expectedConstantValue) {
    const expr = payload?.queries?.[0]?.expr || '';
    log(`--> Checking if payload expr contains constant value: "${expectedConstantValue}"`);
    expect(expr).toContain(expectedConstantValue);
    log('--> Verified: payload contains the expected constant value.');
  }

  // Parse and log backend response body
  let responseBody: any = null;
  try {
    responseBody = await queryResponse.json();
    log('--> Backend response:');
    log(JSON.stringify(responseBody, null, 2));
  } catch (e) {
    log('--> Failed to parse backend response body');
  }

  return { payload, response: queryResponse, responseBody };
}

export async function findDatasourceLink(page: Page, dsName: string): Promise<Locator> {
  await page.goto('http://localhost:3000/connections/datasources');
  // Wait for the datasource list to render (count() below has no auto-wait)
  await page
    .getByRole('link', { name: dsName })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});

  let dsLocator = page.getByRole('link', { name: dsName });
  if (!(await dsLocator.count())) {
    dsLocator = page.locator(`h2 a:has-text("${dsName}")`);
  }
  if (!(await dsLocator.count())) {
    dsLocator = page.locator(`text="${dsName}"`);
  }
  return dsLocator;
}

export async function cleanupDashboard(page: Page, dashboardTitle: string) {
  log('--> Cleaning up: Deleting dashboard');
  const version = await getGrafanaVersion(page);
  log(`--> Grafana version detected: ${version}`);
  await page.goto('http://localhost:3000/dashboards');
  await openDashboardByTitle(page, dashboardTitle);
  log(`--> Opened dashboard "${dashboardTitle}"`);
  await openDashboardEdit(page);

  await clickDeleteDashboardButton(page, version);
  // Deleting navigates back to the dashboard list
  await page.waitForURL('**/dashboards**', { timeout: 10000 }).catch(() => {});
  log('--> Confirmed dashboard deletion');
}

async function getVariableQueryTextarea(page: Page) {
  let textarea = page.locator(
    '[data-testid="data-testid Variable editor Form Default Variable Query Editor textarea"]'
  );
  // count() has no auto-wait, so give the editor time to render before probing
  await textarea
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  if ((await textarea.count()) > 0 && (await textarea.first().isVisible({ timeout: 2000 }))) {
    log('--> Found textarea by data-testid');
    return textarea.first();
  }
  textarea = page.locator('textarea[aria-label="Variable editor Form Default Variable Query Editor textarea"]');
  if ((await textarea.count()) > 0 && (await textarea.first().isVisible({ timeout: 2000 }))) {
    log('--> Found textarea by aria-label');
    return textarea.first();
  }
  throw new Error('Could not find the variable query textarea using known selectors!');
}

export async function FinalTestValidation(responses: Array<{ url: string; json: any; status: number }>) {
  if (responses.length > 0) {
    const lastResponse = responses[responses.length - 1];
    log('--> Last /api/ds/query response:');
    console.log(JSON.stringify(lastResponse.json, null, 2));

    if (lastResponse.status === 200) {
      log('--> Test completed successfully');
    } else {
      log(`--> Test failed — Last response status: ${lastResponse.status}`);
    }
  } else {
    log('--> No /api/ds/query response captured.');
  }
}

export async function createNewDashboardAndSelectWarp10(page: Page) {
  //Click "Add visualization"
  await clickAddPanelButton(page);
  console.log('--> Clicked "Add visualization"');

  //Select the Warp10-Clever-Cloud datasource
  await selectPanelDatasource(page, 'Warp10-Clever-Cloud');
}

export async function deleteDatasource(
  page: Page,
  dsName: string,
  deleteSelectors: string[] = [
    'button[data-testid="Data source settings page Delete button"]',
    '[data-testid="Data source settings page Delete button"]',
    '[data-testid="data-testid Confirm Modal Danger Button"]',
    'button[data-testid="data-testid Confirm Modal Danger Button"]',
    'button:has-text("Delete")',
  ]
) {
  log(`--> Attempting to remove datasource "${dsName}"`);
  const dsLocator = await findDatasourceLink(page, dsName);

  if (await dsLocator.count()) {
    await dsLocator.first().click();
    log(`--> Opened datasource settings for "${dsName}"`);

    let deleteBtn;
    for (const sel of deleteSelectors) {
      deleteBtn = await page.$(sel);
      if (deleteBtn) {
        await deleteBtn.click();
        log(`--> Clicked Delete datasource button using selector: ${sel}`);
        break;
      }
    }

    // Confirm deletion, handling both testId and text cases
    const confirmBtn = page.getByTestId('data-testid Confirm Modal Danger Button');
    if (await confirmBtn.count()) {
      // On a loaded machine the modal animation can keep the button "unstable" forever,
      // hanging a plain click until the test timeout — bound it and fall back to a forced click
      try {
        await confirmBtn.click({ timeout: 10000 });
      } catch {
        await confirmBtn.click({ force: true, timeout: 5000 }).catch(() => {});
      }
      log('--> Confirmed datasource deletion');
    } else {
      const altConfirm = page.locator('button:has-text("Delete")');
      if (await altConfirm.count()) {
        await altConfirm.click();
        log('--> Confirmed datasource deletion (by text)');
      } else {
        log('Confirm deletion button not found for datasource');
      }
    }
  } else {
    log(`Datasource "${dsName}" not found for removal`);
  }
}

export async function addConstantToDatasource(page: Page, dsName: string, constName: string, constValue: string) {
  registerDatasource(dsName);
  await deleteDatasource(page, dsName);
  log('--> Navigating to new datasource creation');
  await openNewWarp10Datasource(page);

  log('--> Configuring basic settings');
  await setDatasourceName(page, dsName);
  await page.fill('#url', 'http://warp10:8080');

  log('--> Adding constant');
  await page.locator('#constant_name').fill(constName);
  await page.locator('#constant_value').fill(constValue);
  await page.locator('#btn_constant').click();

  log('--> Saving datasource');
  // Same flow as setupDatasource: the datasource already exists, "Save & test" issues a PUT
  const saveResponse = page
    .waitForResponse((res) => res.url().includes('/api/datasources') && res.request().method() === 'PUT', {
      timeout: 15000,
    })
    .catch(() => null);
  await page.getByRole('button', { name: 'Save & test' }).click();
  await saveResponse;
}

export async function createDashboardAndRunQuery(
  page: Page,
  dsName: string,
  expr: string,
  { expectConstant, returnResponse }: { expectConstant?: string; returnResponse?: boolean } = {}
) {
  log('--> Creating dashboard and panel');
  await page.goto('http://localhost:3000/dashboard/new');

  await clickAddPanelButton(page);

  log('--> Selecting datasource');
  await selectPanelDatasource(page, dsName);

  await page.locator('.query-editor-row textarea').first().fill(expr);

  log('--> Running query and capturing request...');
  const runButton = page.getByTestId('data-testid RefreshPicker run button');
  let request: PWRequest;
  let response: PWResponse | undefined;

  if (returnResponse) {
    [request, response] = (await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/ds/query') &&
          req.method() === 'POST' &&
          (!expectConstant || (req.postData() || '').includes(expectConstant))
      ),
      page.waitForResponse((res) => res.url().includes('/api/ds/query') && res.request().method() === 'POST'),
      runButton.click(),
    ])) as [PWRequest, PWResponse, void];
  } else {
    [request] = (await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/ds/query') &&
          req.method() === 'POST' &&
          (!expectConstant || (req.postData() || '').includes(expectConstant))
      ),
      runButton.click(),
    ])) as [PWRequest, void];
  }

  const payload = JSON.parse(request.postData() || '{}');
  log('--> Request payload captured:');
  console.log(JSON.stringify(payload, null, 2));

  if (expectConstant) {
    expect(payload.queries?.[0]?.expr).toContain(expectConstant);
    log(`--> Constant ${expectConstant} found in payload: test PASSED`);
  }

  return returnResponse && response ? await response.json() : undefined;
}

export async function goToDashboard(page: Page, dashboardName: string) {
  const directDashboard = page.getByRole('link', { name: dashboardName });
  // The probes below use count()/isVisible() (no auto-wait): let the dashboard
  // list render first, whichever entry shows up
  await directDashboard
    .first()
    .or(page.getByText(dashboardName, { exact: true }).first())
    .or(page.getByText('General', { exact: true }).first())
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  if ((await directDashboard.count()) > 0 && (await directDashboard.first().isVisible())) {
    await directDashboard.first().click();
    console.log('Clicked direct "${dashboardName}" link.');
    return;
  }

  const generalLink = page.getByText('General', { exact: true });
  if ((await generalLink.count()) > 0 && (await generalLink.first().isVisible())) {
    await generalLink.first().click();
    console.log('Clicked "General" section.');

    const nestedDashboard = page.getByText(dashboardName, { exact: true });
    if ((await nestedDashboard.count()) > 0 && (await nestedDashboard.first().isVisible())) {
      await nestedDashboard.first().click();
      console.log('Clicked nested "${dashboardName}".');
      return;
    }
  }

  throw new Error(`Neither "${dashboardName}" nor "General > ${dashboardName}" was found.`);
}

export async function goToNewDashboard(page: Page) {
  await goToDashboard(page, 'New dashboard');
}

export async function createNewPanel(page: Page, panelTitle = 'Test Editor JSON', panelQuery = '1 2 +') {
  // Step 1: Go to a new dashboard
  log('--> Navigating to a new dashboard');
  await goToNewDashboard(page);

  // Step 2: Enter edit mode (the provisioned dashboard opens in view mode)
  await enterDashboardEditMode(page);
  const sidebar = await usesEditSidebar(page);

  // Step 3: Add a visualization
  if (sidebar) {
    await addPanelViaSidebar(page);
  } else {
    log('--> Clicking "Add" then "Visualization"');
    const addBtn = page
      .getByTestId('data-testid Add button')
      .or(page.getByTestId('data-testid Add panel button'))
      .first();
    await addBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addBtn.click();
    const addVisBtn = page.getByTestId('data-testid Add new visualization menu item').first();
    await addVisBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addVisBtn.click();
  }
  await ensurePanelOptionsPane(page);

  // Step 4: Fill panel title, datasource and query
  log('--> Setting panel title');
  await page.getByTestId('data-testid Panel editor option pane field input Title').first().fill(panelTitle);

  await selectPanelDatasource(page, 'Warp10-Clever-Cloud');

  log('--> Filling query in editor');
  const editor = page.locator('.query-editor-row textarea').first();
  await editor.waitFor({ state: 'visible', timeout: 5000 });
  await editor.fill(panelQuery);

  // Step 5: Run the query
  log('--> Running query');
  const refreshButton = page.getByTestId('data-testid RefreshPicker run button');
  await refreshButton.first().waitFor({ state: 'visible', timeout: 3000 });
  await refreshButton.first().click();

  // Steps 6-8: Read the dashboard JSON model, then leave the UI clean
  const jsonContent = sidebar ? await readJsonModelFromSidebar(page) : await readJsonModelFromSaveDrawer(page);
  log('--> JSON content retrieved:');
  log(jsonContent);

  // Step 9: Parse JSON and validate required fields
  log('--> Parsing JSON and validating required keys');
  let model;
  try {
    model = JSON.parse(jsonContent);
  } catch (e) {
    throw new Error('Textarea does not contain valid JSON');
  }
  const hasExpr = searchObject(model, 'expr', '1 2 +');
  const hasTitle = searchObject(model, 'title', 'Test Editor JSON');

  log(`--> "expr: 1 2 +" found: ${hasExpr}`);
  log(`--> "title: Test Editor JSON" found: ${hasTitle}`);

  expect(hasExpr).toBe(true);
  expect(hasTitle).toBe(true);
}

/**
 * Grafana 13: the sidebar "Code" pane shows the whole dashboard JSON in a Monaco
 * editor. Nothing to clean up afterwards — the dashboard is never saved.
 */
async function readJsonModelFromSidebar(page: Page): Promise<string> {
  await backToDashboard(page);
  log('--> Opening the sidebar "Code" pane');
  await page
    .getByTestId('data-testid Dashboard Sidebar code button')
    .or(page.getByRole('button', { name: 'Code', exact: true }))
    .first()
    .click();
  log('--> Extracting JSON model');
  return getPanelJsonModel(page);
}

/**
 * Up to Grafana 12: the save drawer of a new dashboard exposes its JSON model in a
 * Monaco editor. Close the drawer and discard the panel afterwards so nothing is saved.
 */
async function readJsonModelFromSaveDrawer(page: Page): Promise<string> {
  log('--> Saving panel/dashboard');
  const saveBtn = page.getByRole('button', { name: 'Save' });
  await saveBtn.first().waitFor({ state: 'visible', timeout: 3000 });
  await saveBtn.first().click();
  // Wait for the save drawer to open before extracting the JSON model
  await page
    .getByTestId('data-testid Drawer close')
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});

  log('--> Extracting JSON model');
  const jsonContent = await getPanelJsonModel(page);

  log('--> Cleaning up: closing JSON drawer');
  const exitSave = page.getByTestId('data-testid Drawer close').or(page.locator('button[aria-label="Drawer close"]'));
  if ((await exitSave.count()) > 0 && (await exitSave.first().isVisible())) {
    await exitSave.first().click();
    await exitSave
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});
  } else {
    log('--> Drawer close button not found by any known selector. Skipping.');
  }

  // "Discard" and confirm are optional depending on version/state
  log('--> Attempting cleanup with "Discard" button');
  const discardBtn = page.getByRole('button', { name: 'Discard' });
  if ((await discardBtn.count()) > 0 && (await discardBtn.first().isVisible())) {
    log('--> "Discard" button found, clicking...');
    await discardBtn.first().click();

    const confirmBtn = page.getByTestId('data-testid Confirm Modal Danger Button');
    if ((await confirmBtn.count()) > 0 && (await confirmBtn.first().isVisible())) {
      log('--> Confirm modal found after discard, clicking...');
      await confirmBtn.first().click();
    } else {
      log('--> No confirm modal appeared after discard.');
    }
  } else {
    log('--> No "Discard" button found, skipping discard cleanup.');
  }
  return jsonContent;
}

function searchObject(obj: any, key: string, value: string): boolean {
  // This is a deep search. Stops at first match.
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  if (obj[key] === value) {
    return true;
  }
  for (const k of Object.keys(obj)) {
    if (searchObject(obj[k], key, value)) {
      return true;
    }
  }
  return false;
}

export async function getPanelJsonModel(page: Page): Promise<string> {
  // The JSON drawer renders asynchronously, so poll the known sources for a while
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    // Try Monaco editor (used in recent Grafana versions) first.
    const monacoContent = await page.evaluate(() => {
      // @ts-ignore
      return window.monaco?.editor?.getEditors?.()[0]?.getValue?.() ?? '';
    });
    if (monacoContent && monacoContent.trim().startsWith('{')) {
      log('--> JSON model found in Monaco editor');
      return monacoContent;
    }
    // List of known textarea selectors for the JSON model
    const selectors = ['textarea.css-rn6xsd', 'textarea.css-1q116cm', 'textarea.css-ch361'];
    for (const selector of selectors) {
      const textarea = page.locator(selector);
      if (await textarea.count()) {
        const value = await textarea.inputValue();
        if (value && value.trim().startsWith('{')) {
          log(`--> JSON model found in textarea: ${selector}`);
          return value;
        }
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Could not extract JSON model from panel editor using any known selector!');
}

export async function clickEditButton(page: Page) {
  const editBtn = page.locator('button[data-testid="data-testid Edit dashboard button"]');

  if ((await editBtn.count()) > 0) {
    page.click('button[data-testid="data-testid Edit dashboard button"]');
    return;
  }

  throw new Error('Edit button in dashboard not found');
}

export async function clickEditPanelButton(page: Page, panelTitle: string) {
  await page.locator(`button[title="Menu"][data-testid="data-testid Panel menu ${panelTitle}"]`).click();
  await page.locator(`[data-testid="data-testid Panel menu item Edit"]`).click();
}

export async function fillPairAndClickAdd({
  nameInput,
  valueInput,
  name,
  value,
  addButton,
  label,
  page,
}: {
  nameInput: Locator;
  valueInput: Locator;
  name: string;
  value: string;
  addButton?: Locator;
  label: string;
  page: Page;
}) {
  log(`--> Filling ${label} name`);
  await nameInput.pressSequentially(name);
  await expect(nameInput).toHaveValue(name);
  const actualName = await nameInput.inputValue();
  log(`--> ${label} Name value after typing: "${actualName}"`);
  if (actualName === name) {
    log(`--> ${label} name added successfully`);
  }

  log(`--> Filling ${label} value`);
  await valueInput.pressSequentially(value);
  await expect(valueInput).toHaveValue(value);
  const actualValue = await valueInput.inputValue();
  log(`--> ${label} Value after typing: "${actualValue}"`);
  if (actualValue === value) {
    log(`--> ${label} value added successfully`);
  }

  if (addButton) {
    log(`--> Clicking ${label} Add button...`);
    await addButton.click();
  }
}

export async function logVisibility(page: Page, label: string) {
  try {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    log(`--> '${label}' is visible`);
  } catch (error) {
    console.error(`--> '${label}' is NOT visible`);
  }
}

/**
 * Arms a wait for the round-trip a "Save & test" click triggers: the PUT-and-health
 * exchange ends with GET /api/datasources/uid/<uid>/health. Arm BEFORE clicking,
 * await after. Resolves null on timeout so callers decide what a missing health
 * response means.
 */
export function waitForHealthCheckResponse(page: Page, timeout = 15000): Promise<PWResponse | null> {
  return page
    .waitForResponse((res) => res.url().includes('/api/datasources') && res.url().includes('/health'), { timeout })
    .catch(() => null);
}

export async function testDatasourceInvalidURL(page: Page, urlSelector = '#url') {
  const urlInput = page.locator(urlSelector);
  await urlInput.fill('http://localhost:9999');
  log('--> Attempting to save and test datasource with invalid URL...');
  await page.getByRole('button', { name: 'Save & test' }).click();
  // A transient "Testing... this could take up to a couple of minutes" info alert shows
  // first with the same testid, so target the final alert by its text. Health check goes
  // through the backend plugin; under a fully parallel run it can take well over 3s.
  const alertSelector = page
    .locator('[data-testid="data-testid Alert info"]')
    .filter({ hasText: 'connection refused' })
    .first();
  await expect(alertSelector).toBeVisible({ timeout: 15000 });
  const alertText = await alertSelector.textContent();
  expect(alertText).toContain('connect: connection refused');
}
