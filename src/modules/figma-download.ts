import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Validate environment variables
const USER_EMAIL = process.env.FIGMA_EMAIL;
const USER_PASS = process.env.FIGMA_PASSWORD;
const FIGMA_FILE_URL = process.env.TEST_FILE_URL;
const DOWNLOADS_PATH = path.resolve(process.env.DOWNLOADS_PATH || 'downloads');
const WAIT_TIMEOUT = 10000; // 10 seconds to avoid anti-automation detection

// Check for required variables
if (!USER_EMAIL || !USER_PASS || !FIGMA_FILE_URL) {
  throw new Error('Missing required environment variables: FIGMA_EMAIL, FIGMA_PASSWORD, or TEST_FILE_URL');
}

async function downloadFigmaFile() {
  // Ensure downloads directory exists
  fs.mkdirSync(DOWNLOADS_PATH, { recursive: true });

  // Launch browser
  const browser = await chromium.launch({ 
    headless: true, // Set to false for debugging
    args: ['--disable-blink-features=AutomationControlled'] // Bypass some anti-automation detection
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Navigate to Figma login page
    console.log('Navigating to Figma login page...');
    await page.goto('https://www.figma.com/login', { timeout: 60000, waitUntil: 'domcontentloaded' });

    // Fill in email and password
    console.log('Filling login credentials...');
    await page.fill('input[name="email"]', USER_EMAIL!, { timeout: 10000 });
    await page.fill('input[name="password"]', USER_PASS!, { timeout: 10000 });

    // Submit login form
    console.log('Submitting login form...');
    await page.click('button[type="submit"]', { timeout: 10000 });

    // Wait for navigation to complete after login
    console.log('Waiting for post-login navigation...');
    await page.waitForURL(/.*figma.com\/files.*/, { timeout: 60000 });

    // Navigate to the specific Figma file
    console.log('Navigating to Figma file...');
    await page.goto(FIGMA_FILE_URL!, { timeout: 60000, waitUntil: 'domcontentloaded' });

    // Wait for page to be fully loaded
    console.log('Waiting for page to stabilize...');
    await page.waitForLoadState('networkidle', { timeout: 60000 });

    // Add delay to avoid anti-automation detection
    console.log(`Waiting ${WAIT_TIMEOUT / 1000} seconds to avoid bot detection...`);
    await page.waitForTimeout(WAIT_TIMEOUT);

    // Attempt download via main menu (from codegen)
    console.log('Attempting download via main menu...');
    let download;
    try {
      // Click the main menu button
      console.log('Clicking main menu button...');
      await page.getByRole('button', { name: 'Main menu' }).click({ timeout: 10000 });

      // Click the File menu option
      console.log('Clicking File menu...');
      await page.getByTestId('dropdown-option-File').getByText('File').click({ timeout: 10000 });

      // Click "Save local copy..."
      console.log('Clicking Save local copy...');
      await page.getByText('Save local copy…').click({ timeout: 10000 });

      // Wait for download
      console.log('Waiting for download...');
      download = await page.waitForEvent('download', { timeout: 15000 });
    } catch (menuError) {
      console.error('Main menu approach failed, falling back to command palette:', menuError);

      // Fallback to command palette
      console.log('Opening command palette with Cmd + / or Ctrl + /...');
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+/' : 'Control+/');

      // Wait for command palette input
      console.log('Waiting for command palette input...');
      const inputField = await page.locator('[data-testid="quick-actions-search-input"]').first();
      try {
        await inputField.waitFor({ state: 'visible', timeout: 15000 });
        console.log('Command palette input found:', await inputField.evaluate((el: HTMLElement) => el.outerHTML));
      } catch (error) {
        console.error('Command palette input not found, proceeding to type anyway...');
      }

      // Type "save" to select "Save local copy..."
      console.log('Typing "save" in command palette...');
      await page.keyboard.type('save', { delay: 100 });

      // Press Enter to select the first option
      console.log('Pressing Enter to select "Save local copy..."');
      await page.keyboard.press('Enter');

      // Wait for download
      console.log('Waiting for download (fallback)...');
      download = await page.waitForEvent('download', { timeout: 15000 });
    }

    // Handle the download
    console.log('Processing download...');
    const suggestedFileName = await download.suggestedFilename();
    const finalPath = path.join(DOWNLOADS_PATH, suggestedFileName);

    // Save the downloaded file
    console.log('Saving downloaded file...');
    await download.saveAs(finalPath);
    console.log(`File downloaded and saved to: ${finalPath}`);
  } catch (error) {
    console.error('Error during automation:', error);
    // Take a screenshot for debugging
    await page.screenshot({ path: path.join(DOWNLOADS_PATH, 'error-screenshot.png') });
  } finally {
    // Close the browser
    console.log('Closing browser...');
    await browser.close();
  }
}

// Run the script
downloadFigmaFile().catch(console.error);