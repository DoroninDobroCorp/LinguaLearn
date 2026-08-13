import asyncio
import json

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(locale="en-US")
        page = await context.new_page()
        captured = []

        def on_websocket(websocket):
            if "gg-b-gql" not in websocket.url:
                return

            def on_sent(frame):
                try:
                    message = json.loads(frame)
                except (TypeError, json.JSONDecodeError):
                    return
                operation = (message.get("payload") or {}).get("operationName")
                if operation:
                    captured.append(message)
                    print(json.dumps(message, ensure_ascii=False))

            websocket.on("framesent", on_sent)

            def on_received(frame):
                try:
                    message = json.loads(frame)
                except (TypeError, json.JSONDecodeError):
                    return
                if str(message.get("id")) == "3":
                    print("RECEIVED=" + json.dumps(message, ensure_ascii=False)[:12000])

            websocket.on("framereceived", on_received)

        page.on("websocket", on_websocket)
        response = await page.goto("https://ggbet.ua/en/sports", timeout=60_000, wait_until="domcontentloaded")
        await page.wait_for_timeout(20_000)
        print(f"PAGE_STATUS={response.status if response else None}")
        print(f"PAGE_URL={page.url}")
        print(f"PAGE_TITLE={await page.title()}")
        body = (await page.locator('body').inner_text())[:5000]
        print("PAGE_BODY=" + body.replace("\n", " | "))
        links = await page.locator("a").evaluate_all(
            "els => els.map(e => e.href).filter(h => /sport|live|foot/i.test(h)).slice(0, 100)"
        )
        print("PAGE_LINKS=" + json.dumps(links))
        print(f"CAPTURED={len(captured)}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
