import { expect, test } from "@playwright/test";

test("procesa referencia y ZIP localmente", async ({ page }) => {
  const referencePath = process.env.CONCILIA_REFERENCE;
  const zipPath = process.env.CONCILIA_ZIP;
  test.skip(!referencePath || !zipPath, "Define CONCILIA_REFERENCE y CONCILIA_ZIP.");

  await page.goto(".");
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(referencePath);
  await expect(page.getByText(/Referencia lista/)).toBeVisible();

  await inputs.nth(1).setInputFiles(zipPath);
  await page.getByRole("button", { name: "Conciliar archivos" }).click();
  await expect(page.getByText("Conciliación completada")).toBeVisible({ timeout: 120_000 });
  const downloadButton = page.getByRole("button", { name: "Descargar Excel" });
  await expect(downloadButton).toBeVisible();
  await expect(page.locator(".metric").filter({ hasText: "Filas" }).locator("strong")).not.toHaveText("0");

  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});
