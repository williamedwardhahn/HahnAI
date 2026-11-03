# Chapter: Following the gradient

# %% _setup
import numpy as np
import torch
torch.set_printoptions(precision=3, sci_mode=False)

# %% _montage
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

# %% _device
import torch
device = ('cuda' if torch.cuda.is_available()
          else 'mps' if torch.backends.mps.is_available() else 'cpu')

# %% gr_load
import torch
from torchvision.datasets import MNIST

torch.manual_seed(0)

def load(train):
    ds = MNIST('data', train=train, download=True)
    X = ds.data.reshape(-1, 784).float() / 255.0
    return X.to(device), ds.targets.to(device)

X, Y = load(train=True)
X_test, Y_test = load(train=False)
print(X.shape, X_test.shape, device)

# %% gr_nudge
def f(x):
    return x**2

for h in [0.1, 0.01, 0.001]:               # smaller and smaller nudges
    print(h, round((f(3 + h) - f(3)) / h, 6))

# %% gr_autograd
x = torch.tensor(3.0, requires_grad=True)
y = x ** 2
y.backward()          # work out dy/dx
print(x.grad)         # 2 * x = 6

# %% gr_chain
w = torch.tensor(3.0, requires_grad=True)
x, y = 2.0, 10.0      # one input and the answer we want for it

p = w * x             # prediction: 6
e = p - y             # error: -4
loss = e ** 2         # 16
loss.backward()

by_hand = (2 * e) * 1 * x     # dloss/de * de/dp * dp/dw
print(loss.item(), by_hand.item(), w.grad.item())

# %% gr_value
class Value:
    """A number that remembers how it was made, for backward()."""
    def __init__(self, data, parents=(), slopes=()):
        self.data, self.grad = data, 0.0
        self.parents, self.slopes = parents, slopes  # local derivatives

    def __add__(self, other):
        return Value(self.data + other.data, (self, other), (1.0, 1.0))

    def __mul__(self, other):
        return Value(self.data * other.data, (self, other),
                     (other.data, self.data))

    def backward(self, grad=1.0):
        self.grad += grad
        for parent, slope in zip(self.parents, self.slopes):
            parent.backward(grad * slope)        # the chain rule

# %% gr_value_use
w, x, minus_y = Value(3.0), Value(2.0), Value(-10.0)
e = w * x + minus_y          # error: 6 - 10 = -4
loss = e * e                 # 16
loss.backward()
print(loss.data, w.grad)

# %% gr_descent
x = torch.tensor(-3.0, requires_grad=True)
lr = 0.1                          # learning rate: how big a step

for step in range(31):
    loss = (x - 2) ** 2           # smallest when x = 2
    loss.backward()               # slope is now in x.grad
    if step % 5 == 0:
        print(f'step {step:2}   x = {x.item():7.4f}'
              f'   loss = {loss.item():7.4f}')
    with torch.no_grad():
        x -= lr * x.grad          # step downhill
    x.grad.zero_()                # forget this gradient

# %% gr_descend_fn
def descend(lr, steps, start=-3.0):
    x = torch.tensor(start, requires_grad=True)
    path = []
    for step in range(steps):
        path.append(x.item())
        loss = (x - 2) ** 2
        loss.backward()
        with torch.no_grad():
            x -= lr * x.grad
        x.grad.zero_()
    return path

print([round(v, 2) for v in descend(lr=0.1, steps=8)])
print([round(v, 2) for v in descend(lr=1.1, steps=8)])

# %% gr_descent_plot
fig, axes = plt.subplots(1, 2, figsize=(4.6, 2.0))
for ax, lr in zip(axes, [0.1, 1.1]):
    path = np.array(descend(lr, steps=8))
    z = np.linspace(-16, 20, 200) if lr > 1 else np.linspace(-4, 8, 200)
    ax.plot(z, (z - 2) ** 2, color='gray', linewidth=0.8)
    ax.plot(path, (path - 2) ** 2, 'o-', markersize=3)
    ax.set_title(f'lr = {lr}')
    ax.set_xlabel('x')
axes[0].set_ylabel('loss')
plt.tight_layout()
plt.show()  # fig: gr_descent

# %% gr_explog
x = torch.tensor([-2.0, 0.0, 1.0, 2.0, 5.0])
print(torch.exp(x))                    # always positive, grows fast
p = torch.tensor([1.0, 0.5, 0.1, 0.01, 0.0001])
print(-torch.log(p))                   # 0 when sure, large when not

# %% gr_softmax
def softmax(scores):
    e = torch.exp(scores - scores.max(dim=1, keepdim=True).values)
    return e / e.sum(dim=1, keepdim=True)

scores = torch.tensor([[2.0, 1.0, 0.1],
                       [0.0, 0.0, 5.0]])
