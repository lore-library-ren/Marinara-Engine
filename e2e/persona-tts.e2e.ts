import { expect, test } from "@playwright/test";
import { APP_VERSION } from "../packages/shared/src/constants/defaults.js";
import { seedUIState } from "./ui-state-fixture.js";
import { clickTopbarPanel } from "./topbar-navigation.js";

test.use({ serviceWorkers: "block" });

test("persona voice controls save, reload, and reset without changing character voices", async ({ page }, testInfo) => {
  await seedUIState(page, { hasCompletedOnboarding: true, sidebarOpen: false });
  await page.addInitScript((version) => localStorage.setItem("marinara:whats-new:seen-version", version), APP_VERSION);
  const initial = await (await page.request.get("/api/tts/config")).json();
  let config = {
    ...initial,
    enabled: true,
    source: "cartesia",
    voiceMode: "per-character",
    voice: "default",
    voiceAssignments: [{ characterId: "character", characterName: "Caleb", voice: "caleb-voice" }],
    personaVoiceAssignments: [],
  };
  await page.route("**/api/tts/config", async (route) => {
    if (route.request().method() === "PUT") config = route.request().postDataJSON();
    await route.fulfill({ json: config });
  });
  await page.route("**/api/characters/personas/list", (route) =>
    route.fulfill({ json: [{ id: "test-persona", name: "Lolo" }] }),
  );
  await page.route("**/api/tts/voices*", (route) =>
    route.fulfill({
      json: {
        voices: ["persona-voice"],
        voiceOptions: [{ id: "persona-voice", name: "Persona sample" }],
        source: "cartesia",
        fromProvider: true,
      },
    }),
  );
  const open = async () => {
    await page.goto("/");
    await clickTopbarPanel(page, "connections");
    const card = page
      .locator('[data-component="RightPanel"]')
      .getByText("Text to Speech", { exact: true })
      .locator("xpath=../../..");
    await card.getByTitle("Expand", { exact: true }).click();
    return card;
  };
  let card = await open();
  const input = () => card.getByLabel("Voice for persona Lolo", { exact: true });
  await expect(input()).toBeVisible();
  await input().fill("persona-voice");
  await expect
    .poll(() => config.personaVoiceAssignments)
    .toEqual([{ personaId: "test-persona", voice: "persona-voice" }]);
  expect(config.voiceAssignments[0].voice).toBe("caleb-voice");
  card = await open();
  await expect(input()).toHaveValue("persona-voice");
  await input().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("persona-voices-settings.png") });
  await card.getByRole("button", { name: "Reset Lolo to default voice" }).click();
  await expect.poll(() => config.personaVoiceAssignments).toEqual([]);
});
