import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.LOCAL_LLM_LAB_URL ?? "http://127.0.0.1:5173/";
const outDir = path.resolve("test-artifacts");
const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "mobile-390", width: 390, height: 844 }
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  const results = [];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea", { timeout: 30_000 });
    await page.waitForFunction(() => {
      const text = document.body.textContent ?? "";
      return text.includes("Gemma") || text.includes("Qwen") || text.includes("TranslateGemma");
    }, undefined, { timeout: 30_000 });

    const closedState = await page.evaluate(() => {
      const composer = [...document.querySelectorAll("textarea")].at(-1);
      const composerRect = composer?.getBoundingClientRect();
      const chat = document.querySelector("section");
      const chatRect = chat?.getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        composerVisible: Boolean(composerRect && composerRect.top >= 0 && composerRect.bottom <= window.innerHeight),
        chatVisible: Boolean(chatRect && chatRect.top >= 0 && chatRect.bottom <= window.innerHeight + 2),
        composerDisabled: composer?.hasAttribute("disabled") ?? true,
        composerShellVisible: Boolean(document.querySelector('[data-testid="composer-shell"]')?.getClientRects().length),
        sweetSpotVisible: Boolean((document.body.textContent ?? "").match(/sweet spot|balanced|fit/i)),
        sessionBusVisible: window.innerWidth < 1024 || Boolean(document.querySelector('[data-testid="session-bus"]')?.textContent?.match(/Session Bus|current chat route/i)),
        gameModeDockVisible: window.innerWidth < 1024 || Boolean(document.querySelector('[data-testid="game-mode-dock"]')?.textContent?.match(/Game Mode Bay|Clear runtimes|Already clear/i)),
        roleSkinApplied: Boolean(document.querySelector('[class*="control-grid-theme-"]')) && Boolean(document.querySelector('[class*="model-stage-shell-"]')),
        promptActionDockVisible: Boolean(document.querySelector('[data-testid="prompt-action-dock"]')?.textContent?.match(/Quick actions|draft only/i)),
        agentRouteVisible: window.innerWidth < 640 || Boolean(document.querySelector('[data-testid="agent-route-board"]')?.textContent?.match(/Agent route|command path|input|answer/i)),
        routeTraceVisible:
          window.innerWidth < 640 ||
          Boolean(document.querySelector('[data-testid="route-trace"]')?.textContent?.match(/context|runtime|reply/i)),
        capabilityRunwayVisible:
          window.innerWidth < 640 ||
          Boolean([...document.querySelectorAll('[data-testid="capability-runway"]')].some((element) => element.getClientRects().length > 0 && element.textContent?.match(/Text|Files|Vision|Audio/i))),
        roleToneApplied:
          window.innerWidth < 640 ||
          (document.querySelector('[data-testid="capability-runway"]')?.getAttribute("data-tone") === document.querySelector('[data-testid="agent-route-board"]')?.getAttribute("data-tone") &&
            Boolean(document.querySelector('[data-testid="capability-runway"]')?.getAttribute("data-tone"))),
        headerFitVisible: window.innerWidth < 768 || Boolean(document.querySelector('[data-testid="header-fit-pill"]')?.textContent?.match(/fit/i)),
        headerLoadoutVisible: window.innerWidth < 1280 || Boolean(document.querySelector('[data-testid="header-loadout-strip"]')?.textContent?.match(/ollama|vllm|primary|secondary|t\/s|~/i)),
        runtimeCoreSignalRailVisible: Boolean(document.querySelector('[data-testid="runtime-core-signal-rail"]')?.textContent?.match(/state|link|engine|port/i)),
        runtimeCommandConsoleVisible:
          window.innerWidth < 1024 ||
          Boolean(document.querySelector('[data-testid="runtime-command-console"]')?.textContent?.match(/command console|Runtime Control Plane|target|engine|gpu/i)),
        premiumSurfacesVisible:
          document.querySelectorAll(".surface-premium").length >= (window.innerWidth < 1024 ? 2 : 3) &&
          Boolean(document.querySelector(".game-mode-button")) &&
          (window.innerWidth < 1024 || Boolean(document.querySelector(".command-console-surface"))),
        mobileSignalRailVisible: window.innerWidth >= 640 || Boolean(document.querySelector('[data-testid="mobile-signal-rail"]')?.textContent?.match(/VRAM|FIT|STATE/i)),
        mobileStageCapsuleVisible: window.innerWidth >= 640 || Boolean(document.querySelector('[data-testid="mobile-stage-capsule"]')?.textContent?.match(/fit|Quick actions|Gemma|Qwen/i)),
        mobileRoutePanelVisible:
          window.innerWidth >= 640 ||
          Boolean(document.querySelector('[data-testid="mobile-route-panel"]')?.textContent?.match(/input|route|load|answer/i)),
        mobilePromptRailReadable:
          window.innerWidth >= 640 ||
          Boolean([...document.querySelectorAll('[data-testid="prompt-action-dock"][data-rail="composer"] button')].every((button) => button.getBoundingClientRect().width >= 150)),
        chatHeaderCompact: (() => {
          const rect = document.querySelector('[data-testid="chat-header"]')?.getBoundingClientRect();
          if (!rect) return false;
          return rect.height <= (window.innerWidth < 640 ? 178 : 126);
        })(),
        headerCapabilityPipsVisible:
          window.innerWidth < 1024 ||
          Boolean(document.querySelector('[data-testid="header-capability-pips"]')?.textContent?.match(/Text|File|Visi|Audi/i))
      };
    });
    await page.screenshot({ path: path.join(outDir, `${viewport.name}.png`), fullPage: true });

    await page.keyboard.press("Control+K");
    await page.waitForSelector('[data-testid="selector-title-bar"]', { timeout: 10_000 });
    const selectorShortcutState = await page.evaluate(() => ({
      opened: Boolean(document.querySelector('[data-testid="selector-title-bar"]')),
      searchFocused: document.activeElement === document.querySelector('[data-testid="selector-search-input"]'),
      shortcutAffordanceVisible: window.innerWidth < 768 || Boolean(document.querySelector('[data-testid="selector-shortcut-affordance"]')?.getClientRects().length),
      shortcutA11yBound: document.querySelector('header button[aria-keyshortcuts~="Control+K"]')?.getAttribute("aria-keyshortcuts")?.includes("Meta+K") ?? false
    }));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-testid="selector-title-bar"]'), undefined, { timeout: 10_000 });
    selectorShortcutState.closedWithEscape = await page.evaluate(() => !document.querySelector('[data-testid="selector-title-bar"]'));

    const promptButtons = page.locator('[data-testid="prompt-action-dock"] button').filter({ visible: true });
    const promptCount = await promptButtons.count();
    let promptActionState = { checked: false, composerFilled: false, focused: false };
    if (promptCount > 0) {
      await promptButtons.first().click();
      await page.waitForFunction(() => {
        const composer = [...document.querySelectorAll("textarea")].at(-1);
        return document.activeElement === composer;
      }, undefined, { timeout: 5_000 });
      const promptDraft = await page.evaluate(() => {
        const composer = [...document.querySelectorAll("textarea")].at(-1);
        return {
          value: composer?.value ?? "",
          focused: document.activeElement === composer,
          composerArmed: Boolean(document.querySelector('[data-testid="composer-shell"]')?.className?.includes("border-cyan"))
        };
      });
      promptActionState = { checked: true, composerFilled: promptDraft.value.trim().length > 8, focused: promptDraft.focused, composerArmed: promptDraft.composerArmed };
      await page.screenshot({ path: path.join(outDir, `${viewport.name}-composer-armed.png`), fullPage: true });
      await page.locator("textarea").last().fill("");
    }

    let mobileConsoleState = { checked: false, visible: true, hasRuntime: true, hasSession: true };
    if (viewport.width < 640) {
      await page.locator('[data-testid="mobile-console-button"]').click();
      await page.waitForSelector('[data-testid="mobile-console-drawer"]', { timeout: 10_000 });
      mobileConsoleState = await page.evaluate(() => {
        const drawer = document.querySelector('[data-testid="mobile-console-drawer"]');
        const text = drawer?.textContent ?? "";
        return {
          checked: true,
          visible: Boolean(drawer),
          hasRuntime: /Runtime|Runtime Dashboard/i.test(text),
          hasSession: /Session Bus|current chat route/i.test(text),
          hasGameMode: /Game Mode Bay|Clear runtimes|Already clear/i.test(text),
          solidSurface: drawer?.getAttribute("data-surface") === "solid" && !(drawer?.className ?? "").includes("backdrop-blur")
        };
      });
      await page.screenshot({ path: path.join(outDir, `${viewport.name}-console.png`), fullPage: true });
      await page.locator('[data-testid="mobile-console-close"]').click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="mobile-console-drawer"]'), undefined, { timeout: 10_000 });
    }

    const selectorButton = page.locator("header button").first();
    await selectorButton.click();
    await page.waitForSelector("text=LLM 선택", { timeout: 10_000 });
    const openState = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      popoverVisible: Boolean([...document.querySelectorAll("section")].some((section) => section.textContent?.includes("LLM 선택"))),
      previewVisible: Boolean((document.body.textContent ?? "").match(/장착|재장착|설치|벤치|해제/)),
      modelCardsVisible: Boolean((document.body.textContent ?? "").match(/Gemma|Qwen|TranslateGemma/)),
      fitScoreVisible: Boolean((document.body.textContent ?? "").match(/fit score|sweet spot|balanced|situational/i)),
      selectorPreviewHeroVisible: Boolean(document.querySelector('[data-testid="selector-preview-hero"]')?.textContent?.match(/fit|decision|selected|installable|ollama|vllm/i)),
      decisionDeckVisible: Boolean(document.querySelector('[data-testid="selector-decision-deck"]')?.textContent?.match(/decision|text|files|vision|audio|game/i)),
      loadoutPathVisible: Boolean(document.querySelector('[data-testid="selector-loadout-path"]')?.textContent?.match(/loadout path|input|runtime|store|response/i)),
      deckSummaryVisible: Boolean(document.querySelector('[data-testid="deck-summary"]')?.textContent?.match(/top fit|fastest|lightest|ready/i)),
      spotlightVisible: Boolean(document.querySelector('[data-testid="model-spotlight"]')?.textContent?.match(/Spotlight picks|ranked by fit/i)),
      commandDeckVisible: Boolean(document.querySelector('[data-testid="selector-command-deck"]')?.textContent?.match(/Spotlight picks|Filter models|Coding/i)),
      selectorTitleBarVisible: Boolean(document.querySelector('[data-testid="selector-title-bar"]')?.textContent?.match(/LLM 선택|selected target|installed/i)),
      selectorSurfacePolished: Boolean(document.querySelector(".selector-preview-hero-surface")) && Boolean(document.querySelector(".model-card-premium")),
      previewActionReadable: (() => {
        const action = [...document.querySelectorAll('[data-testid="selector-preview-primary-action"]')].find((element) => element.getClientRects().length > 0);
        const rect = action?.getBoundingClientRect();
        const text = action?.textContent?.trim() ?? "";
        return Boolean(rect && rect.width >= 180 && /장착|재장착|준비/.test(text));
      })(),
      modelCardActionsReadable: (() => {
        const actions = [...document.querySelectorAll('[data-testid="model-card-actions"]')].find((element) => element.getClientRects().length > 0);
        const text = actions?.textContent ?? "";
        return /Load|Prepare|Reload/.test(text) && /Unload/.test(text) && /Install/.test(text) && /Bench/.test(text);
      })()
    }));

    const searchInput = page.locator('[data-testid="selector-search-input"]');
    await searchInput.fill("__no_model_match__");
    await page.waitForSelector('[data-testid="selector-empty-state"]', { timeout: 10_000 });
    const emptySearchState = await page.evaluate(() => ({
      emptyVisible: Boolean(document.querySelector('[data-testid="selector-empty-state"]')?.textContent?.match(/No match|__no_model_match__|hits/i)),
      previewEmptyVisible: window.innerWidth < 1024 || Boolean(document.querySelector('[data-testid="selector-preview-empty"]')?.textContent?.match(/No preview target|Clear filter|hits/i)),
      clearVisible: Boolean(document.querySelector('[data-testid="selector-empty-clear"]')?.getClientRects().length),
      cardCountZero: document.querySelectorAll("article[data-model-id]").length === 0,
      hitCountZero: Boolean(document.querySelector('[data-testid="selector-search-count"]')?.textContent?.match(/0 hit/i))
    }));
    await page.screenshot({ path: path.join(outDir, `${viewport.name}-selector-empty.png`), fullPage: true });
    await page.locator('[data-testid="selector-empty-clear"]').click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("article[data-model-id]").length > 0 &&
        document.querySelector('[data-testid="selector-search-input"]')?.value === "" &&
        document.activeElement === document.querySelector('[data-testid="selector-search-input"]'),
      undefined,
      { timeout: 10_000 }
    );
    const clearedSearchState = await page.evaluate(() => ({
      cleared: document.querySelector('[data-testid="selector-search-input"]')?.value === "",
      searchFocused: document.activeElement === document.querySelector('[data-testid="selector-search-input"]'),
      cardsRestored: document.querySelectorAll("article[data-model-id]").length > 0
    }));

    const spotlightButtons = page.locator('[data-testid="model-spotlight"] button');
    const spotlightCount = await spotlightButtons.count();
    let spotlightState = { checked: false, previewChanged: true };
    if (spotlightCount > 1) {
      const targetTitle = (await spotlightButtons.nth(1).locator('[data-testid="spotlight-title"]').textContent())?.trim() ?? "";
      await spotlightButtons.nth(1).click();
      await page.waitForFunction(
        (expectedTitle) => document.querySelector('[data-testid="selector-preview-title"]')?.textContent?.trim() === expectedTitle,
        targetTitle,
        { timeout: 10_000 }
      );
      spotlightState = { checked: true, previewChanged: true };
    }

    const secondCard = page.locator("article[data-model-id]").nth(1);
    const secondCardCount = await page.locator("article[data-model-id]").count();
    let selectionState = { checked: false, clickedTitle: "", previewTitle: "" };
    if (secondCardCount > 1) {
      const clickedTitle = (await secondCard.locator("h3").first().textContent())?.trim() ?? "";
      await secondCard.click();
      await page.waitForFunction(
        (expectedTitle) => document.querySelector('[data-testid="selector-preview-title"]')?.textContent?.trim() === expectedTitle,
        clickedTitle,
        { timeout: 10_000 }
      );
      const previewTitle = await page.evaluate(() => {
        const titles = [...document.querySelectorAll('[data-testid="selector-preview-title"]')];
        const visibleTitle = titles.find((title) => {
          const element = title;
          return Boolean(element.getClientRects().length);
        });
        return visibleTitle?.textContent?.trim() ?? "";
      });
      selectionState = { checked: true, clickedTitle, previewTitle };
    }

    await page.screenshot({ path: path.join(outDir, `${viewport.name}-selector.png`), fullPage: true });
    await page.close();

    results.push({ viewport, closedState, openState, selectionState, promptActionState, mobileConsoleState, spotlightState, selectorShortcutState, emptySearchState, clearedSearchState });
  }

  const failed = results.filter(
    ({ closedState, openState, selectionState, promptActionState, mobileConsoleState, spotlightState, selectorShortcutState, emptySearchState, clearedSearchState }) =>
      closedState.horizontalOverflow ||
      !closedState.composerVisible ||
      !closedState.chatVisible ||
      closedState.composerDisabled ||
      !closedState.composerShellVisible ||
      !closedState.sweetSpotVisible ||
      !closedState.sessionBusVisible ||
      !closedState.gameModeDockVisible ||
      !closedState.roleSkinApplied ||
      !closedState.promptActionDockVisible ||
      !closedState.agentRouteVisible ||
      !closedState.routeTraceVisible ||
      !closedState.capabilityRunwayVisible ||
      !closedState.roleToneApplied ||
      !closedState.headerFitVisible ||
      !closedState.headerLoadoutVisible ||
      !closedState.runtimeCoreSignalRailVisible ||
      !closedState.runtimeCommandConsoleVisible ||
      !closedState.premiumSurfacesVisible ||
      !closedState.mobileSignalRailVisible ||
      !closedState.mobileStageCapsuleVisible ||
      !closedState.mobileRoutePanelVisible ||
      !closedState.mobilePromptRailReadable ||
      !closedState.chatHeaderCompact ||
      !closedState.headerCapabilityPipsVisible ||
      openState.horizontalOverflow ||
      !openState.popoverVisible ||
      !openState.previewVisible ||
      !openState.modelCardsVisible ||
      !openState.fitScoreVisible ||
      !openState.selectorPreviewHeroVisible ||
      !openState.decisionDeckVisible ||
      !openState.loadoutPathVisible ||
      !openState.deckSummaryVisible ||
      !openState.spotlightVisible ||
      !openState.commandDeckVisible ||
      !openState.selectorTitleBarVisible ||
      !openState.selectorSurfacePolished ||
      !openState.previewActionReadable ||
      !openState.modelCardActionsReadable ||
      !selectorShortcutState.opened ||
      !selectorShortcutState.searchFocused ||
      !selectorShortcutState.shortcutAffordanceVisible ||
      !selectorShortcutState.shortcutA11yBound ||
      !selectorShortcutState.closedWithEscape ||
      !emptySearchState.emptyVisible ||
      !emptySearchState.previewEmptyVisible ||
      !emptySearchState.clearVisible ||
      !emptySearchState.cardCountZero ||
      !emptySearchState.hitCountZero ||
      !clearedSearchState.cleared ||
      !clearedSearchState.searchFocused ||
      !clearedSearchState.cardsRestored ||
      (promptActionState.checked && (!promptActionState.composerFilled || !promptActionState.focused || !promptActionState.composerArmed)) ||
      (mobileConsoleState.checked && (!mobileConsoleState.visible || !mobileConsoleState.hasRuntime || !mobileConsoleState.hasSession || !mobileConsoleState.hasGameMode || !mobileConsoleState.solidSurface)) ||
      (spotlightState.checked && !spotlightState.previewChanged) ||
      (selectionState.checked && selectionState.clickedTitle !== selectionState.previewTitle)
  );
  if (failed.length > 0) throw new Error(`Layout smoke failed: ${JSON.stringify(failed, null, 2)}`);
  console.log(JSON.stringify({ ok: true, outDir, results }, null, 2));
} finally {
  await browser.close();
}