p = softmax(scores)
print(p)
print(p.sum(dim=1))

# %% gr_xent
def cross_entropy(scores, labels):
    # the logarithm of the softmax, computed safely
    log_p = scores - scores.logsumexp(dim=1, keepdim=True)
    rows = torch.arange(len(labels), device=labels.device)
    return -log_p[rows, labels].mean()   # one entry from each row

print(cross_entropy(scores, torch.tensor([0, 2])))   # both right
print(cross_entropy(scores, torch.tensor([2, 0])))   # both wrong

# %% gr_xent_check
import torch.nn.functional as F

labels = torch.tensor([0, 2])
print(cross_entropy(scores, labels))
print(F.cross_entropy(scores, labels))

# %% gr_by_hand
x5, y5 = X[:5], Y[:5]                      # five images
W = 0.01 * torch.arange(7840.0, device=device).reshape(784, 10).sin()
# (any small, varied weights will do; these are simply repeatable)
W.requires_grad_()

loss = cross_entropy(x5 @ W, y5)
loss.backward()                            # autograd's answer

p = (x5 @ W).softmax(dim=1)                # probabilities
onehot = F.one_hot(y5, 10).float()
by_hand = x5.T @ (p - onehot) / 5          # the formula: x (p - y)
print((W.grad - by_hand).abs().max().item())

with torch.no_grad():                      # nudge one weight a little
    W2 = W.clone()
    W2[300, 3] += 1e-3
    change = cross_entropy(x5 @ W2, y5) - cross_entropy(x5 @ W, y5)
print(change.item() / 1e-3, by_hand[300, 3].item())

# %% gr_split
X_val, Y_val = X[50_000:], Y[50_000:]   # held back to check progress
X, Y = X[:50_000], Y[:50_000]           # used for training
print(X.shape, X_val.shape)

# %% gr_batch
def get_batch(X, Y, batch_size):
    i = torch.randint(len(X), (batch_size,), device=X.device)
    return X[i], Y[i]

def accuracy(scores, Y):
    return (scores.argmax(dim=1) == Y).float().mean().item()

# %% gr_model
def model(x, w):
    return x @ w[0] + w[1]

w = [(0.01 * torch.randn(784, 10, device=device)).requires_grad_(),
     torch.zeros(10, device=device, requires_grad=True)]

# %% gr_train
lr = 0.5
losses = []

for step in range(3001):
    x, y = get_batch(X, Y, 128)
    loss = cross_entropy(model(x, w), y)
    loss.backward()
    with torch.no_grad():
        for p in w:
            p -= lr * p.grad
            p.grad.zero_()
    losses.append(loss.item())
    if step % 500 == 0:
        with torch.no_grad():
            acc = accuracy(model(X_val, w), Y_val)
        print(step, round(loss.item(), 3), round(acc, 4))

# %% gr_curve
plt.figure(figsize=(4.6, 2.4))
plt.plot(losses, linewidth=0.5)
plt.xlabel('step')
plt.ylabel('loss')
plt.show()  # fig: gr_curve

# %% gr_weights
columns = w[0].T.reshape(10, 28, 28).detach().cpu().numpy()
montage_plot(columns, grid_shape=(2, 5), symmetric=True)  # fig: gr_weights

# %% gr_mistakes
with torch.no_grad():
    guesses = model(X_val, w).argmax(dim=1)
wrong = (guesses != Y_val).nonzero().flatten()[:16]
print((guesses != Y_val).sum().item(), 'mistakes out of', len(Y_val))
print('guessed:', guesses[wrong].tolist())
print('actual: ', Y_val[wrong].tolist())
images = X_val[wrong].reshape(-1, 28, 28).cpu().numpy()
montage_plot(images, size=4.6, grid_shape=(2, 8))  # fig: gr_mistakes

# %% gr_optim
w = [(0.01 * torch.randn(784, 10, device=device)).requires_grad_(),
     torch.zeros(10, device=device, requires_grad=True)]
optimizer = torch.optim.SGD(w, lr=0.5)

for step in range(3001):
    x, y = get_batch(X, Y, 128)
    loss = cross_entropy(model(x, w), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
with torch.no_grad():
    print(round(accuracy(model(X_val, w), Y_val), 4))

# %% gr_adam
w = [(0.01 * torch.randn(784, 10, device=device)).requires_grad_(),
     torch.zeros(10, device=device, requires_grad=True)]
optimizer = torch.optim.Adam(w, lr=0.01)

for step in range(3001):
    x, y = get_batch(X, Y, 128)
    loss = cross_entropy(model(x, w), y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
with torch.no_grad():
    print(round(accuracy(model(X_val, w), Y_val), 4))

# %% gr_test
with torch.no_grad():
    print('test', round(accuracy(model(X_test, w), Y_test), 4))
