from __future__ import annotations

import base64
from io import BytesIO

import pytest
from PIL import Image
from pypdf import PdfReader, PdfWriter

from backend.core import sellador
from backend.core.sellador import apply_sellador, distribute_stamp_pages, group_stamp_pages
from backend.handlers.sellador import (
    sellador_apply,
    sellador_inspect_pdf,
    sellador_preview_pages,
    sellador_render_page,
)


def _blank_pdf(page_count: int = 3) -> bytes:
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=612, height=792)
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _stamp_png() -> bytes:
    image = Image.new("RGBA", (40, 40), (255, 0, 0, 180))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_distribute_stamp_pages_is_deterministic_with_seed() -> None:
    first, seed = distribute_stamp_pages(10, 5, 12345)
    second, _ = distribute_stamp_pages(10, 5, 12345)
    assert seed == 12345
    assert first == second
    assert len(first) == 5
    assert all(0 <= page < 10 for page in first)
    assert len(set(first)) == len(first)


def test_distribute_stamp_pages_caps_to_one_per_page() -> None:
    pages, _ = distribute_stamp_pages(3, 10, 99)
    assert len(pages) == 3
    assert len(set(pages)) == 3


def test_apply_sellador_stamps_only_selected_pages() -> None:
    pdf_bytes = _blank_pdf(4)
    stamp_bytes = _stamp_png()
    result_bytes, page_indices, seed = apply_sellador(
        pdf_bytes,
        stamp_bytes,
        stamp_count=3,
        x=100,
        y=120,
        width=40,
        height=40,
        seed=999,
    )
    assert seed == 999
    assert len(page_indices) == 3
    grouped = group_stamp_pages(page_indices)
    assert sum(grouped.values()) == 3

    reader = PdfReader(BytesIO(result_bytes))
    assert len(reader.pages) == 4


def test_sellador_apply_returns_base64_when_no_output_path() -> None:
    payload = {
        "pdf_b64": base64.b64encode(_blank_pdf(2)).decode("ascii"),
        "stamp_b64": base64.b64encode(_stamp_png()).decode("ascii"),
        "stamp_count": 2,
        "x": 50,
        "y": 50,
        "width": 40,
        "height": 40,
        "seed": 42,
        "filename": "sellado.pdf",
    }
    result = sellador_apply(payload)
    assert result["filename"] == "sellado.pdf"
    assert result["seed"] == 42
    assert result["stamp_count"] == 2
    assert len(result["page_assignments"]) == 2
    assert "pdf_base64" in result
    assert "saved_path" not in result


def test_sellador_apply_can_write_to_disk(tmp_path) -> None:
    output_path = tmp_path / "sellado.pdf"
    payload = {
        "pdf_b64": base64.b64encode(_blank_pdf(1)).decode("ascii"),
        "stamp_b64": base64.b64encode(_stamp_png()).decode("ascii"),
        "stamp_count": 1,
        "x": 10,
        "y": 10,
        "width": 30,
        "height": 30,
        "seed": 7,
        "output_path": str(output_path),
    }
    result = sellador_apply(payload)
    assert result["saved_path"] == str(output_path.resolve())
    assert output_path.exists()
    assert output_path.stat().st_size > 0


def test_sellador_preview_pages_matches_distribution() -> None:
    preview = sellador_preview_pages({"page_count": 6, "stamp_count": 4, "seed": 555})
    core_pages, _ = distribute_stamp_pages(6, 4, 555)
    assert preview["page_assignments"] == [page + 1 for page in core_pages]
    assert preview["seed"] == 555


def test_sellador_inspect_pdf_reads_from_path(tmp_path) -> None:
    pdf_path = tmp_path / "doc.pdf"
    pdf_path.write_bytes(_blank_pdf(3))
    info = sellador_inspect_pdf({"pdf_path": str(pdf_path)})
    assert info["page_count"] == 3
    assert info["page_width"] > 0
    assert info["page_height"] > 0


def test_sellador_render_page_returns_image(tmp_path) -> None:
    pdf_path = tmp_path / "doc.pdf"
    pdf_path.write_bytes(_blank_pdf(2))
    try:
        rendered = sellador_render_page({"pdf_path": str(pdf_path), "page_num": 1, "max_width": 400})
    except ValueError as exc:
        if "PyMuPDF" in str(exc):
            pytest.skip("pymupdf not installed")
        raise
    assert rendered["image_base64"]
    assert rendered["mime_type"] == "image/png"
    assert rendered["rendered_width"] >= 400


