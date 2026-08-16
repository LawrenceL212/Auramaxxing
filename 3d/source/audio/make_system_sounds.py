"""Procedural System sounds for the opening cinematic.

NumPy synthesis -> 16-bit WAV -> Opus via ffmpeg. Deliberately sparse: five
short cues, no music bed. Everything is synthesised, nothing is sampled.

Run: python make_system_sounds.py
"""
import pathlib, struct, subprocess, wave
import numpy as np

SR = 48000
OUT = pathlib.Path(__file__).resolve().parents[2] / "exports" / "audio"
OUT.mkdir(parents=True, exist_ok=True)


def env(n, a, d, s=0.0, r=0.3, sus=0.0):
    """Simple ADSR over n samples, fractions of total length."""
    t = np.linspace(0, 1, n)
    e = np.ones(n)
    e = np.where(t < a, t / max(a, 1e-6), e)
    dm = (t >= a) & (t < a + d)
    e = np.where(dm, 1.0 - (1.0 - sus) * ((t - a) / max(d, 1e-6)), e)
    rm = t >= 1.0 - r
    e = np.where(rm, e * (1.0 - (t - (1.0 - r)) / max(r, 1e-6)), e)
    return np.clip(e, 0, 1)


def write(name, sig, gain=0.7):
    sig = sig / max(np.abs(sig).max(), 1e-9) * gain
    wav = OUT / f"{name}.wav"
    with wave.open(str(wav), "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(v * 32767)) for v in sig))
    ogg = OUT / f"{name}.ogg"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
                    "-c:a", "libopus", "-b:a", "64k", str(ogg)], check=True)
    wav.unlink()
    print(f"  {name:12} {ogg.stat().st_size/1024:6.1f} KB")


def t(dur):
    return np.linspace(0, dur, int(SR * dur), endpoint=False)


print("synthesising System cues:")

# 1. VOID PULSE - a distant, almost subsonic knock. The first sign of anything.
x = t(2.4)
sig = (np.sin(2*np.pi*38*x) * 0.9 + np.sin(2*np.pi*57*x) * 0.35
       + np.sin(2*np.pi*23*x) * 0.5)
sig *= env(len(x), 0.02, 0.55, r=0.42)
sig += np.random.default_rng(1).normal(0, 0.012, len(x)) * env(len(x), 0.01, 0.3, r=0.6)
write("sys-pulse", sig, 0.55)

# 2. ARRIVAL - low frequency swell, something large approaching from below.
x = t(3.2)
f = 28 * np.exp(x * 0.42)
sig = np.sin(2*np.pi*np.cumsum(f)/SR) * 0.9
sig += np.sin(2*np.pi*np.cumsum(f*1.5)/SR) * 0.25
sig *= np.minimum(1, x * 0.6) * env(len(x), 0.35, 0.4, sus=0.75, r=0.28)
write("sys-arrival", sig, 0.6)

# 3. RECOGNITION - a clean two-tone interval, the System naming you.
x = t(1.5)
sig = (np.sin(2*np.pi*440*x) * env(len(x), 0.004, 0.30, sus=0.25, r=0.55)
       + np.sin(2*np.pi*660*x) * env(len(x), 0.05, 0.35, sus=0.20, r=0.5) * 0.8
       + np.sin(2*np.pi*1320*x) * env(len(x), 0.01, 0.12, r=0.7) * 0.18)
write("sys-recognise", sig, 0.42)

# 4. SURGE - rising shimmer with a body underneath, for the aura spike.
x = t(1.8)
f = 180 * np.exp(x * 1.35)
sig = np.sin(2*np.pi*np.cumsum(f)/SR) * 0.55
sig += np.sign(np.sin(2*np.pi*np.cumsum(f*0.5)/SR)) * 0.16
sig += np.sin(2*np.pi*np.cumsum(f*2.01)/SR) * 0.22
sig *= env(len(x), 0.18, 0.30, sus=0.6, r=0.4)
sig += np.sin(2*np.pi*46*x) * env(len(x), 0.05, 0.5, r=0.4) * 0.5
write("sys-surge", sig, 0.5)

# 5. REVEAL - the interface materialising: short, bright, dry.
x = t(1.1)
sig = (np.sin(2*np.pi*880*x) * env(len(x), 0.002, 0.18, r=0.6) * 0.5
       + np.sin(2*np.pi*1760*x) * env(len(x), 0.002, 0.10, r=0.7) * 0.28)
n = np.random.default_rng(7).normal(0, 1, len(x))
n *= env(len(x), 0.001, 0.06, r=0.5) * 0.25
sig += n
write("sys-reveal", sig, 0.38)

print("->", OUT)
