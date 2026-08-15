"""Record the local, judge-facing LoomCredit demo without publishing it."""

from datetime import datetime, timezone
import os
from pathlib import Path
import shutil

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get("DEMO_BASE_URL", "http://localhost:3000").rstrip("/")
SCENE_SECONDS = float(os.environ.get("DEMO_SCENE_SECONDS", "5"))


def launch_options() -> dict[str, object]:
    options: dict[str, object] = {
        "headless": os.environ.get("DEMO_HEADFUL", "").lower() not in {"1", "true", "yes"},
        "args": ["--no-sandbox"],
    }
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
        options["executable_path"] = executable_path
    return options


def wait_for_scene(page: Page, seconds: float = SCENE_SECONDS) -> None:
    page.wait_for_timeout(int(seconds * 1000))


def normalize_url(base: str, path: str) -> str:
    return path if path.startswith("http://") or path.startswith("https://") else base + path


def record_demo(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_options())
        context = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            record_video_dir=str(output_dir),
            record_video_size={"width": 1440, "height": 1000},
        )
        page = context.new_page()

        page.goto(BASE_URL + "/", wait_until="networkidle")
        page.get_by_text("Recorded testnet artifact", exact=True).wait_for()
        wait_for_scene(page)

        proof_link = page.get_by_role("link", name="Inspect live proof").first
        proof_link.wait_for()
        proof_url = proof_link.get_attribute("href")
        assert proof_url, "The homepage did not expose a live proof link"
        page.goto(normalize_url(BASE_URL, proof_url), wait_until="networkidle")
        page.get_by_text("LIVE_VERIFIED", exact=True).wait_for()
        wait_for_scene(page)

        page.goto(BASE_URL + "/demo", wait_until="networkidle")
        page.get_by_text("LOCAL_FIXTURE", exact=True).wait_for()
        modes = page.locator("button.mode-button")
        assert modes.count() == 3, "The demo lab must expose all three policy scenarios"

        modes.nth(0).click()
        page.get_by_text("Policy approved").wait_for()
        wait_for_scene(page)

        modes.nth(1).click()
        page.get_by_text("Policy rejected").wait_for()
        page.get_by_text("80% / 40%").wait_for()
        wait_for_scene(page)

        modes.nth(2).click()
        page.get_by_text("Policy rejected").wait_for()
        page.locator(".check-row.fail").wait_for()
        wait_for_scene(page)

        context.close()
        browser.close()

    recordings = sorted(output_dir.glob("*.webm"), key=lambda path: path.stat().st_mtime)
    assert recordings, f"Playwright did not create a recording in {output_dir}"
    return recordings[-1]


def main() -> None:
    configured_output = os.environ.get("DEMO_RECORDING_DIR")
    if configured_output:
        output_dir = Path(configured_output).expanduser()
    else:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        output_dir = Path("/tmp") / f"loomcredit-demo-recording-{stamp}"

    recording = record_demo(output_dir)
    print(f"local demo recording: {recording}")
    print("review the file before any manual publication; this script does not upload it")


if __name__ == "__main__":
    main()
