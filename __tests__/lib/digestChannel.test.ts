import { describe, it, expect } from "vitest";
import {
  digestDeliveryFor,
  isDigestChannel,
  telegramIsUsable,
} from "@/lib/digestChannel";

const reader = (over: Record<string, unknown> = {}) => ({
  email: "salma@example.com",
  telegram_chat_id: "12345",
  telegram_notifications_enabled: true,
  ...over,
});

describe("digestDeliveryFor", () => {
  it("sends to exactly one channel, never both", () => {
    // The bug this exists to prevent: a reader with Telegram AND an email
    // address received the same digest twice.
    expect(digestDeliveryFor(reader({ digest_channel: "email" }))).toEqual({
      via: "email",
      fallback: false,
    });
    expect(digestDeliveryFor(reader({ digest_channel: "telegram" }))).toEqual({
      via: "telegram",
    });
  });

  it("defaults to email when nothing has been chosen", () => {
    // Rows written before the column existed, and anyone who never opened the
    // setting. Every account has an address; almost none has Telegram.
    expect(digestDeliveryFor(reader({ digest_channel: null }))).toEqual({
      via: "email",
      fallback: false,
    });
    expect(digestDeliveryFor(reader({ digest_channel: undefined })).via).toBe("email");
    expect(digestDeliveryFor(reader({ digest_channel: "carrier-pigeon" })).via).toBe("email");
  });

  it("falls back to email when Telegram was chosen but never connected", () => {
    const d = digestDeliveryFor(
      reader({ digest_channel: "telegram", telegram_chat_id: null })
    );
    // Reported, not silent: the settings screen says this is happening.
    expect(d).toEqual({ via: "email", fallback: true });
  });

  it("respects /stop, which is a real refusal rather than a missing setup", () => {
    // Someone who stopped the bot has said they want nothing on Telegram, so
    // the digest must not go there however the preference reads.
    const d = digestDeliveryFor(
      reader({ digest_channel: "telegram", telegram_notifications_enabled: false })
    );
    expect(d).toEqual({ via: "email", fallback: true });
  });

  it("reports having nowhere to send rather than pretending it sent", () => {
    expect(
      digestDeliveryFor({ digest_channel: "email", email: null })
    ).toEqual({ via: "none", reason: "no-email" });

    expect(
      digestDeliveryFor({ digest_channel: "telegram", email: null, telegram_chat_id: null })
    ).toEqual({ via: "none", reason: "no-telegram-and-no-email" });
  });

  it("never returns telegram for anyone who cannot receive it", () => {
    // Belt and braces over the whole input space that matters.
    for (const chat of [null, "", "12345"]) {
      for (const enabled of [true, false, null]) {
        const d = digestDeliveryFor(
          reader({
            digest_channel: "telegram",
            telegram_chat_id: chat,
            telegram_notifications_enabled: enabled,
          })
        );
        if (d.via === "telegram") {
          expect(Boolean(chat) && enabled === true).toBe(true);
        }
      }
    }
  });
});

describe("isDigestChannel", () => {
  it("accepts only the two the database constraint allows", () => {
    expect(isDigestChannel("email")).toBe(true);
    expect(isDigestChannel("telegram")).toBe(true);
    for (const bad of ["Email", "sms", "", null, undefined, 1, {}]) {
      expect(isDigestChannel(bad), String(bad)).toBe(false);
    }
  });
});

describe("telegramIsUsable", () => {
  it("needs the chat id and the switch together", () => {
    expect(telegramIsUsable(reader())).toBe(true);
    expect(telegramIsUsable(reader({ telegram_chat_id: null }))).toBe(false);
    expect(telegramIsUsable(reader({ telegram_notifications_enabled: false }))).toBe(false);
    expect(telegramIsUsable({})).toBe(false);
  });
});
