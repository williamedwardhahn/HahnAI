# Chapter: A convolutional network

# %% _setup
import numpy as np
import matplotlib.pyplot as plt
from skimage.util import montage
import torch
torch.set_printoptions(precision=3, sci_mode=False)

device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

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

def get_batch(X, Y, batch_size):
    i = torch.randint(len(X), (batch_size,), device=X.device)
    return X[i], Y[i]

# %% cnn_load
import torch
import torch.nn.functional as F
from torchvision.datasets import FashionMNIST
torch.manual_seed(0)

def load(train):
    ds = FashionMNIST('data', train=train, download=True)
    X = torch.tensor(ds.data.numpy()[:, None] / 255.0,  # channel axis
                     dtype=torch.float32)
    return X.to(device), ds.targets.to(device), ds.classes

X, Y, classes = load(train=True)
X_test, Y_test, _ = load(train=False)

order = torch.randperm(len(X)).to(device)     # shuffle, then set aside
X_val, Y_val = X[order[:5000]], Y[order[:5000]]   # 5,000 for validation
X, Y = X[order[5000:]], Y[order[5000:]]
print(X.shape, X_val.shape, X_test.shape)

# %% cnn_pool
x = torch.tensor([[1., 5., 0., 2.],
                  [3., 2., 1., 1.],
                  [0., 0., 4., 0.],
                  [7., 1., 0., 3.]])
print(F.max_pool2d(x[None, None], 2)[0, 0])

# %% cnn_weights
def conv_layer(n_in, n_out, k=3):
    std = (2 / (n_in * k * k)) ** 0.5
    W = torch.randn(n_out, n_in, k, k, device=device) * std
    b = torch.zeros(n_out, device=device)
    return [W.requires_grad_(), b.requires_grad_()]

def layer(n_in, n_out):
    std = (2 / n_in) ** 0.5
    W = torch.randn(n_out, n_in, device=device) * std
    b = torch.zeros(n_out, device=device)
    return [W.requires_grad_(), b.requires_grad_()]

w = (conv_layer(1, 32) + conv_layer(32, 64)
     + layer(64 * 7 * 7, 128) + layer(128, 10))
w0 = w[0].detach().clone()      # keep a copy of the starting kernels

# %% cnn_model
def model(x, w, verbose=False):
    x = F.relu(F.conv2d(x, w[0], w[1], padding=1))   # 32 maps, 28x28
    x = F.max_pool2d(x, 2)                           # 32 maps, 14x14
    if verbose: print(x.shape)
    x = F.relu(F.conv2d(x, w[2], w[3], padding=1))   # 64 maps, 14x14
    x = F.max_pool2d(x, 2)                           # 64 maps, 7x7
    if verbose: print(x.shape)
    x = x.flatten(start_dim=1)                       # 3136 numbers
    x = F.relu(F.linear(x, w[4], w[5]))              # 128
    if verbose: print(x.shape)
    return F.linear(x, w[6], w[7])                   # 10 scores

print(model(X[:5], w, verbose=True).shape)

# %% cnn_count
print('convolutions:', sum(p.numel() for p in w[:4]))
print('total:       ', sum(p.numel() for p in w))

# %% cnn_predict
def predict(X, batch_size=1000):      # in batches, to save memory
    with torch.no_grad():
        return torch.cat([model(X[i:i + batch_size], w).argmax(dim=1)
                          for i in range(0, len(X), batch_size)])

def accuracy_on(X, Y):
    return (predict(X) == Y).float().mean().item()

# %% cnn_train
optimizer = torch.optim.Adam(w, lr=0.001)

for step in range(6001):
    x, y = get_batch(X, Y, 128)
    loss = F.cross_entropy(model(x, w), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 1000 == 0:
        val_acc = accuracy_on(X_val, Y_val)
        print(step, round(loss.item(), 3), round(val_acc, 4))

# %% cnn_test
print('training:  ', round(accuracy_on(X, Y), 4))
print('validation:', round(accuracy_on(X_val, Y_val), 4))
print('test:      ', round(accuracy_on(X_test, Y_test), 4))

# %% cnn_confusion
guesses = predict(X_test)
confusion = torch.zeros(10, 10, dtype=torch.long)
for actual, guess in zip(Y_test.tolist(), guesses.tolist()):
    confusion[actual, guess] += 1
print(confusion)

# %% cnn_worst
mistakes = confusion.clone()
mistakes.fill_diagonal_(0)
for i in mistakes.flatten().argsort(descending=True)[:4].tolist():
    actual, guess = divmod(i, 10)
    print(f'{classes[actual]:>12} taken for {classes[guess]:<12}'
          f'{mistakes[actual, guess].item()} times')

# %% cnn_kernels
before = w0[:, 0].cpu().numpy()                   # (32, 3, 3)
after = w[0][:, 0].detach().cpu().numpy()
hi = max(np.abs(before).max(), np.abs(after).max())  # zero: middle gray

plt.figure(figsize=(4.6, 1.5))
for i, (k, name) in enumerate([(before, 'before training'),
                               (after, 'after training')]):
    plt.subplot(1, 2, i + 1)                       # the first 8 of 32
    tiled = montage(k[:8], grid_shape=(2, 4), padding_width=1, fill=-hi)
    plt.imshow(tiled, cmap='gray', vmin=-hi, vmax=hi)
    plt.title(name)
    plt.axis('off')
plt.show()  # fig: cnn_kernels

# %% cnn_similarity
def similarity(a, b):         # 1 when two kernels share the same pattern
    a, b = a.flatten(start_dim=1), b.flatten(start_dim=1)
    return (a * b).sum(dim=1) / (a.norm(dim=1) * b.norm(dim=1))

s = similarity(w0, w[0].detach())
print(round(s.mean().item(), 3), round(s.min().item(), 3))

# %% cnn_maps
image = X_test[:1]
with torch.no_grad():
    maps = F.relu(F.conv2d(image, w[0], w[1], padding=1))
print(classes[Y_test[0]], maps.shape)
maps = maps[0].cpu().numpy()                     # (32, 28, 28)
montage_plot(maps, size=4.6, grid_shape=(4, 8))  # fig: cnn_maps

# %% cnn_control
w_trained = w                          # keep the network we trained
w = (conv_layer(1, 32) + conv_layer(32, 64)
     + layer(64 * 7 * 7, 128) + layer(128, 10))
with torch.no_grad():
    w[0] *= 0.1                        # first kernels ten times smaller
start = w[0].detach().clone()
optimizer = torch.optim.Adam(w, lr=0.001)
for step in range(6001):
    x, y = get_batch(X, Y, 128)
    loss = F.cross_entropy(model(x, w), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
s = similarity(start, w[0].detach())
print(round(s.mean().item(), 3), round(s.min().item(), 3))
print('validation', round(accuracy_on(X_val, Y_val), 4))
w = w_trained
