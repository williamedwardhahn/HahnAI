# Chapter: Images as arrays

# %% _setup
import numpy as np
np.set_printoptions(linewidth=90)

# %% img_smiley
import numpy as np
import matplotlib.pyplot as plt

face = np.array([
    [0,   0,   0,   0,   0,   0,   0,   0],
    [0,   0, 255,   0,   0, 255,   0,   0],
    [0,   0, 255,   0,   0, 255,   0,   0],
    [0,   0,   0,   0,   0,   0,   0,   0],
    [0, 255,   0,   0,   0,   0, 255,   0],
    [0,   0, 255, 255, 255, 255,   0,   0],
    [0,   0,   0,   0,   0,   0,   0,   0],
], dtype=np.uint8)

print(face.shape, face.dtype)
plt.figure(figsize=(2, 1.8))
plt.imshow(face, cmap='gray')
plt.show()  # fig: img_smiley

# %% img_plot
def plot(x, title=None, size=2.6, **kwargs):
    plt.figure(figsize=(size, size))
    plt.imshow(x, cmap='gray', **kwargs)
    plt.axis('off')
    if title:
        plt.title(title)
    plt.show()

# %% img_invert
plot(255 - face, size=1.8)  # fig: img_invert

# %% img_rgb
pixels = np.array([
    # red          green          blue
    [[255, 0, 0],   [0, 255, 0],   [0, 0, 255]],
    # cyan         magenta        yellow
    [[0, 255, 255], [255, 0, 255], [255, 255, 0]],
], dtype=np.uint8)

print(pixels.shape)
plot(pixels, size=2)  # fig: img_rgb

# %% img_load
import os
from skimage import data
from skimage.io import imread, imsave

os.makedirs('data', exist_ok=True)      # a folder for our files
imsave('data/cat.png', data.chelsea())  # save a sample photo...
cat = imread('data/cat.png')            # ...and read it back

print(cat.shape, cat.dtype, cat.min(), cat.max())
plot(cat, size=3.4)  # fig: img_cat

# %% img_pixel
print(cat[100, 200])        # one pixel: [red, green, blue]
print(cat[100, 200, 0])     # just its red value

# %% img_crop
eye = cat[20:190, 110:290]
print(eye.shape)
plot(eye, size=2.2)  # fig: img_crop

# %% img_channels
red, green, blue = cat[:, :, 0], cat[:, :, 1], cat[:, :, 2]

channels = [(red, 'red'), (green, 'green'), (blue, 'blue')]

plt.figure(figsize=(4.6, 1.4))
for i, (channel, name) in enumerate(channels):
    plt.subplot(1, 3, i + 1)
    plt.imshow(channel, cmap='gray', vmin=0, vmax=255)  # same scale
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: img_channels

# %% img_only_green
only_green = cat.copy()
only_green[:, :, 0] = 0     # no red
only_green[:, :, 2] = 0     # no blue
plot(only_green)  # fig: img_only_green

# %% img_overflow
x = np.array([100, 200, 250], dtype=np.uint8)
print(x * 2)                # wraps around past 255!
print(x.astype(float) * 2)

# %% img_brighter
wrong = cat * 2
right = np.clip(cat.astype(float) * 2, 0, 255).astype(np.uint8)

plt.figure(figsize=(4.6, 1.8))
for i, (im, name) in enumerate([(wrong, 'cat * 2'), (right, 'clipped')]):
    plt.subplot(1, 2, i + 1)
    plt.imshow(im)
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: img_brighter

# %% img_gray
gray = cat.mean(axis=2)     # average the three channels
print(gray.shape, gray.dtype)

# %% img_transforms
from skimage.transform import resize, rotate

small = resize(cat, (24, 36))     # now floats between 0 and 1
turned = rotate(cat, angle=30)
mirror = cat[:, ::-1]             # reverse the column order
print(small.shape, small.dtype, small.max())

