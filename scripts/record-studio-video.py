"""Content-Studio-Demo-Video aufnehmen (Playwright Screencast)."""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "schedule" / "videos"
STUDIO_URL = "http://127.0.0.1:8765/studio"
LOGIN_URL = "http://127.0.0.1:8765/login"
VIEWPORT = {"width": 1440, "height": 900}
DEFAULT_PASSWORD = "nb-umbra-zero-shade"


def pause(page, ms: int = 1200) -> None:
    page.wait_for_timeout(ms)


def smooth_scroll_to(page, y: int, steps: int = 24, step_ms: int = 40) -> None:
    page.evaluate(
        """async ({ y, steps, stepMs }) => {
          const start = window.scrollY;
          const delta = y - start;
          for (let i = 1; i <= steps; i++) {
            window.scrollTo(0, start + (delta * i) / steps);
            await new Promise(r => setTimeout(r, stepMs));
          }
        }""",
        {"y": y, "steps": steps, "stepMs": step_ms},
    )


def scroll_to_bottom(page) -> None:
    height = page.evaluate("document.documentElement.scrollHeight - window.innerHeight")
    smooth_scroll_to(page, max(0, int(height)), steps=30, step_ms=45)
    pause(page, 1200)


def login(page) -> None:
    password = os.environ.get("DASHBOARD_PASSWORD", DEFAULT_PASSWORD).strip() or DEFAULT_PASSWORD
    page.goto(LOGIN_URL, wait_until="networkidle", timeout=60_000)
    if page.locator("#username").count():
        page.select_option("#username", "umbra")
        page.fill("#password", password)
        page.locator('button[type="submit"]').click()
        page.wait_for_load_state("networkidle", timeout=30_000)
    page.goto(STUDIO_URL, wait_until="networkidle", timeout=60_000)
    page.wait_for_selector("#mainNav", timeout=30_000)


def open_tab(page, panel: str) -> None:
    page.locator(f'#mainNav button[data-panel="{panel}"]').click()
    pause(page, 1500)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_dir = OUT_DIR / "_studio-recording"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    print(f"Content-Studio-Video: {STUDIO_URL}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(tmp_dir),
            record_video_size=VIEWPORT,
            locale="de-DE",
        )
        page = context.new_page()
        login(page)
        page.wait_for_function("document.fonts.status === 'loaded'", timeout=30_000)
        pause(page, 2200)

        # Wortings — Variante wählen
        open_tab(page, "wordings")
        page.wait_for_selector("#variantList .list-item", timeout=30_000)
        variant = page.locator("#variantList .list-item").first
        if variant.count():
            variant.click()
            pause(page, 2200)

        # Custom HTML — Template laden + Live-Vorschau
        open_tab(page, "custom-html")
        page.wait_for_function(
            "() => document.querySelector('#importCreativeSelect')?.options?.length > 1",
            timeout=30_000,
        )
        creative_value = page.evaluate(
            "() => document.querySelector('#importCreativeSelect')?.options?.[1]?.value || ''"
        )
        if creative_value:
            page.select_option("#importCreativeSelect", creative_value)
        pause(page, 800)
        page.locator("#importCreativeBtn").click()
        page.wait_for_function(
            "() => document.querySelector('#customStatus')?.classList.contains('ok')",
            timeout=30_000,
        )
        pause(page, 2500)
        page.evaluate("window.scrollTo(0, 0)")
        pause(page, 1200)

        # Creatives — Vorschau + Light-Mode
        open_tab(page, "creatives")
        page.wait_for_function(
            "() => document.querySelector('#creativeSelect')?.options?.length > 0",
            timeout=30_000,
        )
        creative_value = page.evaluate(
            "() => document.querySelector('#creativeSelect')?.options?.[5]?.value"
            " || document.querySelector('#creativeSelect')?.options?.[0]?.value || ''"
        )
        if creative_value:
            page.select_option("#creativeSelect", creative_value)
        pause(page, 2500)
        page.locator('#globalScheme button[data-scheme="light"]').click()
        pause(page, 2200)
        page.locator('#globalScheme button[data-scheme="dark"]').click()
        pause(page, 1500)

        # Wochenplan — Posts mit Creative-Vorschau
        open_tab(page, "scheduler")
        page.wait_for_function(
            "() => document.querySelector('#weekSelect')?.options?.length > 0",
            timeout=30_000,
        )
        page.locator("#loadWeekBtn").click()
        page.wait_for_function(
            "() => document.querySelectorAll('#postsEditor .post-editor').length > 0",
            timeout=30_000,
        )
        pause(page, 2000)
        scroll_to_bottom(page)
        page.evaluate("window.scrollTo(0, 0)")
        pause(page, 1200)

        # Medien
        open_tab(page, "media")
        pause(page, 2200)

        # Abschluss — Header
        page.evaluate("window.scrollTo(0, 0)")
        pause(page, 1500)

        video_path = page.video.path() if page.video else None
        context.close()
        browser.close()

    if not video_path or not Path(video_path).exists():
        raise SystemExit("Video-Aufnahme fehlgeschlagen")

    out_webm = OUT_DIR / "content-studio-demo.webm"
    shutil.move(str(video_path), out_webm)

    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)

    mp4 = OUT_DIR / "content-studio-demo.mp4"
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(out_webm),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(mp4),
            ],
            check=True,
            capture_output=True,
        )
        print(f"MP4: {mp4.relative_to(ROOT)} ({mp4.stat().st_size // 1024} KB)")
    else:
        print("ffmpeg nicht gefunden — nur WebM exportiert")

    print(f"WebM: {out_webm.relative_to(ROOT)} ({out_webm.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
