#!/usr/bin/env python3
"""
Generate 4 BGM variants for Silk Road Qatar game.

Output: static/silk-road/qatar/audio/silk-road-bgm-{A,B,C,D}.wav

A. Maqam Hijaz + Drone + Darbuka (中东阿拉伯经典) — DEFAULT
B. Maqam Bayati + Slow Oud + No drums (舒缓祈祷风)
C. Maqam Rast + Brighter + Khaliji rhythm (海湾欢快风)
D. Desert Ambient (drone + 风声 + 远处驼铃声)

22kHz mono WAV, 30s loop, ~1.3MB each.
"""

import struct
import math
import wave
import os
import random

SAMPLE_RATE = 22050
DURATION = 30.0  # seconds
N_SAMPLES = int(SAMPLE_RATE * DURATION)
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'static', 'silk-road', 'qatar', 'audio')

# ====== 工具: 生成正弦波采样 ======
def sine(freq, t, phase=0.0):
    return math.sin(2 * math.pi * freq * t + phase)

def sawtooth(freq, t):
    # 锯齿波 (鼓用)
    return 2 * (t * freq - math.floor(0.5 + t * freq))

def lowpass_filter(samples, cutoff_hz):
    """一阶低通 (IIR): y[n] = a*x[n] + (1-a)*y[n-1]"""
    rc = 1.0 / (2 * math.pi * cutoff_hz)
    dt = 1.0 / SAMPLE_RATE
    alpha = dt / (rc + dt)
    out = [0.0] * len(samples)
    y = 0.0
    for i, x in enumerate(samples):
        y = alpha * x + (1 - alpha) * y
        out[i] = y
    return out

def normalize(samples, peak=0.85):
    """归一化到 ±peak"""
    mx = max(abs(s) for s in samples)
    if mx < 1e-9:
        return samples
    return [s * (peak / mx) for s in samples]

def envelope(i, total, attack=0.02, release=0.1):
    """简单 ADSR (只用 attack + release)"""
    a_n = int(attack * SAMPLE_RATE)
    r_n = int(release * SAMPLE_RATE)
    if i < a_n:
        return i / max(1, a_n)
    if i > total - r_n:
        return max(0, (total - i) / max(1, r_n))
    return 1.0

