#!/usr/bin/env python3
"""spectrogram.py sheet.png a.wav b.wav ... [--cols N] [--linear] — sound review sheet.

For each WAV (16-bit PCM): a log-frequency spectrogram (60 Hz - 16 kHz, or
0-6 kHz linear with --linear, to read harmonics and formants; on one fixed
dBFS colour scale, so tiles compare), the amplitude envelope
under it (RMS in 2 ms windows, -60..0 dBFS, with the -1 dBFS clip guard),
all stitched into one contact sheet. Prints a loudness table and writes it
next to the sheet as .csv:

  active   span where the 10 ms RMS is within 50 dB of its loudest (and above -70 dBFS)
  peak     sample peak, dBFS (over -1 is flagged)
  rms      RMS over the active span, dBFS
  st_max   loudest 50 ms RMS, dBFS (how loud it feels at its peak)
  a_max    loudest 23 ms A-weighted level, dB (perceived loudness, roughly)
"""
import csv
import os
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, SPEC_H, ENV_H, LABEL_H, PAD = 560, 220, 70, 40, 6
FMIN, FMAX = 60.0, 16000.0
LINEAR_MAX = 6000.0
LINEAR = False
DB_LO, DB_HI = -100.0, -10.0
N_FFT, HOP = 1024, 64

try:
    FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
    SMALL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
except OSError:
    FONT = SMALL = ImageFont.load_default()

# A magma-like ramp: black, purple, red, orange, pale yellow.
RAMP = np.array([[0, 0, 4], [50, 16, 104], [140, 41, 129], [222, 73, 104], [254, 159, 109], [252, 253, 191]], float)


def colour(x):
    """x in 0..1 -> RGB (uint8), along RAMP."""
    pos = np.clip(x, 0, 1) * (len(RAMP) - 1)
    i = np.minimum(pos.astype(int), len(RAMP) - 2)
    t = (pos - i)[..., None]
    return (RAMP[i] * (1 - t) + RAMP[i + 1] * t).astype(np.uint8)


def read(path):
    with wave.open(path) as w:
        rate, channels, n = w.getframerate(), w.getnchannels(), w.getnframes()
        data = np.frombuffer(w.readframes(n), dtype="<i2").astype(float) / 32768
    return rate, data.reshape(-1, channels)


def a_weight(f):
    f2 = np.maximum(f, 1e-3) ** 2
    ra = 12194**2 * f2**2 / ((f2 + 20.6**2) * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + 12194**2))
    return 20 * np.log10(ra) + 2.0


