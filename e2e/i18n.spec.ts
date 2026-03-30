import { test, expect } from '@playwright/test'

const NWV_STORAGE_KEY = 'networth-visualizer-state-v1'

test.describe('i18n', () => {
  test('pt-BR shows translated app title and settings heading', async ({ page }) => {
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, JSON.stringify({ lang: 'pt-BR' }))
    }, NWV_STORAGE_KEY)
    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: /visualizador de patrimônio/i }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: /configurações/i })).toBeVisible()
  })
})
