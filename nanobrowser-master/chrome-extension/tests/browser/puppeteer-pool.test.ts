/**
 * Test file to verify PuppeteerPool behavior
 * This demonstrates how the persistent connection reduces cold start time
 */

import { puppeteerPool } from '../../src/background/browser/puppeteer-pool';

export async function testPuppeteerPoolPerformance(tabId: number): Promise<void> {
  console.time('First connection (cold start)');
  const firstConnection = await puppeteerPool.getConnection(tabId);
  console.timeEnd('First connection (cold start)');

  if (!firstConnection) {
    console.error('Failed to establish first connection');
    return;
  }

  // Simulate detaching without disconnecting (as Page.detachPuppeteer now does)
  console.log('Simulating detach without disconnect...');

  // Wait a bit to simulate time between agent switches
  await new Promise(resolve => setTimeout(resolve, 100));

  console.time('Second connection (warm - should be instant)');
  const secondConnection = await puppeteerPool.getConnection(tabId);
  console.timeEnd('Second connection (warm - should be instant)');

  if (!secondConnection) {
    console.error('Failed to get second connection');
    return;
  }

  // Verify it's the same connection
  console.log('Same browser instance?', firstConnection.browser === secondConnection.browser);
  console.log('Same page instance?', firstConnection.page === secondConnection.page);

  // Test connection validity
  try {
    await secondConnection.page.evaluate(() => document.title);
    console.log('✅ Connection is still valid and functional');
  } catch (error) {
    console.error('❌ Connection validation failed:', error);
  }

  console.log(`Active connections in pool: ${puppeteerPool.getConnectionCount()}`);
}