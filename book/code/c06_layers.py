# Chapter: Going deeper

# %% _setup
import numpy as np
import torch
torch.set_printoptions(precision=3, sci_mode=False)

# %% _helpers
import matplotlib.pyplot as plt
from skimage.util import montage

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

def accuracy(scores, Y):
    return (scores.argmax(dim=1) == Y).float().mean().item()

# %% _device
import torch
device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

# %% ly_load
import torch
import torch.nn.functional as F
from torchvision.datasets import MNIST, FashionMNIST

torch.manual_seed(0)

def load(dataset, train):
    ds = dataset('data', train=train, download=True)
    X = ds.data.reshape(-1, 784).float() / 255.0
    return X.to(device), ds.targets.to(device)

X, Y = load(MNIST, train=True)
X_test, Y_test = load(MNIST, train=False)
X_val, Y_val = X[50_000:], Y[50_000:]      # validation split
X, Y = X[:50_000], Y[:50_000]
print(len(X), len(X_val), len(X_test))

# %% ly_collapse
x = torch.randn(5, 784)
W1 = 0.05 * torch.randn(784, 100)
W2 = 0.1 * torch.randn(100, 10)

two_layers = (x @ W1) @ W2
one_layer = x @ (W1 @ W2)
diff = (two_layers - one_layer).abs().max().item()
print(f'largest difference: {diff:.1g}')
print(torch.allclose(two_layers, one_layer, atol=1e-5))

# %% ly_relu
def relu(x):
    return x.clamp(min=0)     # negatives become 0

z = torch.linspace(-3, 3, 7)
print(z)
print(relu(z))

# %% ly_relu_plot
z = torch.linspace(-3, 3, 100)
plt.figure(figsize=(2.4, 1.8))
plt.plot(z, relu(z))
plt.axhline(0, color='gray', linewidth=0.5)
plt.axvline(0, color='gray', linewidth=0.5)
plt.title('relu(x)')
plt.show()  # fig: ly_relu

# %% ly_hinges
def hinge_fit(f, n):
    """Copy f on [0, 6] with n ReLU hinges: a bend at each knot."""
    knots = torch.linspace(0, 6, n + 1)
    slopes = (f(knots[1:]) - f(knots[:-1])) / (knots[1:] - knots[:-1])
    bends = torch.cat([slopes[:1], slopes[1:] - slopes[:-1]])
    return lambda x: f(knots[0]) + sum(
        b * relu(x - k) for b, k in zip(bends, knots[:-1]))

x = torch.linspace(0, 6, 300)
plt.figure(figsize=(4.6, 1.6))
for i, n in enumerate([3, 12]):
    plt.subplot(1, 2, i + 1)
    plt.plot(x, torch.sin(x), color='gray', lw=3, alpha=0.4)
    plt.plot(x, hinge_fit(torch.sin, n)(x))
    plt.title(f'{n} ReLUs')
plt.show()  # fig: ly_hinges

# %% ly_init
x = torch.randn(1000, 256)          # a batch of 1000 random inputs

for name, scale in [('randn', 1.0), ('small', 0.01),
                    ('He', (2 / 256) ** 0.5)]:
    h = x
    spread = []
    for layer_number in range(1, 11):
        h = relu(h @ (scale * torch.randn(256, 256)))
        if layer_number % 2 == 0:       # print every other layer
            spread.append(f'{h.std().item():8.2g}')
    print(f'{name:6}', ' '.join(spread))

# %% ly_layer
def layer(n_in, n_out):
    W = torch.randn(n_in, n_out, device=device) * (2 / n_in) ** 0.5
    b = torch.zeros(n_out, device=device)
    return [W.requires_grad_(), b.requires_grad_()]

w = layer(784, 500) + layer(500, 10)
print([tuple(p.shape) for p in w])

# %% ly_model
def model(x, w):
    x = relu(x @ w[0] + w[1])     # hidden layer
    return x @ w[2] + w[3]        # output layer: raw scores, no relu

# %% ly_train_fn
def evaluate(model, w, X, Y):
    with torch.no_grad():         # no gradients needed to check
        return round(accuracy(model(X, w), Y), 4)

def train(model, w, X, Y, X_val, Y_val,
          steps=5000, lr=0.001, batch_size=128):
    optimizer = torch.optim.Adam(w, lr=lr)
    for step in range(steps + 1):
        x, y = get_batch(X, Y, batch_size)
        loss = F.cross_entropy(model(x, w), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if step % 1000 == 0:
            acc = evaluate(model, w, X_val, Y_val)
            print(step, round(loss.item(), 3), acc)

# %% ly_train
train(model, w, X, Y, X_val, Y_val)

# %% ly_hidden
first = w[0].T[:36].reshape(36, 28, 28).detach().cpu().numpy()
montage_plot(first, size=4.6, grid_shape=(4, 9), symmetric=True)  # fig: ly_hidden

# %% ly_model_deep
def model(x, w):
    n_layers = len(w) // 2              # w holds W, b, W, b, ...
    for i in range(n_layers):
        W, b = w[2 * i], w[2 * i + 1]
        x = x @ W + b
        if i < n_layers - 1:            # relu after all but the last
            x = relu(x)
    return x

# %% ly_deeper
def network(sizes):
    w = []
    for n_in, n_out in zip(sizes[:-1], sizes[1:]):
        w += layer(n_in, n_out)
    return w

w = network([784, 256, 256, 10])
train(model, w, X, Y, X_val, Y_val)

# %% ly_overfit
print('train     ', evaluate(model, w, X, Y))
print('validation', evaluate(model, w, X_val, Y_val))

# %% ly_test
print('test', evaluate(model, w, X_test, Y_test))

# %% ly_fashion
X, Y = load(FashionMNIST, train=True)
X_test, Y_test = load(FashionMNIST, train=False)
X_val, Y_val = X[50_000:], Y[50_000:]
X, Y = X[:50_000], Y[:50_000]

w_linear = network([784, 10])           # no hidden layer at all
train(model, w_linear, X, Y, X_val, Y_val)

# %% ly_fashion_deep
w_deep = network([784, 256, 256, 10])
train(model, w_deep, X, Y, X_val, Y_val)

# %% ly_fashion_gap
print('train     ', evaluate(model, w_deep, X, Y))
print('validation', evaluate(model, w_deep, X_val, Y_val))

# %% ly_nn
import torch.nn as nn

net = nn.Sequential(
    nn.Linear(784, 256), nn.ReLU(),
    nn.Linear(256, 256), nn.ReLU(),
    nn.Linear(256, 10),
).to(device)
print(net)
print(sum(p.numel() for p in net.parameters()),   # weights in net
      sum(p.numel() for p in w_deep))             # and in w_deep

# %% ly_nn_train
optimizer = torch.optim.Adam(net.parameters(), lr=0.001)

for step in range(5001):
    x, y = get_batch(X, Y, 128)
    loss = F.cross_entropy(net(x), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

net.eval()                    # switch to evaluation mode
with torch.no_grad():
    print('validation', round(accuracy(net(X_val), Y_val), 4))
    print('test      ', round(accuracy(net(X_test), Y_test), 4))
