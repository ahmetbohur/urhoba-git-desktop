#!/usr/bin/env python3
"""Kaynak logodan platform ikon dosyalarını türetir.

    python3 assets/make-icon.py

Kaynak `icon-512.png`. Windows `.ico`, macOS `.icns` ve Linux `.png` bekliyor;
üçü de buradan üretiliyor, elle tutulan tek dosya kaynak logo.

Kaynağın arka planı opak beyaz. Masaüstü ikonunda bu beyaz bir kare olarak
görünüyor — özellikle macOS dock'unda ve koyu görev çubuklarında. Bu yüzden dış
beyaz saydama çevriliyor: kenarlardan taşma yöntemiyle, yani yalnızca dışarıya
bağlı olan beyaz. Yön tuşu ve düğmeler gövdenin içinde kaldığı için onlara
dokunulmuyor.
"""
import io
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).parent
SOURCE = ASSETS / 'icon-512.png'

# Kenar yumuşatma nedeniyle dış sınır saf beyaz değil; tolerans o rampayı da
# alıyor. Gövde renkleri koyu olduğu için bu eşik onlara yaklaşmıyor.
WHITE_TOLERANCE = 40

ICO_SIZES = [256, 128, 64, 48, 32, 24, 16]
# Linux paketlerinde hicolor teması her boyut için ayrı dosya bekliyor; tek bir
# büyük ikonu masaüstüne ölçeklettirmek küçük boyutlarda bulanık görünüyor.
# 512 listede yok: o boyut `icon.png` olarak zaten üretiliyor ve `icon-512.png`
# kaynak logonun kendisi — aynı adla yazmak kaynağı yok ederdi.
HICOLOR_SIZES = [16, 24, 32, 48, 64, 128, 256]
# 1024'lük katman yok: kaynak 512 ve büyütmek yumuşak bir görüntü üretirdi.
ICNS_LAYERS = [
    ('icp4', 16), ('icp5', 32), ('icp6', 64),
    ('ic07', 128), ('ic08', 256), ('ic09', 512),
    ('ic11', 32), ('ic12', 64), ('ic13', 256), ('ic14', 512),
]


def transparent_background(image):
    rgba = image.convert('RGBA')
    marker = (255, 0, 255)
    probe = rgba.convert('RGB')
    for corner in ((0, 0), (rgba.width - 1, 0), (0, rgba.height - 1),
                   (rgba.width - 1, rgba.height - 1)):
        ImageDraw.floodfill(probe, corner, marker, thresh=WHITE_TOLERANCE)

    alpha = rgba.getchannel('A')
    alpha.putdata([
        0 if pixel == marker else value
        for pixel, value in zip(probe.get_flattened_data(), alpha.get_flattened_data())
    ])
    rgba.putalpha(alpha)
    return rgba


def write_icns(path, base):
    chunks = []
    for kind, size in ICNS_LAYERS:
        buf = io.BytesIO()
        base.resize((size, size), Image.Resampling.LANCZOS).save(buf, format='PNG')
        data = buf.getvalue()
        chunks.append(kind.encode('ascii') + struct.pack('>I', len(data) + 8) + data)

    body = b''.join(chunks)
    path.write_bytes(b'icns' + struct.pack('>I', len(body) + 8) + body)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ASSETS
    base = transparent_background(Image.open(SOURCE))

    base.save(out / 'icon.png')
    for size in HICOLOR_SIZES:
        target = out / f'icon-{size}.png'
        # Kaynak dosyanın üzerine yazmak onu geri dönülmez biçimde kaybettirir.
        if target.resolve() == SOURCE.resolve():
            raise SystemExit(f'{target.name} kaynak logonun kendisi; üretilemez.')
        base.resize((size, size), Image.Resampling.LANCZOS).save(target)

    # ICO en büyükten kaydediliyor: Pillow taban görüntüden büyük boyutları
    # üretmiyor, küçükten kaydedince dosyada tek bir katman kalıyor.
    layers = [base.resize((s, s), Image.Resampling.LANCZOS) for s in ICO_SIZES]
    layers[0].save(
        out / 'icon.ico',
        format='ICO',
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=layers[1:],
    )

    write_icns(out / 'icon.icns', base)
    print(f'ikonlar {SOURCE.name} dosyasından üretildi')


if __name__ == '__main__':
    main()
