import { describe, expect, it, vi } from "vitest";
import { ReverseMessageIde } from "./reverseMessageIde";

describe("ReverseMessageIde", () => {
  it("should pass preserveFocus option to ide.openFile", async () => {
    const mockOpenFile = vi.fn();
    const mockIde = {
      openFile: mockOpenFile,
    } as any;

    const handlers: Record<string, Function> = {};
    const mockOn = (messageType: string, handler: Function) => {
      handlers[messageType] = handler;
    };

    new ReverseMessageIde(mockOn, mockIde);

    const openFileHandler = handlers["openFile"];
    expect(openFileHandler).toBeDefined();

    const testData = {
      path: "/test/path/file.ts",
      preserveFocus: true,
    };

    await openFileHandler({
      data: testData,
    });

    expect(mockOpenFile).toHaveBeenCalledWith(
      testData.path,
      expect.objectContaining({
        preserveFocus: true,
      }),
    );
  });
});
