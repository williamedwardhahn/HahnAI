# Chapter: Generative adversarial networks

# %% gan_data
import torch
import torch.nn.functional as F
from torchvision.datasets import FashionMNIST
torch.manual_seed(0)

device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

def load(train):                    # sneakers only, pixels in -1..1
    ds = FashionMNIST('data', train=train, download=True)
    X = ds.data[ds.targets == 7][:, None].float() / 255.0
    return (X * 2 - 1).to(device)

X = load(train=True)
X_test = load(train=False)          # only for a check at the very end
print(FashionMNIST.classes[7], X.shape, X_test.shape)
print(X.min().item(), X.max().item())

def get_batch(batch_size):
    return X[torch.randint(len(X), (batch_size,), device=device)]

# %% _helpers
import numpy as np
import matplotlib.pyplot as plt
from skimage.util import montage
torch.set_printoptions(precision=3, sci_mode=False)

def montage_plot(images, size=3.2, grid_shape=None, symmetric=False):
    images = np.asarray(images)
    lo, hi = images.min(), images.max()
    if symmetric:                       # zero is drawn as middle gray
        hi = np.abs(images).max()
        lo = -hi
    tiled = montage(images, grid_shape=grid_shape,
                    padding_width=1, fill=lo)
    plt.figure(figsize=(size, size * tiled.shape[0] / tiled.shape[1]))
    plt.imshow(tiled, cmap='gray', vmin=lo, vmax=hi)
    plt.axis('off')
    plt.show()

def conv(n_in, n_out, k=4):                 # (out, in, k, k)
    std = (2 / (n_in * k * k)) ** 0.5
    W = torch.randn(n_out, n_in, k, k, device=device) * std
    return W.requires_grad_()

def conv_t(n_in, n_out, k=4):               # transposed: (in, out, k, k)
    fan_in = n_in * k * k // 4      # stride 2: each output gets 1/4
    std = (2 / fan_in) ** 0.5
    W = torch.randn(n_in, n_out, k, k, device=device) * std
    return W.requires_grad_()

def linear(n_in, n_out):                    # (out, in)
    std = (2 / n_in) ** 0.5
    W = torch.randn(n_out, n_in, device=device) * std
    return W.requires_grad_()

# %% gan_weights
latent_size = 64

d = [conv(1, 64),                 # discriminator: 28 -> 14
     conv(64, 128),               #                14 -> 7
     linear(128 * 7 * 7, 1)]      #                6272 -> 1 score

g = [linear(latent_size, 128 * 7 * 7),  # generator: 64 -> 6272
     conv_t(128, 64),                   #            7 -> 14
     conv_t(64, 1)]                     #            14 -> 28

# %% gan_models
def D(x, d):
    x = F.leaky_relu(F.conv2d(x, d[0], stride=2, padding=1), 0.2)
    x = F.leaky_relu(F.conv2d(x, d[1], stride=2, padding=1), 0.2)
    return torch.sigmoid(F.linear(x.flatten(start_dim=1), d[2]))

def G(z, g):
    x = F.relu(F.linear(z, g[0])).reshape(-1, 128, 7, 7)
    x = F.relu(F.conv_transpose2d(x, g[1], stride=2, padding=1))
    return torch.tanh(F.conv_transpose2d(x, g[2], stride=2, padding=1))

z = torch.randn(5, latent_size, device=device)
print(G(z, g).shape, D(G(z, g), d).shape)

# %% gan_setup
batch_size = 64
real = torch.ones(batch_size, 1, device=device)    # target: "real"
fake = torch.zeros(batch_size, 1, device=device)   # target: "fake"

d_optimizer = torch.optim.Adam(d, lr=0.0002, betas=(0.5, 0.999))
g_optimizer = torch.optim.Adam(g, lr=0.0002, betas=(0.5, 0.999))

fixed_z = torch.randn(16, latent_size, device=device)  # to watch progress

# %% gan_train
history, snapshots = [], {}