versions = [(small, 'resized'), (turned, 'rotated'), (mirror, 'flipped')]

plt.figure(figsize=(4.6, 1.3))
for i, (im, name) in enumerate(versions):
    plt.subplot(1, 3, i + 1)
    plt.imshow(im)
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: img_transforms


# %% img_bits
def reduce_bits(image, bits):
    levels = 2**bits                         # 8 bits: 256 shades
    q = np.round(image / 255 * (levels - 1)) # nearest shade, 0..levels-1
    return q / (levels - 1)                  # back to 0..1 for drawing

plt.figure(figsize=(4.6, 1.2))
for i, bits in enumerate([8, 4, 2, 1]):
    plt.subplot(1, 4, i + 1)
    plt.imshow(reduce_bits(gray, bits), cmap='gray', vmin=0, vmax=1)
    word = 'bit' if bits == 1 else 'bits'
    plt.title(f'{bits} {word}\n{2**bits} shades')
    plt.axis('off')
plt.show()  # fig: img_bits

# %% img_dither
def dither(image):
    """Floyd-Steinberg: black or white, passing each error on."""
    x = image / 255.0
    out = np.zeros_like(x)
    h, w = x.shape
    for r in range(h):
        for c in range(w):
            out[r, c] = 1.0 if x[r, c] >= 0.5 else 0.0
            err = x[r, c] - out[r, c]
            if c + 1 < w:
                x[r, c + 1] += err * 7 / 16
            if r + 1 < h:
                if c > 0:
                    x[r + 1, c - 1] += err * 3 / 16
                x[r + 1, c] += err * 5 / 16
                if c + 1 < w:
                    x[r + 1, c + 1] += err * 1 / 16
    return out

d = dither(gray)
print(np.unique(d), round(d.mean(), 3), round(gray.mean() / 255, 3))

plt.figure(figsize=(4.6, 1.75))
for i, (im, name) in enumerate([(reduce_bits(gray, 1), 'rounded'),
                                (d, 'dithered')]):
    plt.subplot(1, 2, i + 1)
    plt.imshow(im, cmap='gray', vmin=0, vmax=1)
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: img_dither

# %% img_count
from math import log10

for name, pixels, shades in [('3x3 black and white', 9, 2),
                             ('3x3 gray', 9, 256),
                             ('28x28 black and white', 784, 2),
                             ('28x28 gray', 784, 256),
                             ('the cat photo', 300 * 451 * 3, 256)]:
    digits = int(pixels * log10(shades)) + 1
    count = f'{shades}^{pixels}'
    print(f'{name:22s} {count:11s} has {digits:,} digits')

# %% img_noise
rng = np.random.default_rng(0)
noise = rng.integers(0, 256, size=(4, 28, 28))

plt.figure(figsize=(4.6, 1.2))
for i in range(4):
    plt.subplot(1, 4, i + 1)
    plt.imshow(noise[i], cmap='gray')
    plt.axis('off')
plt.show()  # fig: img_noise

# %% img_sound
from scipy.io import wavfile

rate = 44_100                         # samples per second
t = np.arange(rate) / rate            # one second of time
a4 = np.sin(2 * np.pi * 440 * t)      # the A above middle C
print(t.shape, a4[:4])

chord = (np.sin(2 * np.pi * 440 * t) + np.sin(2 * np.pi * 554 * t)
         + np.sin(2 * np.pi * 659 * t)) / 3          # A major
wavfile.write('data/chord.wav', rate, (chord * 32767).astype(np.int16))

plt.figure(figsize=(4.6, 1.6))
plt.plot(t[:500] * 1000, a4[:500], label='A, 440 Hz')
plt.plot(t[:500] * 1000, chord[:500], label='A major chord')
plt.xlabel('milliseconds')
plt.legend(frameon=False, ncol=2, loc='lower center',
           bbox_to_anchor=(0.5, 1.0))
plt.show()  # fig: img_sound
