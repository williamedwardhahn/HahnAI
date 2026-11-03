# Chapter: Convolution

# %% _setup
import numpy as np
import matplotlib.pyplot as plt
np.set_printoptions(precision=3, suppress=True)

def plot(x, title=None, size=2.6, **kwargs):
    plt.figure(figsize=(size, size))
    plt.imshow(x, cmap='gray', **kwargs)
    plt.axis('off')
    if title:
        plt.title(title)
    plt.show()

# %% cv_coins
from skimage import data

coins = data.coins() / 255.0
print(coins.shape)
plot(coins, size=3.2)  # fig: cv_coins

# %% cv_coin
coin = coins[170:220, 75:130]
print(coin.shape)
plot(coin, size=1.2)  # fig: cv_coin

# %% cv_one_spot
image = coins - coins.mean()        # center both on zero, so dark
kernel = coin - coin.mean()         # pixels count against a match

def match_at(r, c):
    h, w = kernel.shape
    patch = image[r:r + h, c:c + w]
    return np.sum(patch * kernel)

print(round(match_at(170, 75), 1))    # where the coin came from
print(round(match_at(100, 200), 1))   # somewhere else

# %% cv_correlate
from scipy.signal import correlate2d

z = correlate2d(image, kernel, mode='valid')
print(z.shape)
row, col = np.unravel_index(z.argmax(), z.shape)
print(int(row), int(col))
plot(z, size=3.2)  # fig: cv_correlate

# %% cv_ncc
from skimage.feature import match_template, peak_local_max

score = match_template(coins, coin)
peaks = peak_local_max(score, min_distance=20, threshold_abs=0.5)
print(len(peaks), 'matches')

plt.figure(figsize=(3.2, 2.6))
plt.imshow(coins, cmap='gray')
h, w = coin.shape                     # mark each coin's center
plt.scatter(peaks[:, 1] + w // 2, peaks[:, 0] + h // 2, s=40,
            facecolors='none', edgecolors='#f97306', linewidths=1.5)
plt.axis('off')
plt.show()  # fig: cv_ncc

# %% cv_kernels
camera = data.camera() / 255.0

blur = np.ones((5, 5)) / 25
sobel = np.array([[ 1,  2,  1],
                  [ 0,  0,  0],
                  [-1, -2, -1]])

def filt(image, k):            # mirror the border instead of zeros
    return correlate2d(image, k, mode='same', boundary='symm')

results = [(camera, 'original'),
           (filt(camera, blur), 'blur'),
           (filt(camera, sobel), 'horizontal edges'),
           (filt(camera, sobel.T), 'vertical edges')]

plt.figure(figsize=(3.6, 3.9))
for i, (im, name) in enumerate(results):
    plt.subplot(2, 2, i + 1)
    plt.imshow(im, cmap='gray')
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: cv_kernels

# %% cv_random
rng = np.random.default_rng(0)

plt.figure(figsize=(3.6, 3.6))
for i in range(9):
    k = rng.uniform(-1, 1, size=(3, 3))
    plt.subplot(3, 3, i + 1)
    plt.imshow(filt(camera, k), cmap='gray')
    plt.axis('off')
plt.show()  # fig: cv_random

# %% cv_loop
def conv(image, kernel):
    kh, kw = kernel.shape
    out = np.zeros((image.shape[0] - kh + 1, image.shape[1] - kw + 1))
    for i in range(out.shape[0]):
        for j in range(out.shape[1]):
            out[i, j] = np.sum(image[i:i + kh, j:j + kw] * kernel)
    return out

z_loop = conv(camera, sobel)
z_scipy = correlate2d(camera, sobel, mode='valid')
print(np.allclose(z_loop, z_scipy))

# %% cv_torch
import torch
import torch.nn.functional as F

x = torch.tensor(camera, dtype=torch.float32)[None, None]  # (1, 1, H, W)
k = torch.tensor(sobel, dtype=torch.float32)[None, None]   # (1, 1, 3, 3)
z_torch = F.conv2d(x, k)
print(x.shape, k.shape, z_torch.shape)
print(np.allclose(z_torch[0, 0].numpy(), z_scipy, atol=1e-5))

# %% _device
device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

# %% cv_timing
import time

def sync():
    if device == 'cuda':
        torch.cuda.synchronize()
    elif device == 'mps':
        torch.mps.synchronize()

kernels = rng.uniform(-1, 1, size=(64, 3, 3))