def test_apply_sellador_rejects_duplicate_page_placements() -> None:
    pdf_bytes = _blank_pdf(2)
    stamp_bytes = _stamp_png()
    placements = [
        {"page_index": 0, "x": 40, "y": 40, "width": 40, "height": 40},
        {"page_index": 0, "x": 200, "y": 500, "width": 40, "height": 40},
    ]
    with pytest.raises(ValueError, match="un sello por página"):
        apply_sellador(
            pdf_bytes,
            stamp_bytes,
            stamp_count=2,
            x=0,
            y=0,
            width=40,
            height=40,
            seed=11,
            stamp_placements=placements,
        )


def test_apply_sellador_respects_per_stamp_positions() -> None:
    pdf_bytes = _blank_pdf(2)
    stamp_bytes = _stamp_png()
    placements = [
        {"page_index": 0, "x": 40, "y": 40, "width": 40, "height": 40},
        {"page_index": 1, "x": 200, "y": 500, "width": 40, "height": 40},
    ]
    result_bytes, page_indices, seed = apply_sellador(
        pdf_bytes,
        stamp_bytes,
        stamp_count=2,
        x=0,
        y=0,
        width=40,
        height=40,
        seed=11,
        stamp_placements=placements,
    )
    assert page_indices == [0, 1]
    assert seed == 11
    assert len(PdfReader(BytesIO(result_bytes)).pages) == 2


def test_sellador_apply_from_paths(tmp_path) -> None:
    pdf_path = tmp_path / "source.pdf"
    stamp_path = tmp_path / "stamp.png"
    output_path = tmp_path / "sellado.pdf"
    pdf_path.write_bytes(_blank_pdf(2))
    stamp_path.write_bytes(_stamp_png())
    result = sellador_apply({
        "pdf_path": str(pdf_path),
        "stamp_path": str(stamp_path),
        "stamp_count": 1,
        "x": 10,
        "y": 10,
        "width": 30,
        "height": 30,
        "seed": 3,
        "output_path": str(output_path),
    })
    assert result["saved_path"] == str(output_path.resolve())
    assert output_path.exists()


def test_apply_sellador_placements_prepare_stamp_once_per_geometry(monkeypatch) -> None:
    """perf-09: placements sharing the same (width, height) must reuse one
    prepared stamp (one resize + one PDF encode) instead of re-encoding it per
    placement. The old code re-prepared the stamp inside the placement loop."""
    pdf_bytes = _blank_pdf(5)
    stamp_bytes = _stamp_png()
    placements = [
        {"page_index": i, "x": 50, "y": 100, "width": 40, "height": 40}
        for i in range(5)
    ]
    calls: list[int] = []
    orig = sellador._prepare_stamp_image

    def counting(*a, **kw):
        calls.append(1)
        return orig(*a, **kw)

    monkeypatch.setattr("backend.core.sellador._prepare_stamp_image", counting)
    result_bytes, page_indices, _ = apply_sellador(
        pdf_bytes,
        stamp_bytes,
        stamp_count=5,
        x=0,
        y=0,
        width=40,
        height=40,
        seed=11,
        stamp_placements=placements,
    )
    assert len(calls) == 1, f"5 same-geometry placements should prepare stamp once, got {len(calls)}"
    assert page_indices == [0, 1, 2, 3, 4]
    assert len(PdfReader(BytesIO(result_bytes)).pages) == 5


def test_apply_sellador_placements_dedup_only_equal_geometries(monkeypatch) -> None:
    """perf-09: the stamp cache is keyed by (width, height) — distinct sizes
    still get their own preparation, equal sizes are deduped. 5 placements with
    3 distinct geometries -> 3 preparations."""
    pdf_bytes = _blank_pdf(5)
    stamp_bytes = _stamp_png()
    placements = [
        {"page_index": 0, "x": 50, "y": 100, "width": 40, "height": 40},
        {"page_index": 1, "x": 50, "y": 100, "width": 60, "height": 60},
        {"page_index": 2, "x": 50, "y": 100, "width": 40, "height": 40},
        {"page_index": 3, "x": 50, "y": 100, "width": 80, "height": 80},
        {"page_index": 4, "x": 50, "y": 100, "width": 60, "height": 60},
    ]
    calls: list[int] = []
    orig = sellador._prepare_stamp_image

    def counting(*a, **kw):
        calls.append(1)
        return orig(*a, **kw)

    monkeypatch.setattr("backend.core.sellador._prepare_stamp_image", counting)
    apply_sellador(
        pdf_bytes,
        stamp_bytes,
        stamp_count=5,
        x=0,
        y=0,
        width=40,
        height=40,
        seed=11,
        stamp_placements=placements,
    )
    assert len(calls) == 3, f"3 distinct geometries -> 3 preparations, got {len(calls)}"
