# Chapter: Learning by guessing

# %% _setup
import numpy as np
import torch
np.set_printoptions(precision=3, suppress=True)
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

# %% gs_tensor
import torch

t = torch.tensor([1.0, 2.0, 3.0])
print(t * 2)
print(t @ t)
print(t.shape, t.dtype)

# %% gs_numpy
import numpy as np

a = np.arange(6).reshape(2, 3)
t = torch.tensor(a)
print(t)
print(t.numpy())

# %% gs_device
if torch.cuda.is_available():
    device = 'cuda'                     # an NVIDIA graphics card
elif torch.backends.mps.is_available():
    device = 'mps'                      # an Apple-silicon Mac
else:
    device = 'cpu'
print(device)

# %% gs_load
import numpy as np
from torchvision.datasets import MNIST

train_set = MNIST('data', train=True, download=True)
test_set = MNIST('data', train=False, download=True)
X = train_set.data.numpy().reshape(-1, 784) / 255.0
Y = train_set.targets.numpy()
X_test = test_set.data.numpy().reshape(-1, 784) / 255.0
Y_test = test_set.targets.numpy()

# %% gs_to_device
X = torch.tensor(X, dtype=torch.float32, device=device)
Y = torch.tensor(Y, device=device)
X_test = torch.tensor(X_test, dtype=torch.float32, device=device)
Y_test = torch.tensor(Y_test, device=device)
print(X.shape, X.device)

# %% gs_seed
torch.manual_seed(0)    # the same "random" numbers on every run

# %% gs_one_guess
W = torch.randn(784, 10, device=device)

scores = X @ W              # (60000, 784) @ (784, 10)
guesses = scores.argmax(dim=1)
print(guesses[:10].cpu())
print(Y[:10].cpu())
print(round((guesses == Y).float().mean().item(), 4))

# %% gs_accuracy
def matrix_accuracy(W, X, Y):
    guesses = (X @ W).argmax(dim=1)
    return (guesses == Y).float().mean().item()

# %% gs_search
best_acc = 0
for i in range(1000):
    W = torch.randn(784, 10, device=device)
    acc = matrix_accuracy(W, X, Y)
    if acc > best_acc:
        best_acc, W_best = acc, W
        print(i, round(acc, 4))

# %% gs_climb
# a smaller set makes each guess quicker
X_small, Y_small = X[:10_000], Y[:10_000]

W = W_best.clone()
best_acc = matrix_accuracy(W, X_small, Y_small)
step = 0.1

for i in range(20_000):
    W_new = W + step * torch.randn(784, 10, device=device)
    acc = matrix_accuracy(W_new, X_small, Y_small)
    if acc > best_acc:
        W, best_acc = W_new, acc
    if i % 4000 == 0:
        print(i, round(best_acc, 4))
print('final', round(best_acc, 4))

# %% gs_climb_test
print(round(matrix_accuracy(W, X_test, Y_test), 4))

# %% gs_population
N, keep = 100, 10       # population size, number of survivors
M = torch.randn(N, 784, 10, device=device)    # N candidate matrices

for generation in range(1001):
    scores = X_small @ M                          # (N, 10000, 10)
    guesses = scores.argmax(dim=2)                  # (N, 10000)
    fitness = (guesses == Y_small).float().mean(dim=1)
    best = fitness.argsort(descending=True)[:keep]  # the survivors
    parents = M[best]
    children = parents.repeat(N // keep, 1, 1)   # 10 copies of the 10
    noise = torch.randn(N - keep, 784, 10, device=device)
    children[keep:] += 0.05 * noise       # mutate all but the survivors
    M = children
    if generation % 200 == 0:
        print(generation, round(fitness[best[0]].item(), 4))

W_evolved = M[0]
print('test', round(matrix_accuracy(W_evolved, X_test, Y_test), 4))

# %% gs_weights
columns = W_evolved.T.reshape(10, 28, 28).cpu().numpy()
montage_plot(columns, grid_shape=(2, 5), symmetric=True)  # fig: gs_weights