t = time.time()
conv(camera, kernels[0])
print(f'python loop, 1 kernel:   {time.time() - t:.3f} s')

t = time.time()
for k in kernels:
    correlate2d(camera, k, mode='valid')
print(f'scipy, 64 kernels:       {time.time() - t:.3f} s')

xg = x.to(device)
kg = torch.tensor(kernels, dtype=torch.float32, device=device)[:, None]
F.conv2d(xg, kg)                                  # warm up
sync()
t = time.time()
for _ in range(10):
    F.conv2d(xg, kg)
sync()                                            # wait for the GPU
print(f'pytorch {device}, 64 kernels: {(time.time() - t) / 10:.4f} s')

# %% cv_life
neighbors = np.array([[1, 1, 1],
                      [1, 0, 1],
                      [1, 1, 1]])

def life_step(world):
    n = correlate2d(world, neighbors, mode='same', boundary='wrap')
    return ((n == 3) | ((world == 1) & (n == 2))).astype(int)

world = np.zeros((8, 8), dtype=int)
world[1, 2] = world[2, 3] = world[3, 1] = world[3, 2] = world[3, 3] = 1

plt.figure(figsize=(4.6, 1.0))
for i in range(5):
    plt.subplot(1, 5, i + 1)
    plt.imshow(world, cmap='gray_r', vmin=0, vmax=1)
    plt.title(f'step {i}')
    plt.xticks([])
    plt.yticks([])
    plt.gca().spines[:].set_visible(True)
    world = life_step(world)
plt.show()  # fig: cv_glider

# %% cv_soup
world = (rng.random((100, 100)) < 0.3).astype(int)
plt.figure(figsize=(4.6, 1.6))
for i in range(301):
    if i in (0, 30, 300):
        plt.subplot(1, 3, [0, 30, 300].index(i) + 1)
        plt.imshow(world, cmap='gray_r')
        plt.title(f'step {i}\n{world.sum()} alive')
        plt.axis('off')
    world = life_step(world)
plt.show()  # fig: cv_soup

# %% cv_laplace
laplace = torch.tensor([[0.5,  1.0, 0.5],
                        [1.0, -6.0, 1.0],
                        [0.5,  1.0, 0.5]]) / 2   # neighbors minus center

def lap(u):                                       # u: (1, 1, H, W)
    u = F.pad(u, (1, 1, 1, 1), mode='circular')   # wrap around the edges
    return F.conv2d(u, laplace[None, None])

bump = torch.zeros(1, 1, 5, 5)
bump[0, 0, 2, 2] = 1.0
print(lap(bump)[0, 0])

# %% cv_waves
N = 200
rows, cols = torch.meshgrid(torch.arange(N), torch.arange(N),
                            indexing='ij')
u = torch.zeros(1, 1, N, N)               # height of the sheet
v = torch.zeros(1, 1, N, N)               # how fast it is moving
for r, c in [(60, 60), (130, 80), (90, 150)]:     # three taps
    u[0, 0] += torch.exp(-((rows - r)**2 + (cols - c)**2) / 8.0)

frames = []
for t in range(161):
    v += 0.25 * lap(u)                    # pulled toward the neighbors
    u += v
    if t in (20, 60, 160):
        frames.append(u[0, 0].clone())

plt.figure(figsize=(4.6, 1.6))
for i, (f, t) in enumerate(zip(frames, (20, 60, 160))):
    plt.subplot(1, 3, i + 1)
    plt.imshow(f, cmap='gray', vmin=-0.1, vmax=0.1)
    plt.title(f'step {t}')
    plt.axis('off')
plt.show()  # fig: cv_waves

# %% cv_gray_scott
N = 128
U = torch.ones(1, 1, N, N)                # chemical U fills the dish
V = torch.zeros(1, 1, N, N)
U[..., 54:74, 54:74] = 0.5                # a square of chemical V
V[..., 54:74, 54:74] = 0.25
torch.manual_seed(0)
V += 0.02 * torch.rand(1, 1, N, N)

feed, kill = 0.037, 0.06
for t in range(10_000):
    uvv = U * V * V                       # the reaction: U + 2V -> 3V
    U += 0.16 * lap(U) - uvv + feed * (1 - U)
    V += 0.08 * lap(V) + uvv - (feed + kill) * V

plt.figure(figsize=(2.4, 2.4))
plt.imshow(V[0, 0], cmap='magma')
plt.axis('off')
plt.show()  # fig: cv_gray_scott
