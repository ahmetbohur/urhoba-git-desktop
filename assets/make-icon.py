#!/usr/bin/env python3
"""Urhoba Git Desktop uygulama ikonunu üretir.

    python3 assets/make-icon.py

Tek bir kaynak görüntüyü ölçeklemek yerine her boyut yeniden çiziliyor. İki
sebebi var: 1024'lük bir görüntüyü 16 piksele indirmek bulanık bir leke
bırakıyor, ve 16-32 pikselde yön tuşundaki harfler okunmayıp gürültüye
dönüşüyor — o boyutlar harfsiz çiziliyor, silüet okunur kalıyor.

Çizim 4 kat büyük tuvalde yapılıp indiriliyor: Pillow'un yuvarlatılmış
dikdörtgenlerdeki kenar yumuşatması tek başına yeterli değil.
"""
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SS = 4                      # süper örnekleme katsayısı
D = 1024                    # tasarım uzayı
S = D * SS

RED = (224, 0, 22)
PURPLE = (36, 6, 90)
WHITE = (255, 255, 255)
FONT = '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf'

# Gövde: uçları tam yuvarlak bir "stadyum", altında kumanda boşluğu.
BODY = (132, 302, 892, 722)
NOTCH_TOP_Y, NOTCH_HALF, NOTCH_R = 652, 64, 22

DPAD = (272, 528)           # yön tuşunun merkezi
ARM_LEN, ARM_THICK, ARM_R = 118, 47, 16
BUTTON_R = 61
BUTTON_A = (736, 460)
BUTTON_B = (653, 583)

# Bu boyutun altında harfler okunmuyor; silüet uğruna atlanıyorlar.
LETTER_MIN = 48


def s(value):
    return int(round(value * SS))


def gradient(width, height):
    """Yatay kırmızı → mor geçiş. Tek piksellik şerit büyütülüyor; 4096 sütunu
    tek tek hesaplamak gereksiz yere yavaş."""
    strip = Image.new('RGB', (width, 1))
    strip.putdata([
        tuple(round(a + (b - a) * (x / (width - 1))) for a, b in zip(RED, PURPLE))
        for x in range(width)
    ])
    return strip.resize((width, height), Image.Resampling.NEAREST)


def draw_icon(with_letters=True):
    left, top, right, bottom = (s(v) for v in BODY)
    width, height = right - left, bottom - top

    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((left, top, right, bottom), radius=height // 2, fill=255)
    # Kumanda boşluğu gövdeden oyuluyor. Kenarları dik, üst köşeleri yuvarlak:
    # yamuk bir kesik ikonu aşağıdan ikiye bölünmüş gibi gösteriyordu.
    cx = S // 2
    md.rounded_rectangle(
        (cx - s(NOTCH_HALF), s(NOTCH_TOP_Y), cx + s(NOTCH_HALF), bottom + s(40)),
        radius=s(NOTCH_R),
        fill=0,
    )

    body = Image.new('RGB', (S, S), PURPLE)
    body.paste(gradient(width, height), (left, top))
    icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    icon.paste(body, (0, 0), mask)

    d = ImageDraw.Draw(icon)
    dx, dy = s(DPAD[0]), s(DPAD[1])
    arm, thick, radius = s(ARM_LEN), s(ARM_THICK), s(ARM_R)
    d.rounded_rectangle((dx - arm, dy - thick, dx + arm, dy + thick), radius=radius, fill=WHITE)
    d.rounded_rectangle((dx - thick, dy - arm, dx + thick, dy + arm), radius=radius, fill=WHITE)

    for center in (BUTTON_A, BUTTON_B):
        bx, by, br = s(center[0]), s(center[1]), s(BUTTON_R)
        d.ellipse((bx - br, by - br, bx + br, by + br), fill=WHITE)

    if with_letters:
        letters = ImageFont.truetype(FONT, s(60))
        for text, ox, oy in (('u', -68, 0), ('r', 0, -66), ('o', 68, 0), ('h', 0, 66)):
            d.text((dx + s(ox), dy + s(oy)), text, font=letters, fill=RED, anchor='mm')
        for text, center in (('a', BUTTON_A), ('b', BUTTON_B)):
            d.text((s(center[0]), s(center[1])), text, font=letters, fill=PURPLE, anchor='mm')

    return icon


def render(size, cache={}):
    key = size >= LETTER_MIN
    if key not in cache:
        cache[key] = draw_icon(with_letters=key)
    return cache[key].resize((size, size), Image.Resampling.LANCZOS)


def write_icns(path, sizes_by_type):
    """ICNS'i elle yazıyoruz: Pillow her platformda kaydedemiyor ve biçim basit —
    'icns' + toplam uzunluk, ardından tür + uzunluk + PNG üçlüleri."""
    import io

    chunks = []
    for kind, size in sizes_by_type:
        buf = io.BytesIO()
        render(size).save(buf, format='PNG')
        data = buf.getvalue()
        chunks.append(kind.encode('ascii') + struct.pack('>I', len(data) + 8) + data)

    body = b''.join(chunks)
    path.write_bytes(b'icns' + struct.pack('>I', len(body) + 8) + body)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent)

    render(1024).save(out / 'icon.png')
    for size in (16, 32, 64, 128, 256):
        render(size).save(out / f'icon-{size}.png')

    # ICO en büyükten kaydediliyor: Pillow taban görüntüden büyük boyutları
    # üretmiyor, 16'dan kaydedince dosyada tek bir 16x16 kalıyor.
    ico_sizes = [256, 128, 64, 48, 32, 24, 16]
    images = [render(size) for size in ico_sizes]
    images[0].save(
        out / 'icon.ico',
        format='ICO',
        sizes=[(size, size) for size in ico_sizes],
        append_images=images[1:],
    )

    write_icns(
        out / 'icon.icns',
        [
            ('icp4', 16), ('icp5', 32), ('icp6', 64),
            ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024),
            ('ic11', 32), ('ic12', 64), ('ic13', 256), ('ic14', 512),
        ],
    )
    print(f'ikon üretildi: {out}')


if __name__ == '__main__':
    main()
