import { expect } from "chai";
import {
  VSBrowser,
  WebDriver,
  WebView,
  Workbench,
} from "vscode-extension-tester";

import { GlobalActions } from "../actions/Global.actions";
import { GUIActions } from "../actions/GUI.actions";
import { DEFAULT_TIMEOUT } from "../constants";
import { GUISelectors } from "../selectors/GUI.selectors";
import { TestUtils } from "../TestUtils";

describe("Compaction Test", () => {
  let view: WebView;
  let driver: WebDriver;

  before(async function () {
    this.timeout(DEFAULT_TIMEOUT.XL + DEFAULT_TIMEOUT.MD + DEFAULT_TIMEOUT.MD);
    await GUIActions.moveContinueToSidebar(VSBrowser.instance.driver);
    await GlobalActions.openTestWorkspace();
    await GlobalActions.clearAllNotifications();
    await GlobalActions.disableNextEdit();
  });

  beforeEach(async function () {
    this.timeout(DEFAULT_TIMEOUT.XL);
    await GUIActions.toggleGui();
    ({ view, driver } = await GUIActions.switchToReactIframe());
    await GUIActions.selectModelFromDropdown(view, "TEST LLM");
  });

  afterEach(async function () {
    this.timeout(DEFAULT_TIMEOUT.XL);
    await view.switchBack();
    await TestUtils.waitForSuccess(
      async () => (await GUISelectors.getContinueExtensionBadge(view)).click(),
      DEFAULT_TIMEOUT.XS,
    );
  });

  it("should show compaction toast with message count", async () => {
    // 1. Send a few messages to populate history
    const { userMessage, llmResponse } = TestUtils.generateTestMessagePair(0);
    await GUIActions.sendMessage({
      view,
      message: userMessage,
      inputFieldIndex: 0,
    });
    const msg = await TestUtils.waitForSuccess(() =>
      GUISelectors.getThreadMessageByText(view, llmResponse),
    );

    // Hover to ensure actions are visible
    await msg.getDriver().actions().move({ origin: msg }).perform();

    // 2. Trigger compaction
    // Find the "Compact conversation" button for the message
    // Note: We need a selector for the compact button. ResponseActions renders it.
    // The button has a testId: `compact-button-${index}`
    const compactButton = await TestUtils.waitForSuccess(() =>
      GUISelectors.findByTestId(view, "compact-button-1"),
    );
    // Wait for it to be visible/clickable (it might be hidden on hover? code says "text-description-muted ... hover:brightness-105", doesn't look purely hover-hidden in the div class, but local testing is best. The code `opacity-0` is on InputToolbar, ResponseActions seems always visible or transparent?)
    // Actually ResponseActions has `className="... flex ..."`

    // We might need to hover over the message to see actions if they are hidden?
    // Looking at `ResponseActions.tsx`: `className="text-description-muted mx-2 flex cursor-default items-center justify-end space-x-1 bg-transparent pb-0 text-xs"`
    // It doesn't seem to hold `opacity-0` class logic itself.

    await compactButton.click();

    // 3. Verify Toast
    // Toasts in VSCode are notifications. We need to check VS Code notifications.
    // VSBrowser driver can access notifications.
    // But we are inside the WebView context currently. We might need to switch back.
    await view.switchBack();

    // Wait for notification
    const notification = await driver.wait(async () => {
      const notifications = await new Workbench().getNotifications();
      for (const n of notifications) {
        const text = await n.getMessage();
        if (text.includes("Compacting") && text.includes("messages")) {
          return n;
        }
      }
      return undefined;
    }, DEFAULT_TIMEOUT.MD);

    expect(await notification?.getMessage()).to.match(
      /Compacting \d+ messages/,
    );

    // Dismiss it
    await notification?.dismiss();

    // Switch back to iframe for teardown if needed (afterEach does it though)
  }).timeout(DEFAULT_TIMEOUT.XL);
});
