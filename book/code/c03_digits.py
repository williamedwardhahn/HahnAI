# Chapter: Digits as vectors

# %% _setup
import numpy as np
import matplotlib.pyplot as plt
np.set_printoptions(linewidth=90, precision=3, suppress=True)

def plot(x, title=None, size=2.6, **kwargs):
    plt.figure(figsize=(size, size))
    plt.imshow(x, cmap='gray', **kwargs)
    plt.axis('off')
    if title:
        plt.title(title)
    plt.show()

# %% dig_load
from torchvision.datasets import MNIST

train_set = MNIST('data', train=True, download=True)
test_set = MNIST('data', train=False, download=True)
print(len(train_set), len(test_set))

# %% dig_arrays
X = train_set.data.numpy()
Y = train_set.targets.numpy()
X_test = test_set.data.numpy()
Y_test = test_set.targets.numpy()

print(X.shape, X.dtype)
print(Y.shape, Y[:10])

# %% dig_one
plot(X[0], title=f'label: {Y[0]}', size=2)  # fig: dig_one

# %% dig_ascii
for row in X[0] // 26:          # squash 0-255 down to the digits 0-9
    print(''.join(str(v) if v else '.' for v in row))

# %% dig_montage
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

montage_plot(X[:36])  # fig: dig_montage
print(Y[:36].reshape(6, 6))

# %% dig_counts
print(np.bincount(Y))

# %% dig_scale
X = X / 255.0
X_test = X_test / 255.0
print(X.dtype, X.min(), X.max())

# %% dig_vector
x = X[0].reshape(784)
print(x.shape)

plt.figure(figsize=(6, 1.6))
plt.plot(x)
plt.xlabel('pixel number')
plt.show()  # fig: dig_vector

# %% dig_matrix
X = X.reshape(len(X), 784)
X_test = X_test.reshape(len(X_test), 784)
print(X.shape, X_test.shape)

# %% dig_means
means = np.array([X[Y == k].mean(axis=0) for k in range(10)])
print(means.shape)
montage_plot(means.reshape(10, 28, 28), grid_shape=(2, 5))  # fig: dig_means

# %% dig_template
scores = X_test @ means.T       # (10000, 784) @ (784, 10)
guesses = np.argmax(scores, axis=1)
print(scores.shape)
print(guesses[:10])
print(Y_test[:10])
print(np.mean(guesses == Y_test))

# %% dig_distance_plain
dists = np.stack([((X_test - m) ** 2).sum(axis=1) for m in means],
                 axis=1)                    # one column per template
guesses = np.argmin(dists, axis=1)
print(np.mean(guesses == Y_test))

# %% dig_distance
dists = ((X_test ** 2).sum(axis=1, keepdims=True)    # |x|^2
         - 2 * X_test @ means.T                     # -2 x.m
         + (means ** 2).sum(axis=1))                # |m|^2
guesses = np.argmin(dists, axis=1)
print(dists.shape)
print(np.mean(guesses == Y_test))

# %% dig_fashion
from torchvision.datasets import FashionMNIST

fashion = FashionMNIST('data', train=True, download=True)
print(fashion.classes)
montage_plot(fashion.data[:36].numpy())  # fig: dig_fashion
