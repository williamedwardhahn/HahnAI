# Chapter: Arrays

# %% arr_first
import numpy as np
np.set_printoptions(precision=3, suppress=True)   # tidier printing

a = np.array([1, 2, 3, 4, 5])
print(a)
print(a + 5)
print(a * 2)
print(a.shape, a.dtype)

# %% arr_2d
m = np.array([[1, 2, 3],
              [4, 5, 6]])
print(m)
print(m.shape)
print(m.T)

# %% arr_elementwise
a = np.array([1.0, 2.0, 3.0])
b = np.array([4.0, 5.0, 6.0])
print(a + b)
print(a * b)
print(np.sqrt(b))
print(np.mean(a), np.max(b))

# %% arr_reshape
x = np.arange(12)
print(x)
print(x.reshape(3, 4))
print(x.reshape(2, 2, 3).shape)
print(x.reshape(-1, 6).shape)   # -1 means "work it out for me"

# %% arr_index
m = np.arange(12).reshape(3, 4)
print(m)
print(m[0, 0], m[2, 3])   # single elements: [row, column]
print(m[1])               # a whole row
print(m[:, 2])            # a whole column
print(m[0:2, 1:3])        # rows 0-1, columns 1-2

# %% arr_mask
scores = np.array([3, 8, 1, 9, 4])
print(scores > 4)              # a True/False answer for every element
print(scores[scores > 4])      # keep only the elements marked True

labels = np.array([0, 1, 0, 1, 1])
print(scores[labels == 1])     # select using a condition on another array

both = (scores > 2) & (scores < 9)     # & means "and", | means "or"
print(both, both.mean())       # the mean of True/False is a fraction

# %% arr_fancy
print(scores[[0, 3, 3]])       # pick elements by a list of positions

m = np.arange(12).reshape(3, 4)
print(m[[0, 1, 2], [3, 0, 1]])  # elements (0,3), (1,0) and (2,1)

# %% arr_dot
x = np.array([1.0, 2.0, 3.0])     # an input
w = np.array([0.5, -1.0, 2.0])    # a weight for each input
print(np.sum(x * w))
print(x @ w)

# %% arr_matvec
x = np.array([1.0, 2.0, 3.0])          # 3 inputs
W = np.array([[0.5,  1.0],
              [-1.0, 0.0],
              [2.0,  1.0]])            # 3 inputs -> 2 outputs
print(W.shape)
print(x @ W)

# %% arr_matmul
X = np.array([[1.0, 2.0, 3.0],
              [0.0, 1.0, 0.0],
              [2.0, 2.0, 2.0],
              [1.0, 0.0, -1.0]])      # 4 examples, 3 numbers each
print(X.shape, W.shape)
print(X @ W)
print((X @ W).shape)

# %% arr_shape_error
try:
    W @ X
except ValueError as err:
    print(err)

# %% arr_axis
m = np.array([[1, 2, 3],
              [4, 5, 6]])
print(m.sum())
print(m.sum(axis=0))   # collapse the rows: one total per column
print(m.sum(axis=1))   # collapse the columns: one total per row

# %% arr_argmax
scores = np.array([0.1, 2.3, -1.0, 0.7])
print(np.max(scores), np.argmax(scores))

S = np.array([[0.1, 2.3, -1.0, 0.7],
              [3.0, 0.2,  0.5, 0.1],
              [0.0, 0.1,  0.2, 0.9]])
print(np.argmax(S, axis=1))

# %% arr_broadcast
m = np.array([[1, 2, 3],
              [4, 5, 6]])
print(m * 10)
print(m * np.array([1, 10, 100]))
print(m - m.mean(axis=0))

# %% arr_keepdims
m = np.array([[1.0, 2.0, 3.0],
              [4.0, 5.0, 6.0]])
totals = m.sum(axis=1)
print(totals.shape)
try:
    m / totals
except ValueError as err:
    print(err)

totals = m.sum(axis=1, keepdims=True)
print(totals.shape)
print(m / totals)              # each row now adds up to 1

# %% arr_random
rng = np.random.default_rng(seed=0)
print(rng.random(5))                 # uniform between 0 and 1
print(rng.integers(1, 7, size=10))   # dice: 1 to 6 (7 is excluded)
print(rng.normal(0, 1, size=5))      # bell curve: mean 0, spread 1

# %% arr_hist
import matplotlib.pyplot as plt

samples = rng.normal(0, 1, size=10_000)
plt.hist(samples, bins=60)
plt.xlabel('value')
plt.ylabel('count')
plt.show()  # fig: arr_hist