def write_wav(path, samples):
    """写 16-bit mono WAV"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        # clip + 转 int16
        data = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            data.extend(struct.pack('<h', int(v * 32767)))
        w.writeframes(bytes(data))


# ====== A: Maqam Hijaz + Drone + Darbuka ======
# 调式: D Eb F G A Bb C D (Hijaz), 起音 D4 = 293.66Hz
# 慢板 80bpm + drone (D2 + A2) + 简单 darbuka 节拍
def gen_bgm_A():
    print('Generating BGM-A (Hijaz + Drone + Darbuka)...')
    samples = [0.0] * N_SAMPLES
    # Drone (持续低音 D2 + A2)
    for i in range(N_SAMPLES):
        t = i / SAMPLE_RATE
        samples[i] += 0.10 * sine(73.42, t)        # D2
        samples[i] += 0.08 * sine(110.00, t)       # A2
        samples[i] += 0.04 * sine(146.83, t) * 0.7  # D3 八度

    # 旋律 (Hijaz 8 音: D4 Eb4 F4 G4 A4 Bb4 C5 D5)
    hijaz = [293.66, 311.13, 369.99, 392.00, 440.00, 466.16, 523.25, 587.33]
    # 慢旋律: 每秒 1 个音, 共 30 音 (30 秒)
    melody_pattern = [
        (0, 4, 4.0), (4, 0, 3.0), (0, 1, 2.0), (1, 4, 3.0),
        (4, 5, 2.0), (5, 4, 2.0), (4, 2, 2.0), (2, 0, 3.0),
        (0, 4, 3.0), (4, 5, 2.0), (5, 7, 3.0), (7, 5, 2.0),
        (5, 4, 2.0), (4, 2, 2.0), (2, 0, 3.0), (0, 4, 4.0),
        (4, 1, 2.0), (1, 4, 2.0), (4, 5, 2.0), (5, 4, 3.0),
        (4, 0, 4.0), (0, 4, 3.0), (4, 2, 2.0), (2, 4, 3.0),
        (4, 5, 2.0), (5, 7, 2.0), (7, 5, 2.0), (5, 4, 3.0),
        (4, 0, 4.0), (0, 4, 2.0),
    ]
    cur_time = 0.0
    for start_note, end_note, dur in melody_pattern:
        n = int(cur_time * SAMPLE_RATE)
        total = int(dur * SAMPLE_RATE)
        # 滑音 (portamento)
        for k in range(total):
            if n + k >= N_SAMPLES:
                break
            t = k / SAMPLE_RATE
            f = hijaz[start_note] + (hijaz[end_note] - hijaz[start_note]) * (k / total)
            env = envelope(k, total, attack=0.05, release=0.15)
            samples[n + k] += 0.20 * sine(f, t) * env
            # 加点八度泛音
            samples[n + k] += 0.05 * sine(f * 2, t) * env
        cur_time += dur

    # Darbuka 节拍 (80bpm, 每拍 0.75s)
    bpm = 80
    beat_dur = 60.0 / bpm
    n_beats = int(DURATION / beat_dur)
    for b in range(n_beats):
        t0 = b * beat_dur
        n0 = int(t0 * SAMPLE_RATE)
        # 主拍 (咚, 100Hz 衰减)
        dur = int(0.15 * SAMPLE_RATE)
        for k in range(dur):
            if n0 + k >= N_SAMPLES:
                break
            t = k / SAMPLE_RATE
            env = math.exp(-t * 25)
            # 鼓是 sawtooth-like noise
            noise = (random.random() * 2 - 1) * 0.3
            samples[n0 + k] += 0.20 * (sawtooth(80, t) * env * 0.7 + noise * env * 0.3)
        # 反拍 (哒, 高频)
        t1 = t0 + beat_dur / 2
        n1 = int(t1 * SAMPLE_RATE)
        dur2 = int(0.08 * SAMPLE_RATE)
        for k in range(dur2):
            if n1 + k >= N_SAMPLES:
                break
            t = k / SAMPLE_RATE
            env = math.exp(-t * 40)
            samples[n1 + k] += 0.12 * (random.random() * 2 - 1) * env

    samples = normalize(samples, peak=0.85)
    write_wav(os.path.join(OUT_DIR, 'silk-road-bgm-A.wav'), samples)
    print('  ✓ A done')


# ====== B: Maqam Bayati + Slow Oud + No drums ======
# 调式: D Eb-half-flat F G A Bb C D (Bayati), 跟 Hijaz 相似但不同
# 这里用近似: D Eb F G A Bb C D (简化)
# 慢板 60bpm, no darbuka, 只 melody + drone + 一点 reverb-like
def gen_bgm_B():
    print('Generating BGM-B (Bayati + Slow Oud + No drums)...')
    samples = [0.0] * N_SAMPLES
    # Drone (持续低音)
    for i in range(N_SAMPLES):
        t = i / SAMPLE_RATE
        samples[i] += 0.10 * sine(73.42, t)
        samples[i] += 0.08 * sine(110.00, t)

    # 慢旋律 (60bpm, 每拍 1s, 用更慢的 1.5s 节奏)
    bayati = [293.66, 311.13, 349.23, 392.00, 440.00, 466.16, 523.25, 587.33]
    melody_pattern = [
        (0, 4, 3.0), (4, 0, 3.0), (0, 4, 2.0), (4, 2, 2.0),
        (2, 4, 3.0), (4, 5, 2.0), (5, 4, 2.0), (4, 0, 4.0),
        (0, 4, 3.0), (4, 5, 2.0), (5, 7, 3.0), (7, 5, 2.0),
        (5, 4, 3.0), (4, 0, 4.0), (0, 4, 3.0), (4, 2, 2.0),
        (2, 4, 2.0), (4, 0, 3.0),
    ]
    cur_time = 0.0
    for start_note, end_note, dur in melody_pattern:
        n = int(cur_time * SAMPLE_RATE)
        total = int(dur * SAMPLE_RATE)
        # 慢速 portamento (像 Oud 滑音)
        for k in range(total):
            if n + k >= N_SAMPLES:
                break
            t = k / SAMPLE_RATE
            f = bayati[start_note] + (bayati[end_note] - bayati[start_note]) * (k / total)
            env = envelope(k, total, attack=0.10, release=0.30)
            # 模拟 Oud 音色: sine + 一些泛音
            samples[n + k] += 0.18 * sine(f, t) * env
            samples[n + k] += 0.05 * sine(f * 1.5, t) * env
            samples[n + k] += 0.03 * sine(f * 2, t) * env

        cur_time += dur

    # 加上柔 reverb-like 效果 (低通过滤部分片段)
    # 这里用简单方法: 间隔 30ms 加弱 echo
    echo_delay = int(0.030 * SAMPLE_RATE)
    echo_samples = samples[:]
    for i in range(echo_delay, N_SAMPLES):
        samples[i] += 0.25 * echo_samples[i - echo_delay]

    samples = normalize(samples, peak=0.85)
    write_wav(os.path.join(OUT_DIR, 'silk-road-bgm-B.wav'), samples)
    print('  ✓ B done')


# ====== C: Maqam Rast + Brighter + Khaliji rhythm ======
# 调式: C D E-half-flat F G A Bb C (Rast)
# 频率: C=261.63, D=293.66, E-half-flat=311.13, F=349.23, G=392.00, A=440, Bb=466.16, C=523.25
# 快 100bpm + 复杂 Khaliji 7/8 拍子
def gen_bgm_C():
    print('Generating BGM-C (Rast + Brighter + Khaliji)...')
    samples = [0.0] * N_SAMPLES
    # Drone
    for i in range(N_SAMPLES):
        t = i / SAMPLE_RATE
        samples[i] += 0.08 * sine(65.41, t)   # C2
        samples[i] += 0.06 * sine(98.00, t)   # G2
        samples[i] += 0.04 * sine(130.81, t)  # C3

    # 明亮旋律 (100bpm, 快节奏)
    rast = [261.63, 293.66, 311.13, 349.23, 392.00, 440.00, 466.16, 523.25]
    # 短促节奏: 0.4s 一音, 跳跃多
    pattern = [
        (4, 5, 0.4), (7, 5, 0.4), (4, 2, 0.4), (0, 4, 0.4),
        (4, 7, 0.4), (5, 4, 0.4), (2, 4, 0.4), (4, 0, 0.4),
        (4, 5, 0.4), (7, 5, 0.4), (5, 7, 0.4), (7, 4, 0.4),
        (4, 2, 0.4), (2, 4, 0.4), (5, 7, 0.4), (4, 5, 0.4),
    ]
    cur_time = 0.0
    for start_note, end_note, dur in pattern:
        n = int(cur_time * SAMPLE_RATE)
        total = int(dur * SAMPLE_RATE)
        for k in range(total):
            if n + k >= N_SAMPLES:
                break
            t = k / SAMPLE_RATE
            f = rast[start_note] + (rast[end_note] - rast[start_note]) * (k / total)
            env = envelope(k, total, attack=0.02, release=0.08)
            # 明亮音色: 加更多高频泛音
            samples[n + k] += 0.18 * sine(f, t) * env
            samples[n + k] += 0.08 * sine(f * 2, t) * env
            samples[n + k] += 0.04 * sine(f * 3, t) * env
        cur_time += dur

    # Khaliji 7/8 节拍 — 7 拍分 2+2+3 (0, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90s)
    # 100bpm = 0.6s/beat, 7/8 = 0.6 * 7/8 = 0.525s 一个循环
    khaliji_dur = 0.525
    n_loops = int(DURATION / khaliji_dur)
    for loop in range(n_loops):
        t0 = loop * khaliji_dur
        # 7 拍中的每一拍位置
        for beat in range(7):
            tn = t0 + beat * (khaliji_dur / 7)
            n0 = int(tn * SAMPLE_RATE)
            dur = int(0.10 * SAMPLE_RATE)
            # 鼓点 (咚, 加重 + 弱)
            env_strength = 0.22 if beat in [0, 3, 5] else 0.12
            for k in range(dur):
                if n0 + k >= N_SAMPLES:
                    break
                t = k / SAMPLE_RATE
                env = math.exp(-t * 30)
                noise = (random.random() * 2 - 1) * 0.3
                samples[n0 + k] += env_strength * (sawtooth(80, t) * env * 0.6 + noise * env * 0.4)

    samples = normalize(samples, peak=0.85)
    write_wav(os.path.join(OUT_DIR, 'silk-road-bgm-C.wav'), samples)
    print('  ✓ C done')


# ====== D: Desert Ambient (纯氛围) ======
# 无旋律, 只有:
#   - 持续 drone (D2+A2 五度)
#   - 风 noise (低通滤波)
#   - 远处驼铃声 (每 4 秒一声, 短促 1kHz sin + 衰减)
def gen_bgm_D():
    print('Generating BGM-D (Desert Ambient)...')
    samples = [0.0] * N_SAMPLES

    # 1) Drone (持续 30 秒)
    for i in range(N_SAMPLES):
        t = i / SAMPLE_RATE
        samples[i] += 0.12 * sine(73.42, t)    # D2
        samples[i] += 0.10 * sine(110.00, t)   # A2
        samples[i] += 0.05 * sine(146.83, t)   # D3 八度

    # 2) 风声 (随机 noise, 然后低通滤波)
    print('  Generating wind noise...')
    wind_raw = [(random.random() * 2 - 1) for _ in range(N_SAMPLES)]
    wind_low = lowpass_filter(wind_raw, cutoff_hz=400)  # 截止 400Hz
    wind_mid = lowpass_filter(wind_raw, cutoff_hz=800)  # 截止 800Hz
    for i in range(N_SAMPLES):
        # 风声缓慢呼吸感: amplitude modulated
        t = i / SAMPLE_RATE
        mod = 0.5 + 0.3 * math.sin(2 * math.pi * 0.15 * t)  # 周期 6.7 秒
        samples[i] += 0.10 * wind_low[i] * mod
        samples[i] += 0.04 * wind_mid[i] * mod * 0.5

    # 3) 远处驼铃声 (每 4 秒一声, 1.2kHz sin + 衰减)
    print('  Generating camel bells...')
    for chime_t in range(4, int(DURATION), 4):  # 4, 8, 12, 16, 20, 24, 28
        n0 = int(chime_t * SAMPLE_RATE)
        # 铃声: 1200Hz + 1800Hz 双频 (像铃铛)
        dur = int(0.6 * SAMPLE_RATE)  # 0.6 秒长
        for k in range(dur):
            if n0 + k >= N_SAMPLES:
                break
            t = k / SAMPLE_RATE
            env = math.exp(-t * 6)  # 0.6 秒内缓慢衰减
            samples[n0 + k] += 0.08 * sine(1200, t) * env
            samples[n0 + k] += 0.04 * sine(1800, t) * env
            samples[n0 + k] += 0.02 * sine(2400, t) * env

    # 4) 偶尔的远鼓 (远处部落鼓声, 非常弱)
    print('  Generating distant drums...')
    for drum_t in [6, 14, 22]:
        n0 = int(drum_t * SAMPLE_RATE)
        dur = int(0.25 * SAMPLE_RATE)
        for k in range(dur):
            if n0 + k >= N_SAMPLES:
                break
            t = k / SAMPLE_RATE
            env = math.exp(-t * 15)
            noise = (random.random() * 2 - 1) * 0.3
            samples[n0 + k] += 0.06 * (sawtooth(60, t) * env * 0.7 + noise * env * 0.3)

    samples = normalize(samples, peak=0.85)
    write_wav(os.path.join(OUT_DIR, 'silk-road-bgm-D.wav'), samples)
    print('  ✓ D done')


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    random.seed(42)  # reproducible
    gen_bgm_A()
    gen_bgm_B()
    gen_bgm_C()
    gen_bgm_D()
    print('\nAll 4 BGM variants generated in', OUT_DIR)