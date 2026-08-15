import os
import shutil
from playwright.sync_api import Page, sync_playwright


BASE_URL = "http://localhost:3000"
ROUTES = [
    "/",
    "/demo",
    "/security",
    "/docs",
    "/access",
    "/whitepaper",
    "/legal",
    "/privacy",
    "/terms",
    "/cookies",
    "/docs/legal-readiness",
    "/orders/0x2424242424242424242424242424242424242424242424242424242424242424",
    "/proof/0xe1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
]


def assert_no_horizontal_overflow(page: Page) -> None:
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), page.url


def assert_accessible_images(page: Page) -> None:
    for image in page.locator("img").all():
        # Empty alt is valid for a decorative mark whose surrounding link has
        # its own accessible name. The failure we want to catch is a missing
        # alt attribute, not an intentionally silent decorative image.
        assert image.get_attribute("alt") is not None, (
            f"Missing image alt attribute on {page.url}"
        )


def assert_brand_assets(page: Page) -> None:
    brand_mark = page.locator(".site-header .brand-mark-image")
    assert brand_mark.get_attribute("src") == "/assets/loomcredit-logo.png"
    assert brand_mark.evaluate("(node) => node.complete && node.naturalWidth > 0")
    assert page.locator("meta[property='og:image']").get_attribute("content").endswith(
        "/assets/loomcredit-og.png"
    )
    assert page.locator("meta[name='twitter:image']").get_attribute("content").endswith(
        "/assets/loomcredit-og.png"
    )
    assert any(
        "loomcredit-logo.png" in value
        for value in page.locator("script[type='application/ld+json']").all_text_contents()
    )
    manifest = page.request.get(BASE_URL + "/manifest.webmanifest")
    assert manifest.ok and "/assets/loomcredit-logo.png" in manifest.text()

    for asset_path in [
        "/assets/loomcredit-mark.svg",
        "/assets/loomcredit-wordmark.svg",
        "/assets/favicon.svg",
        "/assets/loomcredit-logo.png",
        "/icon.svg",
        "/assets/loomcredit-og.svg",
        "/assets/loomcredit-og.png",
        "/assets/loomcredit-x-banner.svg",
        "/assets/loomcredit-x-banner.png",
        "/assets/architecture-diagram.png",
        "/assets/riskguard-demo.png",
    ]:
        response = page.request.get(BASE_URL + asset_path)
        assert response.ok, f"{asset_path} returned {response.status}"


