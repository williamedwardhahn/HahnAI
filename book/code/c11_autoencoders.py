# Chapter: Autoencoders

# %% ae_load
import torch
import torch.nn.functional as F
from torchvision.datasets import FashionMNIST
torch.manual_seed(0)

device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

def load(train):
    ds = FashionMNIST('data', train=train, download=True)
    X = ds.data[:, None].float() / 255.0      # add a channel axis
    return X.to(device), ds.targets.to(device)

X, Y = load(train=True)             # (60000, 1, 28, 28), values 0-1
X_test, Y_test = load(train=False)
X, X_val = X[:50000], X[50000:]     # 10,000 held out for validation
Y, Y_val = Y[:50000], Y[50000:]

def get_batch(X, batch_size):
    return X[torch.randint(len(X), (batch_size,), device=X.device)]

print(tuple(X.shape), len(X_val), len(X_test))

# %% _helpers
import numpy as np
import matplotlib.pyplot as plt
from skimage.util import montage
torch.set_printoptions(precision=2, sci_mode=False)

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

# %% ae_linear
def encode(x, W):
    return x.reshape(len(x), 784) @ W          # 784 numbers -> 32

def decode(code, W):
    return (code @ W.T).reshape(-1, 1, 28, 28)  # 32 numbers -> 784

def error(x, y):                                # mean squared error
    return ((x - y) ** 2).mean()

W = (0.01 * torch.randn(784, 32, device=device)).requires_grad_()
optimizer = torch.optim.Adam([W], lr=0.001)

for step in range(5001):
    x = get_batch(X, 128)
    loss = error(decode(encode(x, W), W), x)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 1000 == 0:
        with torch.no_grad():
            val = error(decode(encode(X_val, W), W), X_val)
        print(step, round(loss.item(), 4), round(val.item(), 4))

