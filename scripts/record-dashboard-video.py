"""Dashboard-Demo-Video aufnehmen (Playwright Screencast)."""

from __future__ import annotations

import shutil
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "schedule" / "videos"
DASHBOARD_URL = "http://127.0.0.1:8765"
VIEWPORT = {"width": 1440, "height": 900}


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
    smooth_scroll_to(page, max(0, int(height)), steps=36, step_ms=45)
    pause(page, 1500)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_dir = OUT_DIR / "_recording"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    print(f"Dashboard-Video: {DASHBOARD_URL}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(tmp_dir),
            record_video_size=VIEWPORT,
            locale="de-DE",
        )
        page = context.new_page()
        page.goto(DASHBOARD_URL, wait_until="networkidle", timeout=60_000)
        page.wait_for_function("document.fonts.status === 'loaded'", timeout=30_000)
        pause(page, 2000)

        # Scheduler
        page.locator('a[href="#scheduler"]').click()
        pause(page, 2500)

        # KPIs
        page.locator('a[href="#kpis"]').click()
        pause(page, 2200)

        # Performance + Sortierung
        page.locator('a[href="#performance"]').click()
        pause(page, 1500)
        impr_header = page.locator("#tweetTable th.sortable", has_text="Impr")
        if impr_header.count():
            impr_header.first.click()
            pause(page, 1200)
            impr_header.first.click()
            pause(page, 1200)

        # Lightbox — Creative-Preview
        thumb = page.locator("#tweetTable .thumb-btn").first
        if thumb.count():
            thumb.click()
            pause(page, 2000)
            page.keyboard.press("Escape")
            pause(page, 800)

        # Posts — Tab Woche
        page.locator('a[href="#posts"]').click()
        pause(page, 1200)
        week_tab = page.locator("#postTabs .tab", has_text="Woche")
        if week_tab.count():
            week_tab.first.click()
            pause(page, 1800)

        # Creatives
        page.locator('a[href="#creatives"]').click()
        pause(page, 1800)
        creative_thumb = page.locator("#creativeTable .thumb-btn").first
        if creative_thumb.count():
            creative_thumb.click()
            pause(page, 1800)
            page.keyboard.press("Escape")
            pause(page, 800)

        # Langsam bis ganz unten scrollen
        scroll_to_bottom(page)

        # Kurz Header wieder zeigen
        page.evaluate("window.scrollTo(0, 0)")
        pause(page, 1200)

        video_path = page.video.path() if page.video else None
        context.close()
        browser.close()

    if not video_path or not Path(video_path).exists():
        raise SystemExit("Video-Aufnahme fehlgeschlagen")

    out_webm = OUT_DIR / "dashboard-demo.webm"
    shutil.move(str(video_path), out_webm)

    # Aufräumen Playwright-Temp
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)

    mp4 = OUT_DIR / "dashboard-demo.mp4"
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        import subprocess

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