def main() -> None:
    with sync_playwright() as playwright:
        launch_options = {"headless": True, "args": ["--no-sandbox"]}
        executable_path = os.environ.get("PLAYWRIGHT_EXECUTABLE_PATH")
        if not executable_path:
            for candidate in (
                "/usr/bin/google-chrome",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
            ):
                if shutil.which(candidate):
                    executable_path = candidate
                    break
        if executable_path:
            launch_options["executable_path"] = executable_path
        browser = playwright.chromium.launch(**launch_options)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        console_errors: list[str] = []
        page_errors: list[str] = []
        expected_live_evidence_unavailable = 0

        def record_response(response) -> None:
            nonlocal expected_live_evidence_unavailable
            if response.url.endswith("/api/live-evidence") and response.status in {
                502,
                503,
            }:
                expected_live_evidence_unavailable += 1

        def record_console(message) -> None:
            nonlocal expected_live_evidence_unavailable
            if message.type != "error":
                return
            if (
                expected_live_evidence_unavailable > 0
                and message.text.startswith("Failed to load resource:")
                and "status of 50" in message.text
            ):
                expected_live_evidence_unavailable -= 1
                return
            console_errors.append(message.text)

        page.on("response", record_response)
        page.on("console", record_console)
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        for route in ROUTES:
            response = page.goto(BASE_URL + route, wait_until="networkidle")
            assert response and response.ok, f"{route} returned {response.status if response else 'no response'}"
            assert page.locator("h1").count() == 1, f"Expected one h1 on {route}"
            assert page.locator(".wallet-connect-button").count() >= 1, f"Missing wallet entry point on {route}"
            assert_accessible_images(page)
            assert_no_horizontal_overflow(page)

        page.goto(BASE_URL + "/access", wait_until="networkidle")
        page.get_by_text("A wallet is not a session.").wait_for()
        page.get_by_text("Connect, then sign in", exact=True).wait_for()
        page.get_by_text("Sign-in uses one human-readable signature", exact=False).wait_for()
        assert page.get_by_text("Current local path", exact=True).count() == 0
        card_wallet = page.locator(".wallet-access-card .wallet-connect-button")
        card_wallet.wait_for()
        assert card_wallet.is_enabled()
        card_wallet.click()
        page.get_by_text("No wallet detected", exact=True).wait_for()
        page.get_by_role("button", name="Try wallet detection again").wait_for()

        page.goto(BASE_URL + "/whitepaper", wait_until="networkidle")
        page.get_by_text("Attested trade evidence and policy-constrained AI for supplier finance.").wait_for()
        page.get_by_text("Claims carry a status, not a costume.").wait_for()
        page.locator("#abstract").wait_for()
        page.get_by_text("Current product truth:", exact=False).wait_for()

        page.goto(BASE_URL + "/docs/quickstart", wait_until="networkidle")
        page.get_by_text("Run LoomCredit locally", exact=True).wait_for()
        page.get_by_placeholder("Search docs").wait_for()
        assert page.locator(".docs-code").count() >= 2
        assert page.locator(".docs-toc a").count() >= 3
        docs_search = page.get_by_role("searchbox", name="Search documentation")
        docs_search.fill("worker")
        assert page.locator(".docs-nav-group a").count() >= 1
        docs_search.fill("")

        page.goto(BASE_URL + "/", wait_until="networkidle")
        assert "Attested trade evidence for bounded underwriting" in page.title()
        assert page.locator("link[rel='canonical']").get_attribute("href") == "http://localhost:3000"
        assert page.get_by_role("link", name="Legal center").count() >= 1
        assert page.locator("details.faq-row").count() == 4
        assert page.locator("meta[name='llms-txt']").get_attribute("content") == "/llms.txt"
        json_ld = page.locator("script[type='application/ld+json']").all_text_contents()
        assert any('"@type":"FAQPage"' in schema for schema in json_ld)
        assert_brand_assets(page)
        root_response = context.request.get(BASE_URL + "/")
        assert root_response.ok
        assert root_response.headers.get("x-content-type-options") == "nosniff"
        assert root_response.headers.get("x-frame-options") == "DENY"
        assert (
            root_response.headers.get("referrer-policy")
            == "strict-origin-when-cross-origin"
        )
        assert root_response.headers.get("permissions-policy") == (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        page.set_viewport_size({"width": 390, "height": 844})
        page.reload(wait_until="networkidle")
        page.locator(".mobile-nav summary").click()
        page.locator(".mobile-nav-panel").get_by_text("Wallet access", exact=True).wait_for()
        assert_no_horizontal_overflow(page)

        page.goto(BASE_URL + "/demo", wait_until="networkidle")
        mode_buttons = page.locator("button.mode-button")
        assert mode_buttons.count() == 3
        mode_buttons.nth(1).click()
        page.get_by_text("Policy rejected").wait_for()
        assert page.get_by_text("80% / 40%").count() == 1
        assert page.get_by_text("Decision trace", exact=True).count() == 1
        assert page.get_by_text("NOT_REQUESTED", exact=True).count() == 1
        mode_buttons.nth(2).click()
        page.get_by_text("Policy rejected").wait_for()
        assert page.locator(".check-row.fail").count() == 1
        mode_buttons.nth(0).click()
        page.get_by_text("Policy approved").wait_for()

        page.goto(BASE_URL + ROUTES[-1], wait_until="networkidle")
        page.get_by_text("Local policy sequence", exact=True).wait_for()
        assert page.locator(".proof-stage-status.fixture").count() == 4
        page.goto(BASE_URL + "/demo", wait_until="networkidle")

        page.set_viewport_size({"width": 390, "height": 844})
        page.reload(wait_until="networkidle")
        assert_no_horizontal_overflow(page)
        page.screenshot(path="/tmp/loomcredit-demo-mobile.png", full_page=True)

        page.set_viewport_size({"width": 320, "height": 844})
        page.reload(wait_until="networkidle")
        assert_no_horizontal_overflow(page)
        wallet_box = page.locator(".site-header .wallet-connect-button").bounding_box()
        assert wallet_box and wallet_box["x"] + wallet_box["width"] <= 320

        health = context.request.get(BASE_URL + "/api/health")
        assert health.ok
        health_body = health.json()
        assert health_body["status"] == "ok"
        live_evidence_configured = health_body["liveEvidenceConfigured"]
        assert isinstance(live_evidence_configured, bool)
        assert health_body["liveIntegrationConfigured"] is live_evidence_configured
        assert health_body["liveEvidenceApi"] == (
            "configured" if live_evidence_configured else "not-configured"
        )
        assert health_body["latestVerifiedOrder"] is None or isinstance(
            health_body["latestVerifiedOrder"], str
        )
        assert health_body["workerSecrets"] == "not-applicable"

        readiness = context.request.get(BASE_URL + "/api/ready")
        readiness_body = readiness.json()
        assert readiness_body["dependency"] == "live-evidence"
        if live_evidence_configured and health_body["liveEvidenceUpstream"] == "reachable":
            assert readiness.status == 200
            assert readiness_body["status"] == "ready"
            assert readiness_body["upstream"] == "reachable"
        else:
            assert readiness.status == 503
            assert readiness_body["status"] == "not-ready"
            assert readiness_body["code"] in {
                "LIVE_EVIDENCE_NOT_CONFIGURED",
                "LIVE_EVIDENCE_UNAVAILABLE",
            }

        robots = context.request.get(BASE_URL + "/robots.txt")
        assert robots.ok
        assert "Disallow: /" in robots.text()
        sitemap = context.request.get(BASE_URL + "/sitemap.xml")
        assert sitemap.ok
        assert "<url>" not in sitemap.text()
        llms = context.request.get(BASE_URL + "/llms.txt")
        assert llms.ok
        assert "LIVE_VERIFIED" in llms.text()
        assert "/docs/integrations/api" in llms.text()
        openapi = context.request.get(BASE_URL + "/openapi.json")
        assert openapi.ok
        openapi_body = openapi.json()
        assert openapi_body["openapi"] == "3.1.0"
        assert "/api/live-evidence" in openapi_body["paths"]
        assert "/api/auth/verify" in openapi_body["paths"]
        assert "/api/demo/evaluate" in openapi_body["paths"]
        assert "LOCAL_FIXTURE_ONLY" in str(openapi_body)

        unsafe = context.request.post(BASE_URL + "/api/demo/evaluate", data={"mode": "unsafe"})
        assert unsafe.ok
        assert unsafe.json()["policy"]["decision"] == "REJECTED"
        cancelled = context.request.post(BASE_URL + "/api/demo/evaluate", data={"mode": "cancelled"})
        assert cancelled.ok
        assert cancelled.json()["policy"]["failureCode"] == "INVALID_STATE"
        invalid = context.request.post(BASE_URL + "/api/demo/evaluate", data={"mode": "live"})
        assert invalid.status == 400
        oversized = context.request.post(
            BASE_URL + "/api/demo/evaluate",
            data={"mode": "safe", "padding": "x" * 5_000},
        )
        assert oversized.status == 413

        browser.close()

    assert not console_errors, f"Browser console errors: {console_errors}"
    assert not page_errors, f"Browser page errors: {page_errors}"
    print("browser smoke: routes, responsive layout, demo interaction, APIs, and console checks passed")


if __name__ == "__main__":
    main()
