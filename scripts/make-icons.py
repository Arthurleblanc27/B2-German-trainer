"""B2-Trainer — erzeugt einfache PNG-Icons (192/512) und das OG-Bild ohne externe Bibliotheken."""
import struct
import zlib
from pathlib import Path

ACCENT = (31, 111, 235)
DARK = (11, 18, 32)
WEISS = (255, 255, 255)


def png_schreiben(pfad: Path, breite: int, hoehe: int, pixel_fn):
    zeilen = bytearray()
    for y in range(hoehe):
        zeilen.append(0)  # Filtertyp 0
        for x in range(breite):
            r, g, b = pixel_fn(x, y)
            zeilen += bytes((r, g, b))

    def chunk(typ: bytes, daten: bytes) -> bytes:
        return (
            struct.pack('>I', len(daten))
            + typ
            + daten
            + struct.pack('>I', zlib.crc32(typ + daten) & 0xFFFFFFFF)
        )

    header = struct.pack('>IIBBBBB', breite, hoehe, 8, 2, 0, 0, 0)
    daten = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(bytes(zeilen), 9)) + chunk(b'IEND', b'')
    pfad.parent.mkdir(parents=True, exist_ok=True)
    pfad.write_bytes(daten)
    print(f'  {pfad} — {pfad.stat().st_size} Bytes')


def icon_pixel(breite: int):
    mitte = breite / 2
    rand = breite * 0.46
    ring = breite * 0.30

    def f(x, y):
        d = ((x - mitte) ** 2 + (y - mitte) ** 2) ** 0.5
        if d > rand:
            return DARK
        if d > rand - breite * 0.06:
            return ACCENT
        if d < ring * 0.42:
            return WEISS
        # „B2“-Andeutung: zwei senkrechte Balken mit Lücken
        balken1 = mitte - breite * 0.17 <= x <= mitte - breite * 0.11
        balken2 = mitte + breite * 0.11 <= x <= mitte + breite * 0.17
        im_kreis = d < ring
        if im_kreis and (balken1 or balken2):
            return WEISS
        if im_kreis:
            return ACCENT
        return DARK

    return f


def og_pixel(breite: int, hoehe: int):
    def f(x, y):
        if y < hoehe * 0.06 or y > hoehe * 0.94:
            return ACCENT
        # große B2-Silhouette rechts
        cx, cy = breite * 0.82, hoehe * 0.5
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        if d < hoehe * 0.26:
            return ACCENT
        if d < hoehe * 0.21:
            return DARK
        return DARK

    return f


if __name__ == '__main__':
    basis = Path(__file__).resolve().parents[1] / 'public'
    print('B2-Trainer: Icons erzeugen')
    png_schreiben(basis / 'icons' / 'icon-192.png', 192, 192, icon_pixel(192))
    png_schreiben(basis / 'icons' / 'icon-512.png', 512, 512, icon_pixel(512))
    png_schreiben(basis / 'og-image.png', 1200, 630, og_pixel(1200, 630))
