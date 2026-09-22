import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility — axe-core', () => {
  test('page de connexion — pas de violations WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/login');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Afficher les violations dans la console
    if (results.violations.length > 0) {
      console.log('\n❌ Violations d\'accessibilité détectées:');
      for (const v of results.violations) {
        console.log(`  ${v.id}: ${v.description} (${v.nodes.length} occurrences)`);
        console.log(`    Impact: ${v.impact}`);
        console.log(`    Aide: ${v.helpUrl}`);
      }
    } else {
      console.log('\n✅ Aucune violation d\'accessibilité détectée');
    }

    expect(results.violations).toHaveLength(0);
  });

  test('page d\'accueil — pas de violations WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.log('\n❌ Violations d\'accessibilité détectées:');
      for (const v of results.violations) {
        console.log(`  ${v.id}: ${v.description} (${v.nodes.length} occurrences)`);
        console.log(`    Impact: ${v.impact}`);
      }
    }

    expect(results.violations).toHaveLength(0);
  });
});