for step in range(6001):
    # 1. Teach the discriminator: real images -> 1, generated -> 0
    images = get_batch(batch_size)
    z = torch.randn(batch_size, latent_size, device=device)
    fakes = G(z, g).detach()             # don't update G in this step
    d_loss = (F.binary_cross_entropy(D(images, d), real)
              + F.binary_cross_entropy(D(fakes, d), fake))
    d_optimizer.zero_grad()
    d_loss.backward()
    d_optimizer.step()

    # 2. Teach the generator: make D say "real" for generated images
    z = torch.randn(batch_size, latent_size, device=device)
    g_loss = F.binary_cross_entropy(D(G(z, g), d), real)
    g_optimizer.zero_grad()
    g_loss.backward()
    g_optimizer.step()

    history.append((d_loss.item(), g_loss.item()))
    if step in (0, 200, 1000, 6000):
        with torch.no_grad():
            snapshots[step] = G(fixed_z, g)[:, 0].cpu().numpy()
    if step % 1000 == 0:
        print(step, round(d_loss.item(), 3), round(g_loss.item(), 3))

# %% gan_progress
plt.figure(figsize=(4.6, 1.4))
for i, (step, images) in enumerate(snapshots.items()):
    plt.subplot(1, 4, i + 1)
    plt.imshow(montage(images, padding_width=1, fill=-1),
               cmap='gray', vmin=-1, vmax=1)
    plt.title(f'step {step}')
    plt.axis('off')
plt.show()  # fig: gan_progress

# %% gan_losses
d_hist, g_hist = np.array(history).T
print('discriminator:', round(d_hist[3000:].mean(), 2),
      ' at chance:', round(2 * np.log(2), 2))
print('generator:    ', round(g_hist[3000:].mean(), 2),
      ' at chance:', round(np.log(2), 2))

def smooth(h, n=100):                       # moving average of n steps
    return np.convolve(h, np.ones(n) / n, mode='valid')

plt.figure(figsize=(4.6, 2.4))
plt.plot(smooth(d_hist), 'C0-', label='discriminator')
plt.plot(smooth(g_hist), 'C1--', label='generator')
for y, style, text in [(2 * np.log(2), '-', '2 ln 2'),
                       (np.log(2), '--', 'ln 2')]:
    plt.axhline(y, color='gray', linestyle=style, linewidth=0.6)
    plt.text(len(history), y, text, ha='right', va='bottom')
plt.xlabel('step')
plt.ylabel('loss (average of 100 steps)')
plt.legend()
plt.show()  # fig: gan_losses

# %% gan_samples
with torch.no_grad():
    z = torch.randn(36, latent_size, device=device)
    samples = G(z, g)
montage_plot(samples[:, 0].cpu().numpy(), size=3.2)  # fig: gan_samples

# %% gan_judge
with torch.no_grad():
    print('real, training:', round(D(X[:1000], d).mean().item(), 3))
    print('real, test:    ', round(D(X_test, d).mean().item(), 3))
    print('fake:          ', round(D(samples, d).mean().item(), 3))

# %% gan_nearest
with torch.no_grad():
    many = G(torch.randn(1000, latent_size, device=device), g)
    dist = torch.cdist(many.flatten(1), X.flatten(1))   # (1000, 6000)
    test = torch.cdist(X_test.flatten(1), X.flatten(1))
    print('fakes:    ', round(dist.min(dim=1).values.median().item(), 2))
    print('real test:', round(test.min(dim=1).values.median().item(), 2))
    nearest = X[dist[:8].argmin(dim=1)]       # closest training images
pairs = torch.cat([many[:8], nearest])[:, 0].cpu().numpy()
montage_plot(pairs, grid_shape=(2, 8), size=4.6)  # fig: gan_nearest

# %% gan_walk
with torch.no_grad():
    flat = samples.flatten(start_dim=1)
    far = torch.cdist(flat, flat).argmax().item()   # most different pair
    a, b = z[far // len(z)], z[far % len(z)]
    t = torch.linspace(0, 1, 8, device=device)[:, None]
    walk = G((1 - t) * a + t * b, g)            # blend the latent vectors
    ends = G(torch.stack([a, b]), g)
    t = t[:, :, None, None]
    fade = (1 - t) * ends[0] + t * ends[1]      # blend the pixels
both = torch.cat([walk, fade])[:, 0].cpu().numpy()
montage_plot(both, grid_shape=(2, 8), size=4.6)  # fig: gan_walk

# %% gan_walk_middle
middle = [both[3], both[8 + 3]]             # frame 4 of each row
montage_plot(middle, grid_shape=(1, 2), size=2.6)  # fig: gan_middle