def stft(x):
    x = np.concatenate([np.zeros(N_FFT // 2), x, np.zeros(N_FFT)])
    frames = np.lib.stride_tricks.sliding_window_view(x, N_FFT)[::HOP]
    window = np.hanning(N_FFT)
    # Scaled so a full-scale sine reads 0 dBFS.
    return np.abs(np.fft.rfft(frames * window, axis=1)) / (window.sum() / 2)


def windowed_rms(x, rate, ms, hop_ms=1.0):
    n, hop = max(1, int(rate * ms / 1000)), max(1, int(rate * hop_ms / 1000))
    power = np.convolve(x**2, np.ones(n) / n, mode="same")[::hop]
    return np.sqrt(power), hop / rate


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-9))


def analyse(path):
    rate, data = read(path)
    mono = data.mean(axis=1)
    peak = db(np.abs(data).max())
    rms10, step = windowed_rms(mono, rate, 10)
    loud = db(rms10)
    floor = max(loud.max() - 50, -70)
    active = np.nonzero(loud > floor)[0]
    a, b = (active[0] * step, (active[-1] + 1) * step) if len(active) else (0, len(mono) / rate)
    span = mono[int(a * rate) : int(b * rate)]
    rms = db(np.sqrt(np.mean(span**2))) if len(span) else -120
    st_max = db(windowed_rms(mono, rate, 50)[0].max())
    mag = stft(mono)
    freqs = np.fft.rfftfreq(N_FFT, 1 / rate)
    weighted = np.sqrt((mag**2 * 10 ** (a_weight(freqs) / 10)).sum(axis=1) / 1.5)
    a_max = db(weighted.max())
    return dict(rate=rate, mono=mono, mag=mag, freqs=freqs, peak=peak, rms=rms, st_max=st_max, a_max=a_max, active=b - a, length=len(mono) / rate)


def tile(name, s):
    rate, mono, mag, freqs = s["rate"], s["mono"], s["mag"], s["freqs"]
    img = Image.new("RGB", (W, SPEC_H + ENV_H + LABEL_H), "#15151b")
    # Spectrogram: columns are time, rows log frequency (high at the top).
    cols = np.linspace(0, len(mag) - 1, W).astype(int)
    y = (np.arange(SPEC_H) + 0.5) / SPEC_H
    rows = LINEAR_MAX * (1 - y) if LINEAR else FMIN * (FMAX / FMIN) ** (1 - y)
    bins = rows / (rate / N_FFT)
    lo = np.clip(np.floor(bins).astype(int), 0, len(freqs) - 2)
    t = bins - lo
    m = mag[cols]
    spec = m[:, lo] * (1 - t) + m[:, lo + 1] * t
    level = (db(spec).T - DB_LO) / (DB_HI - DB_LO)
    img.paste(Image.fromarray(colour(level)), (0, 0))
    d = ImageDraw.Draw(img)
    marks = [(f, f"{f // 1000}k") for f in range(1000, int(LINEAR_MAX), 1000)] if LINEAR else [(100, "100"), (300, "300"), (1000, "1k"), (3000, "3k"), (10000, "10k")]
    for f, label in marks:
        y = SPEC_H * (1 - (f / LINEAR_MAX if LINEAR else np.log(f / FMIN) / np.log(FMAX / FMIN)))
        d.line([(0, y), (6, y)], fill="#8a8aa0")
        d.text((8, y - 6), label, fill="#8a8aa0", font=SMALL)
    # Envelope: RMS in 2 ms windows, -60..0 dBFS.
    env, _ = windowed_rms(mono, rate, 2)
    env = db(env[np.linspace(0, len(env) - 1, W).astype(int)])
    top = SPEC_H
    d.rectangle([0, top, W, top + ENV_H], fill="#1d1d26")
    for x, v in enumerate(env):
        h = np.clip((v + 60) / 60, 0, 1) * ENV_H
        d.line([(x, top + ENV_H), (x, top + ENV_H - h)], fill="#5fb3d9")
    clip_y = top + ENV_H * (1 / 60)
    d.line([(0, clip_y), (W, clip_y)], fill="#d9534f")
    for level_db in (-20, -40):
        y = top + ENV_H * (-level_db / 60)
        d.line([(0, y), (W, y)], fill="#3a3a48")
    # Time ticks.
    length = s["length"]
    step = next(v for v in (0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5) if length / v <= 14)
    for k in range(1, int(length / step) + 1):
        x = k * step / length * W
        d.line([(x, top + ENV_H - 5), (x, top + ENV_H)], fill="#c0c0d0")
    warn = s["peak"] > -1
    d.text((6, top + ENV_H + 4), name, fill="#ffd23f", font=FONT)
    stats = f"{s['active']*1000:.0f} ms   peak {s['peak']:.1f}   rms {s['rms']:.1f}   st {s['st_max']:.1f}   A {s['a_max']:.1f}   tick {step*1000:g} ms"
    d.text((6, top + ENV_H + 22), stats, fill="#ff6b6b" if warn else "#d0d0dc", font=SMALL)
    return img


def main(argv):
    global LINEAR
    cols = 3
    if "--linear" in argv:
        LINEAR = True
        argv = [a for a in argv if a != "--linear"]
    if "--cols" in argv:
        i = argv.index("--cols")
        cols = int(argv[i + 1])
        argv = argv[:i] + argv[i + 2 :]
    out, paths = argv[0], argv[1:]
    rows = []
    tiles = []
    for path in paths:
        name = os.path.splitext(os.path.basename(path))[0]
        s = analyse(path)
        tiles.append(tile(name, s))
        rows.append((name, s["active"], s["length"], s["peak"], s["rms"], s["st_max"], s["a_max"]))
    w, h = tiles[0].size
    n_rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + PAD) + PAD, n_rows * (h + PAD) + PAD), "#0b0b10")
    for i, img in enumerate(tiles):
        sheet.paste(img, (PAD + (i % cols) * (w + PAD), PAD + (i // cols) * (h + PAD)))
    sheet.save(out)
    print(f"{'sound':<16}{'active s':>9}{'peak':>8}{'rms':>8}{'st_max':>8}{'A max':>8}")
    for name, active, _, peak, rms, st, a in rows:
        flag = "  CLIP?" if peak > -1 else ""
        print(f"{name:<16}{active:>9.3f}{peak:>8.1f}{rms:>8.1f}{st:>8.1f}{a:>8.1f}{flag}")
    with open(os.path.splitext(out)[0] + ".csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["sound", "active_s", "file_s", "peak_dbfs", "rms_dbfs", "st_max_dbfs", "a_max_db"])
        for row in rows:
            writer.writerow([row[0]] + [f"{v:.3f}" if i < 2 else f"{v:.1f}" for i, v in enumerate(row[1:])])
    print(out)


if __name__ == "__main__":
    main(sys.argv[1:])