# %% ae_linear_test
def compare(originals, reconstructions):
    pairs = torch.stack([originals, reconstructions], dim=1)
    montage_plot(pairs.reshape(-1, 28, 28).cpu().numpy(),
                 grid_shape=(len(originals) // 4, 8), size=4.6)

with torch.no_grad():
    x_linear = decode(encode(X_test, W), W)
    print(round(error(x_linear, X_test).item(), 4))
compare(X_test[:16], x_linear[:16])  # fig: ae_linear

# %% ae_linear_weights
weights = W.T.reshape(32, 28, 28).detach().cpu().numpy()
montage_plot(weights, grid_shape=(4, 8), symmetric=True)  # fig: ae_weights

# %% ae_pca
with torch.no_grad():
    data = X.reshape(len(X), 784).cpu()
    _, _, Vt = torch.linalg.svd(data, full_matrices=False)
    V = Vt[:32].T                        # the best 32 directions (PCA)
    Q, _ = torch.linalg.qr(W.cpu())      # the autoencoder's 32 directions
    overlap = torch.linalg.svdvals(Q.T @ V)   # 1 means the same direction
    t = X_test.reshape(len(X_test), 784).cpu()
    pca_error = ((t @ V @ V.T - t) ** 2).mean()
print(round(overlap.mean().item(), 3), round(overlap.min().item(), 3))
print(round(pca_error.item(), 4))

# %% ae_spread
x = torch.zeros(1, 1, 4, 4)
x[0, 0, 1, 1] = 1                               # a single 1
kernel = torch.arange(1., 17).reshape(1, 1, 4, 4)
full = F.conv_transpose2d(x, kernel, stride=2)             # no crop
out = F.conv_transpose2d(x, kernel, stride=2, padding=1)   # cropped
print(full.shape, out.shape)

def show_grid(a, title):
    n = a.shape[-1]
    plt.imshow(a[0, 0], cmap='Greys', vmin=0, vmax=a.max())
    plt.xticks(np.arange(-0.5, n), [])
    plt.yticks(np.arange(-0.5, n), [])
    plt.tick_params(length=0)
    plt.grid(color='0.75', linewidth=0.4)
    plt.title(f'{title}\n{n}x{n}')

plt.figure(figsize=(4.6, 1.6))
for i, (a, title) in enumerate([(x, 'input'), (kernel, 'kernel'),
                                (full, 'padding=0'), (out, 'padding=1')]):
    plt.subplot(1, 4, i + 1)
    show_grid(a, title)
    if i == 2:                                  # the part padding=1 keeps
        plt.gca().add_patch(plt.Rectangle((0.5, 0.5), 8, 8, fill=False,
                                          ec='tab:red', lw=1.5, zorder=3))
plt.show()  # fig: ae_spread

# %% ae_upsample
small = torch.randn(1, 64, 7, 7)
kernel = torch.randn(64, 32, 4, 4)           # (in, out, height, width)
print(F.conv_transpose2d(small, kernel, stride=2, padding=1).shape)

# %% ae_conv_weights
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

w = [conv(1, 32),              # encoder: 1 -> 32 channels, 28 -> 14
     conv(32, 64),             #          32 -> 64 channels, 14 -> 7
     linear(64 * 7 * 7, 32),   #          3136 -> 32 numbers
     linear(32, 64 * 7 * 7),   # decoder: 32 -> 3136 numbers
     conv_t(64, 32),           #          64 -> 32 channels, 7 -> 14
     conv_t(32, 1)]            #          32 -> 1 channel, 14 -> 28

# %% ae_conv_model
def encoder(x, w):
    x = F.relu(F.conv2d(x, w[0], stride=2, padding=1))
    x = F.relu(F.conv2d(x, w[1], stride=2, padding=1))
    return F.linear(x.flatten(start_dim=1), w[2])

def decoder(code, w):
    x = F.relu(F.linear(code, w[3])).reshape(-1, 64, 7, 7)
    x = F.relu(F.conv_transpose2d(x, w[4], stride=2, padding=1))
    return torch.sigmoid(F.conv_transpose2d(x, w[5], stride=2, padding=1))

def autoencoder(x, w):
    return decoder(encoder(x, w), w)

print(encoder(X[:5], w).shape, autoencoder(X[:5], w).shape)

# %% ae_conv_train
optimizer = torch.optim.Adam(w, lr=0.001)

for step in range(5001):
    x = get_batch(X, 128)
    loss = error(autoencoder(x, w), x)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 1000 == 0:
        with torch.no_grad():
            val = error(autoencoder(X_val, w), X_val)
        print(step, round(loss.item(), 4), round(val.item(), 4))

# %% ae_conv_test
with torch.no_grad():
    x_conv = autoencoder(X_test, w)
    print(round(error(x_conv, X_test).item(), 4))
compare(X_test[:16], x_conv[:16])  # fig: ae_conv

# %% ae_probe
def probe(features, n):         # a linear classifier trained on n labels
    with torch.no_grad():
        f = features(X[:n])
        f_val, f_test = features(X_val), features(X_test)
    V = torch.zeros(f.shape[1], 10, device=device, requires_grad=True)
    b = torch.zeros(10, device=device, requires_grad=True)
    optimizer = torch.optim.Adam([V, b], lr=0.01)
    for step in range(500):
        loss = F.cross_entropy(f @ V + b, Y[:n])
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    with torch.no_grad():
        val = ((f_val @ V + b).argmax(dim=1) == Y_val).float().mean()
        test = ((f_test @ V + b).argmax(dim=1) == Y_test).float().mean()
    return round(val.item(), 3), round(test.item(), 3)

pixels = lambda x: x.flatten(start_dim=1)       # 784 numbers
encoded = lambda x: encoder(x, w)               # 32 numbers
for n in [100, 1000]:
    print(n, 'labels, pixels:', probe(pixels, n),
          ' codes:', probe(encoded, n))

# %% ae_blend
with torch.no_grad():
    a, b = encoder(X_test[[0, 2]], w)       # an ankle boot and a trouser
    steps = torch.linspace(0, 1, 8, device=device)[:, None]
    blend = decoder((1 - steps) * a + steps * b, w)
montage_plot(blend[:, 0].cpu().numpy(), grid_shape=(1, 8), size=4.6)  # fig: ae_blend

# %% ae_random
with torch.no_grad():
    codes = encoder(X_val, w)               # (10000, 32)
    mean, std = codes.mean(dim=0), codes.std(dim=0)  # one per dimension
    print(std[:8].cpu())
    random_codes = mean + std * torch.randn(16, 32, device=device)
    fakes = decoder(random_codes, w)
montage_plot(fakes[:, 0].cpu().numpy(), grid_shape=(2, 8), size=4.6)  # fig: ae_random
